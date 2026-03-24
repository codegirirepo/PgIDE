import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { RefreshCw, Loader2, Lock, Unlock, AlertTriangle } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

export default function LockMonitor() {
  const [connId, setConnId] = useConnectionId();
  const [data, setData] = useState<{ locks: any[]; blockingChains: any[] }>({ locks: [], blockingChains: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tab, setTab] = useState<'locks' | 'blocking'>('locks');

  const load = useCallback(async () => {
    if (!connId) return;
    setLoading(true); setError('');
    try { setData(await api.getLocks(connId)); }
    catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [connId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, [autoRefresh, load]);

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <span className="text-sm font-medium">Lock Monitor</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        {data.blockingChains.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3 w-3" /> {data.blockingChains.length} blocking chain(s)</span>
        )}
        <div className="flex gap-1 ml-2">
          {(['locks', 'blocking'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 text-xs ${tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              {t === 'locks' ? `Locks (${data.locks.length})` : `Blocking (${data.blockingChains.length})`}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} /> Auto-refresh
        </label>
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      <div className="flex-1 overflow-auto min-h-0">
        {tab === 'locks' ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b">
              <tr>
                {['PID','User','Type','Mode','Granted','Relation','State','Duration','Query'].map(h =>
                  <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.locks.map((l, i) => (
                <tr key={i} className={`border-b hover:bg-accent/50 ${!l.granted ? 'bg-destructive/5' : ''}`}>
                  <td className="px-2 py-1 font-mono">{l.pid}</td>
                  <td className="px-2 py-1">{l.username}</td>
                  <td className="px-2 py-1">{l.locktype}</td>
                  <td className="px-2 py-1 font-mono text-[10px]">{l.mode}</td>
                  <td className="px-2 py-1">{l.granted ? <Unlock className="h-3 w-3 text-green-500" /> : <Lock className="h-3 w-3 text-destructive" />}</td>
                  <td className="px-2 py-1">{l.relation || '—'}</td>
                  <td className="px-2 py-1">{l.state}</td>
                  <td className="px-2 py-1 font-mono">{l.duration_sec != null ? `${l.duration_sec}s` : '—'}</td>
                  <td className="px-2 py-1 max-w-[300px] truncate font-mono" title={l.query}>{l.query || '—'}</td>
                </tr>
              ))}
              {data.locks.length === 0 && <tr><td colSpan={9} className="px-3 py-4 text-center text-muted-foreground">No locks</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b">
              <tr>
                {['Blocked PID','Blocked User','Blocked Query','Blocking PID','Blocking User','Blocking Query'].map(h =>
                  <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.blockingChains.map((c, i) => (
                <tr key={i} className="border-b hover:bg-accent/50 bg-destructive/5">
                  <td className="px-2 py-1 font-mono">{c.blocked_pid}</td>
                  <td className="px-2 py-1">{c.blocked_user}</td>
                  <td className="px-2 py-1 max-w-[250px] truncate font-mono" title={c.blocked_query}>{c.blocked_query}</td>
                  <td className="px-2 py-1 font-mono font-bold text-destructive">{c.blocking_pid}</td>
                  <td className="px-2 py-1">{c.blocking_user}</td>
                  <td className="px-2 py-1 max-w-[250px] truncate font-mono" title={c.blocking_query}>{c.blocking_query}</td>
                </tr>
              ))}
              {data.blockingChains.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-green-500">No blocking chains detected</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
