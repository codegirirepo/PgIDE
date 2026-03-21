import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { History, Search, Play, Trash2, Clock, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function QueryHistory({ onClose }: { onClose: () => void }) {
  const { history, clearHistory, tabs, activeTabId, updateTab, addTab, activeConnectionId } = useAppStore();
  const [search, setSearch] = useState('');

  const filtered = search
    ? history.filter(h => h.sql.toLowerCase().includes(search.toLowerCase()))
    : history;

  const rerun = (sql: string, connectionId: string) => {
    if (activeTabId) {
      updateTab(activeTabId, { sql, connectionId });
    } else {
      addTab(connectionId || activeConnectionId);
      setTimeout(() => {
        const tabId = useAppStore.getState().activeTabId;
        if (tabId) updateTab(tabId, { sql, connectionId });
      }, 0);
    }
    onClose();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="flex items-center gap-2 text-sm font-medium"><History className="h-4 w-4" /> Query History</h3>
        <button onClick={clearHistory} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10">
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      </div>
      <div className="flex items-center gap-1 border-b px-3 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search history..."
          className="h-6 flex-1 bg-transparent text-xs focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-auto">
        {filtered.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">No history entries</p>
        )}
        {filtered.map(entry => (
          <div key={entry.id} className="group border-b px-3 py-2 hover:bg-accent/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {new Date(entry.timestamp).toLocaleString()}
                <span>({entry.duration}ms)</span>
                {entry.error ? (
                  <span className="flex items-center gap-0.5 text-destructive"><AlertCircle className="h-3 w-3" /> Error</span>
                ) : (
                  <span className="flex items-center gap-0.5 text-green-500"><CheckCircle2 className="h-3 w-3" /> {entry.rowCount} rows</span>
                )}
              </div>
              <button
                onClick={() => rerun(entry.sql, entry.connectionId)}
                className="rounded p-1 opacity-0 group-hover:opacity-100 hover:bg-primary/20"
                title="Re-run"
              >
                <Play className="h-3 w-3" />
              </button>
            </div>
            <pre className="mt-1 max-h-[60px] overflow-hidden text-xs font-mono text-foreground/80 truncate">{entry.sql}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
