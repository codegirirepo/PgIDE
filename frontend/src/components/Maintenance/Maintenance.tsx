import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { RefreshCw, Loader2, Wrench, Play } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

export default function Maintenance() {
  const [connId, setConnId] = useConnectionId();
  const [tables, setTables] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    if (!connId) return;
    setLoading(true); setError('');
    try {
      const stats = await api.getTableStats(connId);
      setTables(stats.tables);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [connId]);

  useEffect(() => { load(); }, [load]);

  const run = async (action: 'vacuum' | 'reindex' | 'cluster' | 'analyze', schema: string, table: string) => {
    if (!connId) return;
    const key = `${action}-${schema}.${table}`;
    setRunning(key); setMessage(''); setError('');
    try {
      let res;
      if (action === 'vacuum') res = await api.vacuumTable(connId, schema, table);
      else res = await api.runMaintenance(connId, action, schema, table);
      setMessage(res.message);
      load();
    } catch (e: any) { setError(e.message); }
    setRunning(null);
  };

  const filtered = tables.filter(t =>
    !filter || `${t.schema}.${t.table}`.toLowerCase().includes(filter.toLowerCase())
  );

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Wrench className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Maintenance</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        <input placeholder="Filter tables..." value={filter} onChange={e => setFilter(e.target.value)}
          className="ml-2 h-6 w-48 rounded border px-2 text-xs bg-background" />
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      {message && <div className="px-3 py-1 text-xs text-green-500">{message}</div>}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card border-b">
            <tr>
              {['Table','Live Rows','Dead Rows','Bloat %','Last Vacuum','Last Analyze','Actions'].map(h =>
                <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => {
              const key = `${t.schema}.${t.table}`;
              const bloatHigh = Number(t.dead_pct) > 20;
              return (
                <tr key={key} className={`border-b hover:bg-accent/50 ${bloatHigh ? 'bg-destructive/5' : ''}`}>
                  <td className="px-2 py-1 font-medium">{key}</td>
                  <td className="px-2 py-1 font-mono">{Number(t.live_rows).toLocaleString()}</td>
                  <td className="px-2 py-1 font-mono">{Number(t.dead_rows).toLocaleString()}</td>
                  <td className={`px-2 py-1 font-mono ${bloatHigh ? 'text-destructive font-bold' : ''}`}>{t.dead_pct}%</td>
                  <td className="px-2 py-1 text-[10px]">{t.last_autovacuum ? new Date(t.last_autovacuum).toLocaleString() : t.last_vacuum ? new Date(t.last_vacuum).toLocaleString() : '—'}</td>
                  <td className="px-2 py-1 text-[10px]">{t.last_autoanalyze ? new Date(t.last_autoanalyze).toLocaleString() : t.last_analyze ? new Date(t.last_analyze).toLocaleString() : '—'}</td>
                  <td className="px-2 py-1">
                    <div className="flex gap-1">
                      {(['vacuum', 'analyze', 'reindex', 'cluster'] as const).map(action => {
                        const actionKey = `${action}-${key}`;
                        return (
                          <button key={action} onClick={() => run(action, t.schema, t.table)}
                            disabled={running === actionKey}
                            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 hover:bg-accent border text-[10px] disabled:opacity-50 capitalize">
                            {running === actionKey ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Play className="h-2.5 w-2.5" />}
                            {action}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">No tables found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
