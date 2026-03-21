import { useState } from 'react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import type { IndexSuggestion } from '@/types';
import { Search, Loader2, AlertTriangle, Copy, Check, Lightbulb } from 'lucide-react';

export default function IndexAdvisor() {
  const activeTab = useAppStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const updateTab = useAppStore(s => s.updateTab);
  const [suggestions, setSuggestions] = useState<IndexSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const analyze = async () => {
    if (!activeTab?.connectionId || !activeTab.sql.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.getIndexAdvice(activeTab.connectionId, activeTab.sql);
      setSuggestions(result.suggestions);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  const copySQL = (sql: string, id: string) => {
    navigator.clipboard.writeText(sql);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const applyToEditor = (sql: string) => {
    if (activeTab) {
      updateTab(activeTab.id, { sql: activeTab.sql + '\n\n' + sql });
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Lightbulb className="h-4 w-4 text-yellow-500" />
        <span className="text-sm font-medium">Index Advisor</span>
        <button
          onClick={analyze}
          disabled={loading || !activeTab?.connectionId}
          className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 ml-auto"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
          Analyze Query
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {error && <div className="text-destructive text-sm mb-3">{error}</div>}

        {!loading && suggestions.length === 0 && !error && (
          <div className="text-center text-sm text-muted-foreground py-8">
            {activeTab?.sql.trim() ? 'Click "Analyze Query" to get index suggestions' : 'Write a query first, then analyze it for index recommendations'}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">{suggestions.length} suggestion(s) found</div>
            {suggestions.map((s, i) => (
              <div key={i} className="rounded-lg border p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{s.table}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{s.reason}</div>
                    <div className="mt-2 rounded bg-muted p-2 font-mono text-xs">{s.createSql}</div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => copySQL(s.createSql, `idx-${i}`)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent"
                      >
                        {copied === `idx-${i}` ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        Copy
                      </button>
                      <button
                        onClick={() => applyToEditor(s.createSql)}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary"
                      >
                        Add to Editor
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {suggestions.length === 0 && !loading && activeTab?.sql.trim() && !error && (
          <div className="flex items-center gap-2 text-green-500 text-sm py-4">
            <Check className="h-4 w-4" /> No index improvements suggested — query plan looks good!
          </div>
        )}
      </div>
    </div>
  );
}
