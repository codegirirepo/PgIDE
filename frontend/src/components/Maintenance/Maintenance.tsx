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

  let vacuum: { urgency: Urgency; reason?: string } = { urgency: 'normal' };
  if (deadPct > 20 || (deadRows > 10000 && deadPct > 10)) {
    vacuum = { urgency: 'critical', reason: `${deadPct}% bloat (${deadRows.toLocaleString()} dead rows)` };
  } else if (deadPct > 5 || daysSinceVacuum > 7) {
    vacuum = { urgency: 'warning', reason: deadPct > 5 ? `${deadPct}% bloat` : `Last vacuum ${Math.floor(daysSinceVacuum)}d ago` };
  }

  let analyze: { urgency: Urgency; reason?: string } = { urgency: 'normal' };
  if (daysSinceAnalyze === Infinity) {
    analyze = { urgency: 'critical', reason: 'Never analyzed — planner has no statistics' };
  } else if (daysSinceAnalyze > 7) {
    analyze = { urgency: 'warning', reason: `Last analyze ${Math.floor(daysSinceAnalyze)}d ago` };
  }

  let reindex: { urgency: Urgency; reason?: string } = { urgency: 'normal' };
  if (seqScan > 1000 && idxHitPct < 50 && idxScan > 0) {
    reindex = { urgency: 'critical', reason: `${idxHitPct}% index hit, ${seqScan.toLocaleString()} seq scans` };
  } else if (seqScan > 100 && idxHitPct < 80 && idxScan > 0) {
    reindex = { urgency: 'warning', reason: `${idxHitPct}% index hit ratio` };
  }

  const cluster: { urgency: Urgency; reason?: string } = { urgency: 'normal' };
  return { vacuum, analyze, reindex, cluster };
}

function getTablesForAction(tables: any[], action: Action, minUrgency: Urgency): any[] {
  const levels: Urgency[] = minUrgency === 'critical' ? ['critical'] : ['critical', 'warning'];
  return tables.filter(t => levels.includes(getActionUrgency(t)[action].urgency));
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
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchLabel, setBatchLabel] = useState('');
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0, current: '' });
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

  const runSingle = async (action: Action, schema: string, table: string) => {
    if (!connId) return;
    const key = `${action}-${schema}.${table}`;
    setRunning(key); setMessage(''); setError('');
    try {
      const res = action === 'vacuum'
        ? await api.vacuumTable(connId, schema, table)
        : await api.runMaintenance(connId, action, schema, table);
      setMessage(res.message);
      setTimeout(() => load(), 1000);
    } catch (e: any) { setError(e.message); }
    setRunning(null);
  };

  const runBatch = async (action: Action, minUrgency: Urgency) => {
    if (!connId) return;
    const targets = getTablesForAction(tables, action, minUrgency);
    if (targets.length === 0) return;
    const label = `${action.toUpperCase()} (${minUrgency})`;
    if (!confirm(`Run ${action.toUpperCase()} on ${targets.length} ${minUrgency}${minUrgency === 'warning' ? '+critical' : ''} table(s)?`)) return;

    setBatchRunning(true); setBatchLabel(label); setMessage(''); setError('');
    setBatchProgress({ done: 0, total: targets.length, current: '' });
    const errors: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      const name = `${t.schema}.${t.table}`;
      setBatchProgress({ done: i, total: targets.length, current: name });
      try {
        if (action === 'vacuum') await api.vacuumTable(connId, t.schema, t.table);
        else await api.runMaintenance(connId, action, t.schema, t.table);
      } catch (e: any) { errors.push(`${name}: ${e.message}`); }
    }

    setBatchProgress({ done: targets.length, total: targets.length, current: '' });
    if (errors.length) setError(`Failed: ${errors.join(' | ')}`);
    setMessage(`${action.toUpperCase()} completed on ${targets.length - errors.length}/${targets.length} tables`);
    setBatchRunning(false);
    setTimeout(() => load(), 1000);
  };

  const filtered = tables.filter(t =>
    !filter || `${t.schema}.${t.table}`.toLowerCase().includes(filter.toLowerCase())
  );

  const criticalCount = filtered.reduce((n, t) => n + Object.values(getActionUrgency(t)).filter(v => v.urgency === 'critical').length, 0);
  const warningCount = filtered.reduce((n, t) => n + Object.values(getActionUrgency(t)).filter(v => v.urgency === 'warning').length, 0);

  // Batch button data: [action, urgency, count, style]
  const batchButtons: { action: Action; urgency: Urgency; count: number; label: string; style: string }[] = [];
  for (const action of ['vacuum', 'analyze', 'reindex'] as Action[]) {
    const critical = getTablesForAction(tables, action, 'critical');
    const warning = getTablesForAction(tables, action, 'warning');
    if (critical.length > 0) {
      batchButtons.push({
        action, urgency: 'critical', count: critical.length,
        label: `${action} ${critical.length} critical`,
        style: 'bg-destructive text-white hover:bg-destructive/90',
      });
    }
    if (warning.length > critical.length) {
      batchButtons.push({
        action, urgency: 'warning', count: warning.length,
        label: `${action} ${warning.length} warning`,
        style: 'bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/30',
      });
    }
  }

  const isBusy = batchRunning || !!running;

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
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

      {/* Batch action buttons */}
      {batchButtons.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b shrink-0 flex-wrap">
          <span className="text-[10px] text-muted-foreground mr-1">Batch:</span>
          {batchButtons.map(b => (
            <button key={`${b.action}-${b.urgency}`}
              onClick={() => runBatch(b.action, b.urgency)}
              disabled={isBusy}
              title={`Run ${b.action.toUpperCase()} on ${b.count} table(s)`}
              className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-medium capitalize disabled:opacity-50 transition-colors ${b.style}`}>
              {b.urgency === 'critical' ? <AlertTriangle className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
              {b.label}
            </button>
          ))}
        </div>
      )}

      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      {message && <div className="px-3 py-1 text-xs text-green-500">{message}</div>}

      {/* Batch progress */}
      {batchRunning && (
        <div className="px-3 py-1.5 border-b bg-accent/30 shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            <span className="font-medium">{batchLabel}</span>
            <span>{batchProgress.done + 1}/{batchProgress.total}</span>
            {batchProgress.current && <span className="font-mono text-muted-foreground">{batchProgress.current}</span>}
          </div>
          <div className="mt-1 h-1.5 w-full rounded bg-accent overflow-hidden">
            <div className="h-full rounded bg-primary transition-all" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} />
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-1 border-b text-[10px] text-muted-foreground shrink-0">
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-destructive" /> Critical</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded bg-yellow-500" /> Warning</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded border" /> Normal</span>
        <span className="ml-auto flex items-center gap-1"><Info className="h-3 w-3" /> Hover buttons for details</span>
      </div>

      {/* Table */}
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
                          <button key={action} onClick={() => runSingle(action, t.schema, t.table)}
                            disabled={isBusy}
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
