import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { RefreshCw, Loader2, HardDrive } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

function formatBytes(bytes: number) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function Bar({ value, max, color = 'bg-primary' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-3 w-full rounded bg-accent overflow-hidden">
      <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function DiskUsage() {
  const [connId, setConnId] = useConnectionId();
  const [data, setData] = useState<{ databases: any[]; schemas: any[]; topTables: any[] }>({ databases: [], schemas: [], topTables: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'databases' | 'schemas' | 'tables'>('databases');

  const load = useCallback(async () => {
    if (!connId) return;
    setLoading(true); setError('');
    try { setData(await api.getDiskUsage(connId)); }
    catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [connId]);

  useEffect(() => { load(); }, [load]);

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  const maxDb = Math.max(...data.databases.map(d => Number(d.size_bytes) || 0), 1);
  const maxTable = Math.max(...data.topTables.map(t => Number(t.total_bytes) || 0), 1);
  const maxSchema = Math.max(...data.schemas.map(s => Number(s.size_bytes) || 0), 1);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <HardDrive className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Disk Usage</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        <div className="flex gap-1 ml-2">
          {(['databases', 'schemas', 'tables'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 text-xs capitalize ${tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{t}</button>
          ))}
        </div>
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      <div className="flex-1 overflow-auto min-h-0">
        {tab === 'databases' && (
          <div className="p-3 space-y-2">
            {data.databases.map(d => (
              <div key={d.name} className="flex items-center gap-3">
                <span className="text-xs w-32 truncate font-medium">{d.name}</span>
                <div className="flex-1"><Bar value={Number(d.size_bytes)} max={maxDb} /></div>
                <span className="text-xs text-muted-foreground w-20 text-right">{formatBytes(Number(d.size_bytes))}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'schemas' && (
          <div className="p-3 space-y-2">
            {data.schemas.map(s => (
              <div key={s.schema} className="flex items-center gap-3">
                <span className="text-xs w-32 truncate font-medium">{s.schema}</span>
                <div className="flex-1"><Bar value={Number(s.size_bytes)} max={maxSchema} color="bg-blue-500" /></div>
                <span className="text-xs text-muted-foreground w-16 text-right">{s.table_count} tbl</span>
                <span className="text-xs text-muted-foreground w-20 text-right">{formatBytes(Number(s.size_bytes))}</span>
              </div>
            ))}
          </div>
        )}
        {tab === 'tables' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b">
              <tr>
                {['Table','Total','Table Data','Indexes','TOAST',''].map(h =>
                  <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.topTables.map(t => (
                <tr key={`${t.schema}.${t.table}`} className="border-b hover:bg-accent/50">
                  <td className="px-2 py-1 font-medium">{t.schema}.{t.table}</td>
                  <td className="px-2 py-1 font-mono">{formatBytes(Number(t.total_bytes))}</td>
                  <td className="px-2 py-1 font-mono">{formatBytes(Number(t.table_bytes))}</td>
                  <td className="px-2 py-1 font-mono">{formatBytes(Number(t.index_bytes))}</td>
                  <td className="px-2 py-1 font-mono">{formatBytes(Number(t.toast_bytes))}</td>
                  <td className="px-2 py-1 w-32"><Bar value={Number(t.total_bytes)} max={maxTable} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
