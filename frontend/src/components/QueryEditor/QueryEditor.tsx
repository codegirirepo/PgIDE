import { useRef, useEffect, useCallback } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import { analyzeSQL } from '@/services/pgvector/pgvectorAnalyzer';
import type { AutocompleteData } from '@/types';
import { Play, Plus, X, Square, Loader2 } from 'lucide-react';

let autocompleteCache: Record<string, AutocompleteData> = {};

export default function QueryEditor() {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab, updateTab, activeConnectionId, connections, addHistory } = useAppStore();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);

  const activeTab = tabs.find(t => t.id === activeTabId);

  const registerAutocomplete = useCallback(async (monaco: any) => {
    if (!activeConnectionId) return;
    if (autocompleteCache[activeConnectionId]) return;

    try {
      const data = await api.getAutocomplete(activeConnectionId);
      autocompleteCache[activeConnectionId] = data;

      monaco.languages.registerCompletionItemProvider('sql', {
        provideCompletionItems: () => {
          const suggestions: any[] = [];
          const kind = monaco.languages.CompletionItemKind;

          data.tables.forEach(t => {
            suggestions.push({
              label: t.name,
              kind: t.type === 'view' ? kind.Interface : kind.Class,
              insertText: `"${t.schema}"."${t.name}"`,
              detail: `${t.type} (${t.schema})`,
            });
          });
          data.columns.forEach(c => {
            suggestions.push({
              label: c.name,
              kind: kind.Field,
              insertText: `"${c.name}"`,
              detail: `${c.data_type} — ${c.table_name}`,
            });
          });
          data.functions.forEach(f => {
            suggestions.push({
              label: f.name,
              kind: kind.Function,
              insertText: `${f.name}()`,
              detail: `function (${f.schema})`,
            });
          });

          // pgvector completions
          suggestions.push(
            { label: 'vector', kind: kind.TypeParameter, insertText: 'vector(${1:1536})', insertTextRules: 4, detail: 'pgvector data type' },
            { label: 'CREATE EXTENSION vector', kind: kind.Snippet, insertText: 'CREATE EXTENSION IF NOT EXISTS vector;', detail: 'Install pgvector' },
            { label: 'hnsw index', kind: kind.Snippet, insertText: 'CREATE INDEX ON ${1:table} USING hnsw (${2:column} vector_cosine_ops)\n  WITH (m = 16, ef_construction = 64);', insertTextRules: 4, detail: 'HNSW vector index' },
            { label: 'ivfflat index', kind: kind.Snippet, insertText: 'CREATE INDEX ON ${1:table} USING ivfflat (${2:column} vector_cosine_ops)\n  WITH (lists = ${3:100});', insertTextRules: 4, detail: 'IVFFlat vector index' },
            { label: 'vector similarity search', kind: kind.Snippet, insertText: 'SELECT *, ${1:embedding} <=> $${2:1} AS distance\nFROM ${3:table}\nORDER BY ${1:embedding} <=> $${2:1}\nLIMIT ${4:10};', insertTextRules: 4, detail: 'Cosine similarity search' },
            { label: 'vector_cosine_ops', kind: kind.Keyword, insertText: 'vector_cosine_ops', detail: 'Cosine distance operator class' },
            { label: 'vector_l2_ops', kind: kind.Keyword, insertText: 'vector_l2_ops', detail: 'L2/Euclidean distance operator class' },
            { label: 'vector_ip_ops', kind: kind.Keyword, insertText: 'vector_ip_ops', detail: 'Inner product operator class' },
          );

          return { suggestions };
        },
      });
    } catch { /* ignore */ }
  }, [activeConnectionId]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.addAction({
      id: 'execute-query',
      label: 'Execute Query',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => executeCurrentQuery(),
    });

    editor.addAction({
      id: 'execute-selected',
      label: 'Execute Selected',
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
      run: () => executeCurrentQuery(true),
    });

    registerAutocomplete(monaco);
  };

  useEffect(() => {
    if (monacoRef.current && activeConnectionId) {
      registerAutocomplete(monacoRef.current);
    }
  }, [activeConnectionId, registerAutocomplete]);

  // pgvector inline hints
  useEffect(() => {
    if (!monacoRef.current || !editorRef.current) return;
    const model = editorRef.current.getModel();
    if (!model) return;
    const sql = activeTab?.sql || '';
    const timer = setTimeout(() => {
      if (!/vector|<->|<#>|<=>|embedding|hnsw|ivfflat/i.test(sql)) {
        monacoRef.current.editor.setModelMarkers(model, 'pgvector', []);
        return;
      }
      const hints = analyzeSQL(sql);
      const markers = hints
        .filter(h => h.type === 'warning')
        .map(h => {
          // Find the relevant line
          let line = 1;
          if (h.category === 'query' && /LIMIT/i.test(h.message)) {
            // Find the distance operator line
            const lines = sql.split('\n');
            const idx = lines.findIndex(l => /<->|<#>|<=>/g.test(l));
            if (idx >= 0) line = idx + 1;
          } else if (h.category === 'dimensions') {
            const lines = sql.split('\n');
            const idx = lines.findIndex(l => /vector\s*\(/i.test(l));
            if (idx >= 0) line = idx + 1;
          }
          return {
            startLineNumber: line, startColumn: 1,
            endLineNumber: line, endColumn: model.getLineMaxColumn(line),
            message: `💡 pgvector: ${h.message}`,
            severity: monacoRef.current.MarkerSeverity.Warning,
          };
        });
      monacoRef.current.editor.setModelMarkers(model, 'pgvector', markers);
    }, 800);
    return () => clearTimeout(timer);
  }, [activeTab?.sql]);

  const executeCurrentQuery = useCallback(async (selectedOnly = false) => {
    const state = useAppStore.getState();
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (!tab || !tab.connectionId) return;

    let sql = tab.sql.trim();
    if (selectedOnly && editorRef.current) {
      const selection = editorRef.current.getModel()?.getValueInRange(editorRef.current.getSelection());
      if (selection?.trim()) sql = selection.trim();
    }
    if (!sql) return;

    updateTab(tab.id, { isExecuting: true, batchResult: null, activeResultIndex: 0, lastExecutedSql: sql, loadedOffset: 0 });

    try {
      const batch = await api.executeQuery(tab.connectionId, sql, 0, 1000);
      // Default to the last result that has rows, or the first one with an error
      let defaultIdx = 0;
      const selectIdx = batch.results.findIndex(r => r.columns.length > 0);
      if (selectIdx >= 0) defaultIdx = selectIdx;
      const errorIdx = batch.results.findIndex(r => r.error);
      if (errorIdx >= 0) defaultIdx = errorIdx;

      updateTab(tab.id, { isExecuting: false, batchResult: batch, activeResultIndex: defaultIdx, loadedOffset: 1000 });

      const totalRows = batch.results.reduce((sum, r) => sum + r.rowCount, 0);
      const firstError = batch.results.find(r => r.error);
      addHistory({
        sql,
        connectionId: tab.connectionId,
        timestamp: Date.now(),
        duration: batch.totalDuration,
        rowCount: totalRows,
        error: firstError?.error,
      });

      // Highlight error line in editor
      if (firstError?.error && monacoRef.current && editorRef.current) {
        const match = firstError.error.match(/line (\d+)/i);
        if (match) {
          const line = parseInt(match[1], 10);
          const monaco = monacoRef.current;
          const model = editorRef.current.getModel();
          if (model) {
            monaco.editor.setModelMarkers(model, 'pgide', [{
              startLineNumber: line, startColumn: 1,
              endLineNumber: line, endColumn: model.getLineMaxColumn(line),
              message: firstError.error,
              severity: monaco.MarkerSeverity.Error,
            }]);
          }
        }
      } else if (editorRef.current && monacoRef.current) {
        monacoRef.current.editor.setModelMarkers(editorRef.current.getModel(), 'pgide', []);
      }
    } catch (e: any) {
      updateTab(tab.id, {
        isExecuting: false,
        batchResult: {
          queryId: '',
          results: [{ queryId: '', columns: [], rows: [], rowCount: 0, command: '', duration: 0, error: e.message }],
          totalDuration: 0,
        },
        activeResultIndex: 0,
      });
    }
  }, [updateTab, addHistory]);

  const connName = activeTab?.connectionId
    ? connections.find(c => c.id === activeTab.connectionId)?.name || 'Unknown'
    : 'No connection';

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center border-b bg-card">
        <div className="flex flex-1 overflow-x-auto">
          {tabs.map(tab => (
            <div
              key={tab.id}
              className={`group flex items-center gap-1.5 border-r px-3 py-1.5 text-xs cursor-pointer shrink-0 ${
                tab.id === activeTabId ? 'bg-background text-foreground' : 'text-muted-foreground hover:bg-accent'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="max-w-[120px] truncate">{tab.title}</span>
              {tab.isExecuting && <Loader2 className="h-3 w-3 animate-spin" />}
              <button
                className="ml-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/20"
                onClick={e => { e.stopPropagation(); removeTab(tab.id); }}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => addTab(activeConnectionId)} className="shrink-0 p-1.5 hover:bg-accent" title="New Tab">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Toolbar */}
      {activeTab && (
        <div className="flex items-center gap-2 border-b px-2 py-1">
          <button
            onClick={() => executeCurrentQuery()}
            disabled={activeTab.isExecuting || !activeTab.connectionId}
            className="flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50"
          >
            {activeTab.isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
            Execute
          </button>
          {activeTab.isExecuting && (
            <button
              onClick={() => {
                if (activeTab.batchResult?.queryId) api.cancelQuery(activeTab.batchResult.queryId);
              }}
              className="flex items-center gap-1 rounded bg-destructive px-2.5 py-1 text-xs text-destructive-foreground hover:bg-destructive/90"
            >
              <Square className="h-3 w-3" /> Cancel
            </button>
          )}
          <span className="text-xs text-muted-foreground">Connected: {connName}</span>
          <span className="text-xs text-muted-foreground ml-auto">Ctrl+Enter to execute | Ctrl+Shift+Enter for selection</span>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-0">
        {activeTab ? (
          <Editor
            language="sql"
            theme={useAppStore.getState().theme === 'dark' ? 'vs-dark' : 'vs'}
            value={activeTab.sql}
            onChange={val => updateTab(activeTab.id, { sql: val || '' })}
            onMount={handleEditorMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              suggestOnTriggerCharacters: true,
              quickSuggestions: true,
              tabSize: 2,
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Open a new tab to start writing queries
          </div>
        )}
      </div>
    </div>
  );
}
