import { useState, useEffect } from 'react';
import { api } from '@/services/api';
import type { TableStat } from '@/types';
import { BarChart3, RefreshCw, Loader2, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

function formatSize(bytes: number) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function timeAgo(ts: string | null) {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const hours = diff / 3600000;
  if (hours < 1) return `${Math.floor(diff / 60000)}m ago`;
  if (hours < 24) return `${Math.floor(hours)}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TableStats() {
  const [connId, setConnId] = useConnectionId();
  const [stats, setStats] = useState<{ tables: TableStat[]; cacheHitRatio: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'dead_rows', dir: 'desc' });
  const [vacuuming, setVacuuming] = useState<string | null>(null);

  const load = async () => {
    if (!connId) return;
    setLoading(true);
    try { setStats(await api.getTableStats(connId)); } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [connId]);

  const sorted = stats?.tables.slice().sort((a: any, b: any) => {
    const va = a[sort.col] ?? 0, vb = b[sort.col] ?? 0;
    return sort.dir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
  }) || [];

  const toggleSort = (col: string) => {
    setSort(s => s.col === col ? { col, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
  };

  const cacheColor = (stats?.cacheHitRatio || 0) > 99 ? 'text-green-500' : (stats?.cacheHitRatio || 0) > 90 ? 'text-yellow-500' : 'text-destructive';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <BarChart3 className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Table Stats Dashboard</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        {stats && <span className={`text-xs ml-2 font-bold ${cacheColor}`}>Cache Hit: {stats.cacheHitRatio}%</span>}
        <button onClick={load} disabled={loading} className="ml-auto rounded p-1 hover:bg-accent">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {!connId && <div className="p-4 text-sm text-muted-foreground text-center">Connect to a database first</div>}
        {sorted.length > 0 && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr>
                {[
                  { key: 'table', label: 'Table' }, { key: 'total_size', label: 'Size' },
                  { key: 'live_rows', label: 'Live Rows' }, { key: 'dead_rows', label: 'Dead Rows' },
                  { key: 'dead_pct', label: 'Dead %' }, { key: 'idx_hit_pct', label: 'Idx Hit %' },
                  { key: 'seq_scan', label: 'Seq Scans' }, { key: 'last_autovacuum', label: 'Last Vacuum' },
                ].map(h => (
                  <th key={h.key} className="border-b px-2 py-2 text-left font-medium cursor-pointer hover:text-primary" onClick={() => toggleSort(h.key)}>
                    {h.label} {sort.col === h.key && (sort.dir === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
                <th className="border-b px-2 py-2 text-left font-medium">Health</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(t => {
                const needsVacuum = t.dead_pct > 10;
                const noIndex = t.idx_hit_pct < 80 && t.seq_scan > 100;
                return (
                  <tr key={`${t.schema}.${t.table}`} className="hover:bg-accent/50">
                    <td className="border-b px-2 py-1.5 font-medium">{t.schema}.{t.table}</td>
                    <td className="border-b px-2 py-1.5">{formatSize(t.total_size)}</td>
                    <td className="border-b px-2 py-1.5">{Number(t.live_rows).toLocaleString()}</td>
                    <td className={`border-b px-2 py-1.5 ${needsVacuum ? 'text-destructive font-medium' : ''}`}>{Number(t.dead_rows).toLocaleString()}</td>
                    <td className={`border-b px-2 py-1.5 ${needsVacuum ? 'text-destructive font-medium' : ''}`}>{t.dead_pct}%</td>
                    <td className={`border-b px-2 py-1.5 ${noIndex ? 'text-yellow-500' : ''}`}>{t.idx_hit_pct}%</td>
                    <td className="border-b px-2 py-1.5">{Number(t.seq_scan).toLocaleString()}</td>
                    <td className="border-b px-2 py-1.5 text-muted-foreground">{timeAgo(t.last_autovacuum || t.last_vacuum)}</td>
                    <td className="border-b px-2 py-1.5">
                      {needsVacuum ? (
                        <span className="flex items-center gap-1">
                          <span className="flex items-center gap-1 text-yellow-500"><AlertTriangle className="h-3 w-3" /> Needs VACUUM</span>
                          <button
                            onClick={async () => {
                              if (!connId) return;
                              const key = `${t.schema}.${t.table}`;
                              setVacuuming(key);
                              try {
                                await api.vacuumTable(connId, t.schema, t.table);
                                await load();
                              } catch {}
                              setVacuuming(null);
                            }}
                            disabled={vacuuming === `${t.schema}.${t.table}`}
                            className="ml-1 flex items-center gap-1 rounded bg-yellow-600 px-1.5 py-0.5 text-[10px] text-white hover:bg-yellow-700 disabled:opacity-50"
                            title={`Run VACUUM ANALYZE on ${t.schema}.${t.table}`}
                          >
                            {vacuuming === `${t.schema}.${t.table}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                            VACUUM
                          </button>
                        </span>
                      ) : noIndex ? (
                        <span className="flex items-center gap-1 text-yellow-500"><AlertTriangle className="h-3 w-3" /> Low idx usage</span>
                      ) : (
                        <span className="flex items-center gap-1 text-green-500"><CheckCircle2 className="h-3 w-3" /> OK</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
