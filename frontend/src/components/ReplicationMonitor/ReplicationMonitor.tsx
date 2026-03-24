import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { RefreshCw, Loader2, Radio } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

export default function ReplicationMonitor() {
  const [connId, setConnId] = useConnectionId();
  const [data, setData] = useState<{ replicas: any[]; slots: any[]; isReplica: boolean }>({ replicas: [], slots: [], isReplica: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!connId) return;
    setLoading(true); setError('');
    try { setData(await api.getReplicationStatus(connId)); }
    catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [connId]);

  useEffect(() => { load(); }, [load]);

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Radio className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Replication Monitor</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        <span className={`text-xs px-1.5 py-0.5 rounded ${data.isReplica ? 'bg-yellow-500/20 text-yellow-500' : 'bg-green-500/20 text-green-500'}`}>
          {data.isReplica ? 'Replica' : 'Primary'}
        </span>
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      <div className="flex-1 overflow-auto min-h-0 p-3 space-y-4">
        <div>
          <h3 className="text-xs font-medium mb-2 text-muted-foreground">Streaming Replicas ({data.replicas.length})</h3>
          {data.replicas.length === 0 ? (
            <p className="text-xs text-muted-foreground">No streaming replicas connected</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-card border-b">
                <tr>
                  {['PID','User','App','Client','State','Sent LSN','Write LSN','Flush LSN','Replay LSN','Sync'].map(h =>
                    <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.replicas.map(r => (
                  <tr key={r.pid} className="border-b hover:bg-accent/50">
                    <td className="px-2 py-1 font-mono">{r.pid}</td>
                    <td className="px-2 py-1">{r.usename}</td>
                    <td className="px-2 py-1">{r.application_name}</td>
                    <td className="px-2 py-1 font-mono">{r.client_addr}</td>
                    <td className="px-2 py-1">{r.state}</td>
                    <td className="px-2 py-1 font-mono text-[10px]">{r.sent_lsn}</td>
                    <td className="px-2 py-1 font-mono text-[10px]">{r.write_lsn}</td>
                    <td className="px-2 py-1 font-mono text-[10px]">{r.flush_lsn}</td>
                    <td className="px-2 py-1 font-mono text-[10px]">{r.replay_lsn}</td>
                    <td className="px-2 py-1">{r.sync_state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div>
          <h3 className="text-xs font-medium mb-2 text-muted-foreground">Replication Slots ({data.slots.length})</h3>
          {data.slots.length === 0 ? (
            <p className="text-xs text-muted-foreground">No replication slots</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-card border-b">
                <tr>
                  {['Slot Name','Type','Plugin','Active','WAL Status','Restart LSN'].map(h =>
                    <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {data.slots.map(s => (
                  <tr key={s.slot_name} className="border-b hover:bg-accent/50">
                    <td className="px-2 py-1 font-medium">{s.slot_name}</td>
                    <td className="px-2 py-1">{s.slot_type}</td>
                    <td className="px-2 py-1">{s.plugin || '—'}</td>
                    <td className="px-2 py-1">{s.active ? <span className="text-green-500">Yes</span> : <span className="text-destructive">No</span>}</td>
                    <td className="px-2 py-1">{s.wal_status || '—'}</td>
                    <td className="px-2 py-1 font-mono text-[10px]">{s.restart_lsn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
