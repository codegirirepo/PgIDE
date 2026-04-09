import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { RefreshCw, Loader2, Wrench, Play, AlertTriangle, Info } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

type Action = 'vacuum' | 'analyze' | 'reindex' | 'cluster';
type Urgency = 'critical' | 'warning' | 'normal';

function getActionUrgency(t: any): Record<Action, { urgency: Urgency; reason?: string }> {
  const deadPct = Number(t.dead_pct) || 0;
  const deadRows = Number(t.dead_rows) || 0;
  const seqScan = Number(t.seq_scan) || 0;
  const idxScan = Number(t.idx_scan) || 0;
  const idxHitPct = Number(t.idx_hit_pct) || 0;

  const lastVac = t.last_vacuum || t.last_autovacuum;
  const lastAna = t.last_analyze || t.last_autoanalyze;
  const daysSinceVacuum = lastVac ? (Date.now() - new Date(lastVac).getTime()) / 86400000 : Infinity;
  const daysSinceAnalyze = lastAna ? (Date.now() - new Date(lastAna).getTime()) / 86400000 : Infinity;

  // Vacuum urgency
  let vacuum: { urgency: Urgency; reason?: string } = { urgency: 'normal' };
  if (deadPct > 20 || (deadRows > 10000 && deadPct > 10)) {
    vacuum = { urgency: 'critical', reason: `${deadPct}% bloat (${deadRows.toLocaleString()} dead rows)` };
  } else if (deadPct > 5 || daysSinceVacuum > 7) {
    vacuum = { urgency: 'warning', reason: deadPct > 5 ? `${deadPct}% bloat` : `Last vacuum ${Math.floor(daysSinceVacuum)}d ago` };
  }

  // Analyze urgency
  let analyze: { urgency: Urgency; reason?: string } = { urgency: 'normal' };
  if (daysSinceAnalyze === Infinity) {
    analyze = { urgency: 'critical', reason: 'Never analyzed — planner has no statistics' };
  } else if (daysSinceAnalyze > 7) {
    analyze = { urgency: 'warning', reason: `Last analyze ${Math.floor(daysSinceAnalyze)}d ago` };
  }

  // Reindex urgency — high seq scans with low index usage on a table that has indexes
  let reindex: { urgency: Urgency; reason?: string } = { urgency: 'normal' };
  if (seqScan > 1000 && idxHitPct < 50 && idxScan > 0) {
    reindex = { urgency: 'critical', reason: `${idxHitPct}% index hit, ${seqScan.toLocaleString()} seq scans` };
  } else if (seqScan > 100 && idxHitPct < 80 && idxScan > 0) {
    reindex = { urgency: 'warning', reason: `${idxHitPct}% index hit ratio` };
  }

  // Cluster — rarely critical, just informational
  const cluster: { urgency: Urgency; reason?: string } = { urgency: 'normal' };

  return { vacuum, analyze, reindex, cluster };
}

const urgencyStyles: Record<Urgency, string> = {
  critical: 'bg-destructive text-white border-destructive hover:bg-destructive/90',
  warning: 'bg-yellow-500/15 text-yellow-600 border-yellow-500/40 hover:bg-yellow-500/25 dark:text-yellow-400',
  normal: 'hover:bg-accent border text-foreground',
};

