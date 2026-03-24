import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { RefreshCw, Loader2, Database } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function TablespaceManager() {
  const [connId, setConnId] = useConnectionId();
  const [spaces, setSpaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!connId) return;
    setLoading(true); setError('');
    try { setSpaces(await api.getTablespaces(connId)); }
    catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [connId]);

  useEffect(() => { load(); }, [load]);

  const maxSize = Math.max(...spaces.map(s => Number(s.size_bytes) || 0), 1);

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Database className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Tablespaces</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      <div className="flex-1 overflow-auto min-h-0 p-3">
        <div className="grid gap-3">
          {spaces.map(s => (
            <div key={s.name} className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{s.name}</span>
                <span className="text-xs font-mono text-muted-foreground">{formatBytes(Number(s.size_bytes))}</span>
              </div>
              <div className="h-2 w-full rounded bg-accent overflow-hidden mb-2">
                <div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, (Number(s.size_bytes) / maxSize) * 100)}%` }} />
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Owner: {s.owner}</span>
                <span>Location: {s.location || '(default)'}</span>
              </div>
            </div>
          ))}
          {spaces.length === 0 && !loading && <p className="text-xs text-muted-foreground text-center py-4">No tablespaces found</p>}
        </div>
      </div>
    </div>
  );
}
