import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { RefreshCw, XCircle, StopCircle, Loader2 } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

export default function ActiveSessions() {
  const [connId, setConnId] = useConnectionId();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    if (!connId) return;
    setLoading(true);
    setError('');
    try { setSessions(await api.getActiveSessions(connId)); }
    catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [connId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  const terminate = async (pid: number, mode: 'cancel' | 'terminate') => {
    if (!connId) return;
    if (!confirm(`${mode === 'terminate' ? 'Terminate' : 'Cancel query for'} PID ${pid}?`)) return;
    try {
      await api.terminateSession(connId, pid, mode);
      load();
    } catch (e: any) { alert(e.message); }
  };

  const filtered = sessions.filter(s =>
    !filter || [s.username, s.database, s.query, s.state, s.application_name]
      .some(v => String(v || '').toLowerCase().includes(filter.toLowerCase()))
  );

  const stateColor = (s: string) => {
    if (s === 'active') return 'text-green-500';
    if (s === 'idle in transaction') return 'text-yellow-500';
    if (s === 'idle') return 'text-muted-foreground';
    return 'text-orange-400';
  };

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <span className="text-sm font-medium">Active Sessions</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        <span className="text-xs text-muted-foreground">({filtered.length})</span>
        <input placeholder="Filter..." value={filter} onChange={e => setFilter(e.target.value)}
          className="ml-2 h-6 w-48 rounded border px-2 text-xs bg-background" />
        <label className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> Auto-refresh
        </label>
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card border-b">
            <tr>
              {['PID','User','DB','App','State','Duration','Wait','Query','Actions'].map(h =>
                <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.pid} className="border-b hover:bg-accent/50">
                <td className="px-2 py-1 font-mono">{s.pid}</td>
                <td className="px-2 py-1">{s.username}</td>
                <td className="px-2 py-1">{s.database}</td>
                <td className="px-2 py-1 max-w-[100px] truncate" title={s.application_name}>{s.application_name}</td>
                <td className={`px-2 py-1 font-medium ${stateColor(s.state)}`}>{s.state || '—'}</td>
                <td className="px-2 py-1 font-mono">{s.query_duration_sec != null ? `${s.query_duration_sec}s` : '—'}</td>
                <td className="px-2 py-1">{s.wait_event ? `${s.wait_event_type}/${s.wait_event}` : '—'}</td>
                <td className="px-2 py-1 max-w-[300px] truncate font-mono" title={s.query}>{s.query || '—'}</td>
                <td className="px-2 py-1 flex gap-1">
                  <button onClick={() => terminate(s.pid, 'cancel')} title="Cancel query" className="rounded p-0.5 hover:bg-yellow-500/20">
                    <StopCircle className="h-3.5 w-3.5 text-yellow-500" />
                  </button>
                  <button onClick={() => terminate(s.pid, 'terminate')} title="Terminate session" className="rounded p-0.5 hover:bg-destructive/20">
                    <XCircle className="h-3.5 w-3.5 text-destructive" />
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">No sessions found</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