const urgencyIcon: Record<Urgency, React.ReactNode> = {
  critical: <AlertTriangle className="h-2.5 w-2.5" />,
  warning: <AlertTriangle className="h-2.5 w-2.5" />,
  normal: <Play className="h-2.5 w-2.5" />,
};

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

  const run = async (action: Action, schema: string, table: string) => {
    if (!connId) return;
    const key = `${action}-${schema}.${table}`;
    setRunning(key); setMessage(''); setError('');
    try {
      let res;
      if (action === 'vacuum') res = await api.vacuumTable(connId, schema, table);
      else res = await api.runMaintenance(connId, action, schema, table);
      setMessage(res.message);
      setTimeout(() => load(), 1000);
    } catch (e: any) { setError(e.message); }
    setRunning(null);
  };

  const filtered = tables.filter(t =>
    !filter || `${t.schema}.${t.table}`.toLowerCase().includes(filter.toLowerCase())
  );

  // Count critical/warning actions across all tables
  const criticalCount = filtered.reduce((n, t) => {
    const u = getActionUrgency(t);
    return n + Object.values(u).filter(v => v.urgency === 'critical').length;
  }, 0);
  const warningCount = filtered.reduce((n, t) => {
    const u = getActionUrgency(t);
    return n + Object.values(u).filter(v => v.urgency === 'warning').length;
  }, 0);

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Wrench className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Maintenance</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        {criticalCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-destructive bg-destructive/10 rounded px-1.5 py-0.5">
            <AlertTriangle className="h-3 w-3" /> {criticalCount} critical
          </span>
        )}
        {warningCount > 0 && (
          <span className="flex items-center gap-1 text-[10px] text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 rounded px-1.5 py-0.5">
            <AlertTriangle className="h-3 w-3" /> {warningCount} warning
          </span>
        )}
        <input placeholder="Filter tables..." value={filter} onChange={e => setFilter(e.target.value)}
          className="ml-2 h-6 w-48 rounded border px-2 text-xs bg-background" />
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      {message && <div className="px-3 py-1 text-xs text-green-500">{message}</div>}

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-1 border-b text-[10px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-destructive" /> Critical — action needed</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-yellow-500" /> Warning — recommended</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded border" /> Normal</span>
        <span className="ml-auto flex items-center gap-1"><Info className="h-3 w-3" /> Hover buttons for details</span>
      </div>

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
              const deadPct = Number(t.dead_pct) || 0;
              const urgencies = getActionUrgency(t);
              const hasCritical = Object.values(urgencies).some(u => u.urgency === 'critical');
              return (
                <tr key={key} className={`border-b hover:bg-accent/50 ${hasCritical ? 'bg-destructive/5' : ''}`}>
                  <td className="px-2 py-1 font-medium">{key}</td>
                  <td className="px-2 py-1 font-mono">{Number(t.live_rows).toLocaleString()}</td>
                  <td className="px-2 py-1 font-mono">{Number(t.dead_rows).toLocaleString()}</td>
                  <td className="px-2 py-1 font-mono">
                    <span className={deadPct > 20 ? 'text-destructive font-bold' : deadPct > 5 ? 'text-yellow-600 dark:text-yellow-400 font-medium' : ''}>
                      {t.dead_pct}%
                    </span>
                  </td>
                  <td className="px-2 py-1 text-[10px]">{(() => {
                    const v = t.last_vacuum ? new Date(t.last_vacuum) : null;
                    const av = t.last_autovacuum ? new Date(t.last_autovacuum) : null;
                    const latest = v && av ? (v > av ? v : av) : v || av;
                    return latest ? latest.toLocaleString() : '—';
                  })()}</td>
                  <td className="px-2 py-1 text-[10px]">{(() => {
                    const a = t.last_analyze ? new Date(t.last_analyze) : null;
                    const aa = t.last_autoanalyze ? new Date(t.last_autoanalyze) : null;
                    const latest = a && aa ? (a > aa ? a : aa) : a || aa;
                    return latest ? latest.toLocaleString() : '—';
                  })()}</td>
                  <td className="px-2 py-1">
                    <div className="flex gap-1">
                      {(['vacuum', 'analyze', 'reindex', 'cluster'] as const).map(action => {
                        const actionKey = `${action}-${key}`;
                        const { urgency, reason } = urgencies[action];
                        return (
                          <button key={action} onClick={() => run(action, t.schema, t.table)}
                            disabled={running === actionKey}
                            title={reason || action}
                            className={`flex items-center gap-0.5 rounded px-1.5 py-0.5 border text-[10px] disabled:opacity-50 capitalize transition-colors ${urgencyStyles[urgency]}`}>
                            {running === actionKey ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : urgencyIcon[urgency]}
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
