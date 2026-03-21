import { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import type { SlowQuery } from '@/types';
import { Gauge, RefreshCw, Loader2, Play, AlertCircle } from 'lucide-react';

export default function SlowQueries() {
  const connId = useAppStore(s => s.activeConnectionId);
  const updateTab = useAppStore(s => s.updateTab);
  const activeTabId = useAppStore(s => s.activeTabId);
  const [data, setData] = useState<{ available: boolean; queries: SlowQuery[]; message?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<SlowQuery | null>(null);

  const load = async () => {
    if (!connId) return;
    setLoading(true);
    try { setData(await api.getSlowQueries(connId)); } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [connId]);

  const maxTime = data?.queries[0]?.total_time_ms || 1;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Gauge className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Slow Queries (pg_stat_statements)</span>
        <button onClick={load} disabled={loading} className="ml-auto rounded p-1 hover:bg-accent">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
      </div>

      {data && !data.available && (
        <div className="p-4 flex items-center gap-2 text-sm text-yellow-500">
          <AlertCircle className="h-4 w-4" /> {data.message}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Query list */}
        <div className="w-1/2 border-r overflow-auto">
          {data?.queries.map((q, i) => {
            const pct = (q.total_time_ms / maxTime) * 100;
            return (
              <div
                key={q.queryid || i}
                className={`border-b px-3 py-2 cursor-pointer hover:bg-accent/50 ${selected?.queryid === q.queryid ? 'bg-accent' : ''}`}
                onClick={() => setSelected(q)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                  <span className="text-[10px] text-muted-foreground">{q.calls} calls</span>
                </div>
                <pre className="text-xs font-mono truncate mt-0.5 text-foreground/80">{q.query}</pre>
                <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${pct > 50 ? 'bg-destructive' : pct > 20 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex gap-3 mt-1 text-[10px] text-muted-foreground">
                  <span>Total: {q.total_time_ms}ms</span>
                  <span>Avg: {q.avg_time_ms}ms</span>
                  <span>Rows: {q.rows}</span>
                  {q.cache_hit_pct != null && <span>Cache: {q.cache_hit_pct}%</span>}
                </div>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        <div className="w-1/2 overflow-auto p-3">
          {selected ? (
            <div>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => { if (activeTabId) updateTab(activeTabId, { sql: selected.query }); }}
                  className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90"
                >
                  <Play className="h-3 w-3" /> Open in Editor
                </button>
              </div>
              <pre className="rounded bg-muted p-3 text-xs font-mono whitespace-pre-wrap mb-3">{selected.query}</pre>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  ['Total Time', `${selected.total_time_ms}ms`],
                  ['Avg Time', `${selected.avg_time_ms}ms`],
                  ['Min Time', selected.min_time_ms != null ? `${selected.min_time_ms}ms` : 'N/A'],
                  ['Max Time', selected.max_time_ms != null ? `${selected.max_time_ms}ms` : 'N/A'],
                  ['Calls', String(selected.calls)],
                  ['Rows', String(selected.rows)],
                  ['Shared Blocks Hit', String(selected.shared_blks_hit)],
                  ['Shared Blocks Read', String(selected.shared_blks_read)],
                  ['Cache Hit %', selected.cache_hit_pct != null ? `${selected.cache_hit_pct}%` : 'N/A'],
                ].map(([label, val]) => (
                  <div key={label} className="rounded border px-2 py-1.5">
                    <div className="text-muted-foreground">{label}</div>
                    <div className="font-bold">{val}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8">Select a query to see details</div>
          )}
        </div>
      </div>
    </div>
  );
}
