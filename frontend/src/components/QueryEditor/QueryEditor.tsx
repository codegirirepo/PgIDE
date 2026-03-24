import { useRef, useEffect, useCallback, useState } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import { analyzeSQL } from '@/services/pgvector/pgvectorAnalyzer';
import type { AutocompleteData } from '@/types';
import { format } from 'sql-formatter';
import { Play, Plus, X, Square, Loader2, ChevronDown, Plug, Database, AlignLeft } from 'lucide-react';
import { useShortcutStore } from '@/store/useShortcutStore';

let autocompleteCache: Record<string, AutocompleteData> = {};

export default function QueryEditor({ onOpenConnectionManager }: { onOpenConnectionManager?: () => void }) {
  const { tabs, activeTabId, addTab, removeTab, setActiveTab, updateTab, activeConnectionId, connections, addHistory, setConnectionStatus, setActiveConnection } = useAppStore();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [connDropdownOpen, setConnDropdownOpen] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeTab = tabs.find(t => t.id === activeTabId);

  // Close dropdown on outside click
  useEffect(() => {
    if (!connDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setConnDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [connDropdownOpen]);

  const handleQuickConnect = async (connId: string) => {
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    if (conn.connected) {
      // Already connected — just assign to this tab
      if (activeTab) updateTab(activeTab.id, { connectionId: connId });
      setActiveConnection(connId);
      setConnDropdownOpen(false);
      return;
    }
    // Need to connect first
    setConnecting(connId);
    try {
      const res = await api.connect(connId);
      if (res.success) {
        setConnectionStatus(connId, true);
        setActiveConnection(connId);
        if (activeTab) updateTab(activeTab.id, { connectionId: connId });
      }
    } catch (e: any) {
      alert(e.message);
    }
    setConnecting(null);
    setConnDropdownOpen(false);
  };

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
      run: () => executeCurrentQuery(),
    });

    editor.addAction({
      id: 'format-sql',
      label: 'Format SQL',
      keybindings: [monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF],
      run: () => formatSQL(),
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

  const executeCurrentQuery = useCallback(async () => {
    const state = useAppStore.getState();
    const tab = state.tabs.find(t => t.id === state.activeTabId);
    if (!tab || !tab.connectionId) return;

    let sql = tab.sql.trim();
    if (editorRef.current) {
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

  const formatSQL = useCallback(() => {
    if (!editorRef.current || !activeTabId) return;
    const editor = editorRef.current;
    const selection = editor.getSelection();
    const selectedText = editor.getModel()?.getValueInRange(selection);

    try {
      if (selectedText?.trim()) {
        const formatted = format(selectedText, { language: 'postgresql', tabWidth: 2, keywordCase: 'upper' });
        editor.executeEdits('format', [{ range: selection, text: formatted }]);
      } else {
        const fullText = editor.getValue();
        if (!fullText.trim()) return;
        const formatted = format(fullText, { language: 'postgresql', tabWidth: 2, keywordCase: 'upper' });
        updateTab(activeTabId, { sql: formatted });
      }
    } catch { /* ignore parse errors */ }
  }, [activeTabId, updateTab]);

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
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setConnDropdownOpen(v => !v)}
              className={`flex items-center gap-1 text-xs rounded px-1.5 py-0.5 ${
                activeTab?.connectionId
                  ? 'text-muted-foreground hover:bg-accent'
                  : 'text-yellow-500 hover:bg-yellow-500/10 border border-yellow-500/30'
              }`}
            >
              <Database className="h-3 w-3" />
              {activeTab?.connectionId ? connName : 'No Connection'}
              <ChevronDown className="h-3 w-3" />
            </button>
            {connDropdownOpen && (
              <div className="absolute top-full left-0 z-50 mt-1 w-56 rounded-md border bg-popover shadow-lg">
                {connections.length === 0 ? (
                  <button
                    onClick={() => { setConnDropdownOpen(false); onOpenConnectionManager?.(); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent"
                  >
                    <Plus className="h-3 w-3" /> Add a connection…
                  </button>
                ) : (
                  <>
                    <div className="px-3 py-1.5 text-[10px] text-muted-foreground font-medium border-b">Select Connection</div>
                    <div className="max-h-48 overflow-auto py-1">
                      {connections.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleQuickConnect(c.id)}
                          disabled={connecting === c.id}
                          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
                        >
                          <span className={`h-2 w-2 rounded-full shrink-0 ${c.connected ? 'bg-green-500' : 'bg-gray-400'}`} />
                          <span className="truncate flex-1 text-left">{c.name}</span>
                          {connecting === c.id ? (
                            <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                          ) : !c.connected ? (
                            <Plug className="h-3 w-3 text-muted-foreground shrink-0" />
                          ) : activeTab?.connectionId === c.id ? (
                            <span className="text-[10px] text-green-500">active</span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                    <div className="border-t">
                      <button
                        onClick={() => { setConnDropdownOpen(false); onOpenConnectionManager?.(); }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-muted-foreground"
                      >
                        <Plus className="h-3 w-3" /> Manage connections…
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={formatSQL}
            className="flex items-center gap-1 rounded px-2.5 py-1 text-xs hover:bg-accent text-muted-foreground"
            title="Format SQL (Shift+Alt+F)"
          >
            <AlignLeft className="h-3 w-3" /> Format
          </button>
          <span className="text-xs text-muted-foreground ml-auto">{useShortcutStore.getState().getKeys('executeQuery')} to execute | Shift+Alt+F to format</span>
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
