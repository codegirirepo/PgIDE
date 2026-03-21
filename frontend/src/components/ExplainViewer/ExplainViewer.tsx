import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import type { ExplainNode, PlanHistoryEntry } from '@/types';
import { Play, Loader2, AlertTriangle, Zap, Clock, Database, ArrowRight, Settings, History, GitCompare, Trash2, Save } from 'lucide-react';

// Feature 6: Parameter presets
const PARAM_PRESETS: { label: string; key: string; default: string; hint: string }[] = [
  { label: 'work_mem', key: 'work_mem', default: '4MB', hint: 'Memory for sorts/hashes' },
  { label: 'random_page_cost', key: 'random_page_cost', default: '4.0', hint: 'Cost of random disk read' },
  { label: 'seq_page_cost', key: 'seq_page_cost', default: '1.0', hint: 'Cost of sequential read' },
  { label: 'effective_cache_size', key: 'effective_cache_size', default: '4GB', hint: 'Planner cache estimate' },
  { label: 'max_parallel_workers_per_gather', key: 'max_parallel_workers_per_gather', default: '2', hint: 'Max parallel workers' },
];

function formatTime(ms: number) {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}µs` : ms < 1000 ? `${ms.toFixed(2)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function formatRows(n: number) {
  return n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
}

// Feature 5: Build set of nodes on the critical (slowest) path
function buildCriticalPath(node: ExplainNode, path: Set<ExplainNode> = new Set()): Set<ExplainNode> {
  path.add(node);
  if (node.Plans && node.Plans.length > 0) {
    const slowest = node.Plans.reduce((a, b) =>
      (b['Actual Total Time'] || 0) > (a['Actual Total Time'] || 0) ? b : a
    );
    buildCriticalPath(slowest, path);
  }
  return path;
}

function PlanNode({ node, maxTime, depth = 0, criticalPath }: { node: ExplainNode; maxTime: number; depth?: number; criticalPath?: Set<ExplainNode> }) {
  const [expanded, setExpanded] = useState(true);
  const actualTime = node['Actual Total Time'] || 0;
  const planRows = node['Plan Rows'] || 0;
  const actualRows = node['Actual Rows'] || 0;
  const loops = node['Actual Loops'] || 1;
  const timePct = maxTime > 0 ? (actualTime / maxTime) * 100 : 0;
  const rowMismatch = planRows > 0 ? actualRows / planRows : 1;
  const isSeqScan = node['Node Type'] === 'Seq Scan';
  const isSlow = timePct > 50;
  const isBadEstimate = rowMismatch > 10 || rowMismatch < 0.1;
  const isOnCriticalPath = criticalPath?.has(node) ?? false;

  // --- Feature 1: Join strategy analysis ---
  const joinType = node['Join Type'];
  const nodeType = node['Node Type'];
  let joinExplanation = '';
  if (joinType) {
    if (nodeType === 'Nested Loop') {
      joinExplanation = 'Nested Loop: Best for small outer sets or indexed inner lookups. Each outer row triggers an inner scan.';
      if (actualRows > 10000 && loops > 100) joinExplanation += ' ⚠ High loop count — consider hash join via increasing work_mem.';
    } else if (nodeType === 'Hash Join') {
      joinExplanation = 'Hash Join: Builds hash table from inner set, probes with outer. Efficient for large unsorted datasets.';
      if (node['Peak Memory Usage']) joinExplanation += ` Peak memory: ${node['Peak Memory Usage']}kB.`;
    } else if (nodeType === 'Merge Join') {
      joinExplanation = 'Merge Join: Merges two pre-sorted inputs. Optimal when both sides are already sorted or indexed.';
    }
  }

  const warnings: string[] = [];
  if (isSeqScan && actualRows > 1000) warnings.push('Sequential scan on large table — consider adding an index');
  if (isBadEstimate) warnings.push(`Row estimate off by ${rowMismatch > 1 ? rowMismatch.toFixed(0) + 'x over' : (1 / rowMismatch).toFixed(0) + 'x under'} — run ANALYZE`);
  if (node['Rows Removed by Filter'] && node['Rows Removed by Filter'] > actualRows * 10) warnings.push('High filter rejection ratio');
  // Feature 3: Memory/temp file warnings
  if (node['Sort Method'] === 'external merge' || node['Sort Method'] === 'external sort')
    warnings.push(`Sort spilled to disk (${node['Sort Method']}) — increase work_mem`);
  if (node['Sort Space Type'] === 'Disk')
    warnings.push(`Sort used ${node['Sort Space Used'] || '?'}kB on disk — increase work_mem`);
  if (node['Temp Written Blocks'] && node['Temp Written Blocks'] > 0)
    warnings.push(`Temp files written: ${node['Temp Written Blocks']} blocks — increase work_mem`);
  if (node['Hash Batches'] && node['Hash Batches'] > 1)
    warnings.push(`Hash spilled to ${node['Hash Batches']} batches (${node['Peak Memory Usage'] || '?'}kB peak) — increase work_mem`);
  // Feature 4: Partition pruning visibility
  if (node['Subplans Removed'] != null && node['Subplans Removed'] > 0)
    warnings.push(`Partition pruning removed ${node['Subplans Removed']} partition(s)`);
  if (nodeType === 'Append' || nodeType === 'MergeAppend') {
    const childCount = node.Plans?.length || 0;
    if (childCount > 0) warnings.push(`Scanning ${childCount} partition(s)`);
  }

  return (
    <div style={{ marginLeft: depth * 20 }}>
      <div
        className={`rounded border p-2 mb-1 cursor-pointer transition-colors ${isOnCriticalPath ? 'ring-1 ring-red-500/60 ' : ''}${isSlow ? 'border-destructive/50 bg-destructive/5' : 'border-border hover:bg-accent/30'}`}
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-bold ${isSeqScan ? 'text-yellow-500' : isOnCriticalPath ? 'text-red-400' : 'text-primary'}`}>
            {node['Node Type']}
          </span>
          {node['Relation Name'] && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Database className="h-3 w-3" /> {node['Schema'] || ''}.{node['Relation Name']}
            </span>
          )}
          {node['Index Name'] && <span className="text-[10px] text-green-500">idx: {node['Index Name']}</span>}
          {node['Join Type'] && <span className="text-[10px] text-blue-400">{node['Join Type']} Join</span>}
          {joinExplanation && <span className="text-[10px] text-blue-300 italic truncate max-w-[400px]" title={joinExplanation}>ℹ {joinExplanation.split('.')[0]}</span>}
        </div>

        {/* Time bar */}
        <div className="mt-1.5 flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${isSlow ? 'bg-destructive' : timePct > 20 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${Math.max(timePct, 1)}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground w-16 text-right">{formatTime(actualTime)}</span>
        </div>

        {/* Stats row */}
        <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground flex-wrap">
          <span>Cost: {node['Startup Cost']?.toFixed(1)}..{node['Total Cost']?.toFixed(1)}</span>
          <span className={isBadEstimate ? 'text-yellow-500 font-medium' : ''}>
            Rows: {formatRows(planRows)} est → {formatRows(actualRows)} actual
          </span>
          {loops > 1 && <span>Loops: {loops}</span>}
          {node['Shared Hit Blocks'] != null && (
            <span>Buffers: {node['Shared Hit Blocks']} hit, {node['Shared Read Blocks'] || 0} read</span>
          )}
          {node['Filter'] && <span className="truncate max-w-[300px]">Filter: {node['Filter']}</span>}
          {node['Sort Key'] && <span>Sort: {node['Sort Key'].join(', ')}</span>}
          {/* Feature 2: Parallel query visualization */}
          {node['Workers Planned'] != null && (
            <span className="text-blue-400">
              Workers: {node['Workers Launched'] ?? '?'}/{node['Workers Planned']} launched
              {node['Workers Launched'] != null && node['Workers Planned'] > 0 && node['Workers Launched'] < node['Workers Planned'] && ' ⚠ under-utilized'}
            </span>
          )}
          {nodeType === 'Gather' || nodeType === 'Gather Merge' ? (
            <span className="text-blue-400">Parallel {nodeType}</span>
          ) : null}
        </div>

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mt-1.5 space-y-0.5">
            {warnings.map((w, i) => (
              <div key={i} className="flex items-center gap-1 text-[10px] text-yellow-500">
                <AlertTriangle className="h-3 w-3 shrink-0" /> {w}
              </div>
            ))}
          </div>
        )}
      </div>

      {expanded && node.Plans?.map((child, i) => (
        <div key={i} className="flex items-start">
          <ArrowRight className="h-3 w-3 mt-3 text-muted-foreground shrink-0" />
          <div className="flex-1">
            <PlanNode node={child} maxTime={maxTime} depth={0} criticalPath={criticalPath} />
          </div>
        </div>
      ))}
    </div>
  );
}

type ViewMode = 'plan' | 'settings' | 'history' | 'compare';

export default function ExplainViewer() {
  const activeTab = useAppStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [plan, setPlan] = useState<ExplainNode[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<ViewMode>('plan');

  // Feature 6: Parameter testing state
  const [paramOverrides, setParamOverrides] = useState<Record<string, string>>({});
  const [paramPlan, setParamPlan] = useState<ExplainNode[] | null>(null);

  // Feature 7: Plan history state
  const [historyEntries, setHistoryEntries] = useState<PlanHistoryEntry[]>([]);
  const [compareA, setCompareA] = useState<PlanHistoryEntry | null>(null);
  const [compareB, setCompareB] = useState<PlanHistoryEntry | null>(null);

  const runExplain = async () => {
    if (!activeTab?.connectionId || !activeTab.sql.trim()) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.getExplainPlan(activeTab.connectionId, activeTab.sql);
      setPlan(result);
      // Auto-save to history
      await api.savePlanHistory(activeTab.connectionId, activeTab.sql, result);
      setMode('plan');
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  // Feature 6: Run with custom settings
  const runWithSettings = async () => {
    if (!activeTab?.connectionId || !activeTab.sql.trim()) return;
    const activeParams = Object.fromEntries(Object.entries(paramOverrides).filter(([, v]) => v.trim()));
    if (Object.keys(activeParams).length === 0) { setError('Set at least one parameter override'); return; }
    setLoading(true);
    setError('');
    try {
      const result = await api.getExplainWithSettings(activeTab.connectionId, activeTab.sql, activeParams);
      setParamPlan(result);
      await api.savePlanHistory(activeTab.connectionId, activeTab.sql, result, activeParams);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  };

  // Feature 7: Load history
  const loadHistory = useCallback(async () => {
    try {
      const entries = await api.getPlanHistory(activeTab?.connectionId || undefined);
      setHistoryEntries(entries);
    } catch { /* ignore */ }
  }, [activeTab?.connectionId]);

  const openHistory = () => { setMode('history'); loadHistory(); };

  const getPlanSummary = (entry: PlanHistoryEntry) => {
    const root = entry.plan?.[0]?.Plan || entry.plan?.[0];
    const execTime = entry.plan?.[0]?.['Execution Time'] || root?.['Actual Total Time'] || 0;
    return { execTime, nodeType: root?.['Node Type'] || '?' };
  };

  const rootNode = plan?.[0]?.Plan || plan?.[0];
  const maxTime = rootNode?.['Actual Total Time'] || 1;
  const planningTime = plan?.[0]?.['Planning Time'] || 0;
  const executionTime = plan?.[0]?.['Execution Time'] || 0;

  // Compare helpers
  const compareRootA = compareA?.plan?.[0]?.Plan || compareA?.plan?.[0];
  const compareRootB = compareB?.plan?.[0]?.Plan || compareB?.plan?.[0];
  const compareMaxTime = Math.max(compareRootA?.['Actual Total Time'] || 1, compareRootB?.['Actual Total Time'] || 1);

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b px-3 py-1.5 shrink-0 flex-wrap">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium mr-2">EXPLAIN Analyzer</span>
        <button onClick={() => setMode('plan')} className={`rounded px-2 py-1 text-xs ${mode === 'plan' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}>Plan</button>
        <button onClick={() => setMode('settings')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${mode === 'settings' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}>
          <Settings className="h-3 w-3" /> Parameters
        </button>
        <button onClick={openHistory} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${mode === 'history' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}>
          <History className="h-3 w-3" /> History
        </button>
        {compareA && compareB && (
          <button onClick={() => setMode('compare')} className={`flex items-center gap-1 rounded px-2 py-1 text-xs ${mode === 'compare' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/50'}`}>
            <GitCompare className="h-3 w-3" /> Compare
          </button>
        )}
        <button
          onClick={runExplain}
          disabled={loading || !activeTab?.connectionId}
          className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 ml-auto"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Analyze
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {error && <div className="text-destructive text-sm mb-3">{error}</div>}

        {/* ── Plan View ── */}
        {mode === 'plan' && (
          <>
            {!plan && !loading && (
              <div className="text-center text-sm text-muted-foreground py-8">
                Write a query and click "Analyze" to see the execution plan
              </div>
            )}
            {plan && rootNode && (
              <>
                <div className="flex gap-4 mb-3 text-xs">
                  <div className="rounded border px-3 py-2">
                    <div className="text-muted-foreground">Planning</div>
                    <div className="font-bold">{formatTime(planningTime)}</div>
                  </div>
                  <div className="rounded border px-3 py-2">
                    <div className="text-muted-foreground">Execution</div>
                    <div className="font-bold">{formatTime(executionTime)}</div>
                  </div>
                  <div className="rounded border px-3 py-2">
                    <div className="text-muted-foreground">Total</div>
                    <div className="font-bold">{formatTime(planningTime + executionTime)}</div>
                  </div>
                  <div className="rounded border px-3 py-2 flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <div className="text-muted-foreground">= Critical Path</div>
                  </div>
                </div>
                <PlanNode node={rootNode} maxTime={maxTime} criticalPath={buildCriticalPath(rootNode)} />
              </>
            )}
          </>
        )}

        {/* ── Feature 6: Parameter Testing ── */}
        {mode === 'settings' && (
          <div className="space-y-4 max-w-lg">
            <p className="text-xs text-muted-foreground">Override PostgreSQL planner parameters and re-run EXPLAIN to see how the plan changes.</p>
            <div className="space-y-2">
              {PARAM_PRESETS.map(p => (
                <div key={p.key} className="flex items-center gap-2">
                  <label className="text-xs w-56 shrink-0" title={p.hint}>{p.label} <span className="text-muted-foreground">(default: {p.default})</span></label>
                  <input
                    className="flex-1 rounded border bg-background px-2 py-1 text-xs"
                    placeholder={p.default}
                    value={paramOverrides[p.key] || ''}
                    onChange={e => setParamOverrides(prev => ({ ...prev, [p.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={runWithSettings}
                disabled={loading || !activeTab?.connectionId}
                className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Run with Overrides
              </button>
              <button onClick={() => setParamOverrides({})} className="rounded px-3 py-1.5 text-xs hover:bg-accent">Reset</button>
            </div>

            {/* Side-by-side: original vs param plan */}
            {paramPlan && plan && (
              <div className="mt-4">
                <div className="text-xs font-medium mb-2">Comparison: Default vs Override</div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">Default Settings</div>
                    <div className="rounded border p-2 text-xs">
                      <div>Exec: {formatTime(plan[0]?.['Execution Time'] || 0)}</div>
                      <div>Root: {rootNode?.['Node Type']}</div>
                      <div>Cost: {rootNode?.['Total Cost']?.toFixed(1)}</div>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-1">With Overrides</div>
                    {(() => {
                      const pRoot = paramPlan[0]?.Plan || paramPlan[0];
                      const pExec = paramPlan[0]?.['Execution Time'] || 0;
                      const origExec = plan[0]?.['Execution Time'] || 0;
                      const faster = pExec < origExec;
                      return (
                        <div className={`rounded border p-2 text-xs ${faster ? 'border-green-500/50' : 'border-red-500/50'}`}>
                          <div>Exec: {formatTime(pExec)} <span className={faster ? 'text-green-500' : 'text-red-500'}>({faster ? '↓' : '↑'}{Math.abs(((pExec - origExec) / (origExec || 1)) * 100).toFixed(0)}%)</span></div>
                          <div>Root: {pRoot?.['Node Type']}</div>
                          <div>Cost: {pRoot?.['Total Cost']?.toFixed(1)}</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="text-[10px] text-muted-foreground mb-1">Override Plan Tree</div>
                  {(() => {
                    const pRoot = paramPlan[0]?.Plan || paramPlan[0];
                    return pRoot ? <PlanNode node={pRoot} maxTime={pRoot['Actual Total Time'] || 1} criticalPath={buildCriticalPath(pRoot)} /> : null;
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Feature 7: Plan History ── */}
        {mode === 'history' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{historyEntries.length} saved plan(s). Select two to compare.</p>
              {historyEntries.length > 0 && (
                <button onClick={async () => { await api.clearPlanHistory(); setHistoryEntries([]); }} className="flex items-center gap-1 text-xs text-destructive hover:underline">
                  <Trash2 className="h-3 w-3" /> Clear
                </button>
              )}
            </div>
            {historyEntries.length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No plans saved yet. Run EXPLAIN to start tracking.</div>}
            {historyEntries.map(entry => {
              const { execTime, nodeType } = getPlanSummary(entry);
              const isA = compareA?.id === entry.id;
              const isB = compareB?.id === entry.id;
              return (
                <div key={entry.id} className={`rounded border p-2 text-xs flex items-center gap-3 ${isA || isB ? 'border-primary bg-primary/5' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono truncate text-[10px]">{entry.sql.slice(0, 120)}</div>
                    <div className="flex gap-3 text-muted-foreground mt-0.5">
                      <span>{new Date(entry.timestamp).toLocaleString()}</span>
                      <span>{nodeType}</span>
                      <span>{formatTime(execTime)}</span>
                      {entry.settings && Object.keys(entry.settings).length > 0 && (
                        <span className="text-blue-400">custom params</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setCompareA(isA ? null : entry)}
                    className={`rounded px-2 py-0.5 text-[10px] ${isA ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                  >A</button>
                  <button
                    onClick={() => setCompareB(isB ? null : entry)}
                    className={`rounded px-2 py-0.5 text-[10px] ${isB ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
                  >B</button>
                  <button
                    onClick={() => { const root = entry.plan?.[0]?.Plan || entry.plan?.[0]; if (root) { setPlan(entry.plan); setMode('plan'); } }}
                    className="rounded px-2 py-0.5 text-[10px] hover:bg-accent"
                  >View</button>
                </div>
              );
            })}
            {compareA && compareB && (
              <button onClick={() => setMode('compare')} className="flex items-center gap-1 rounded bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 mt-2">
                <GitCompare className="h-3 w-3" /> Compare A vs B
              </button>
            )}
          </div>
        )}

        {/* ── Feature 7: Side-by-side Plan Comparison ── */}
        {mode === 'compare' && compareA && compareB && (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Side-by-side plan comparison</div>
            <div className="grid grid-cols-2 gap-3">
              {[{ label: 'Plan A', entry: compareA, root: compareRootA }, { label: 'Plan B', entry: compareB, root: compareRootB }].map(({ label, entry, root }) => {
                const execTime = entry.plan?.[0]?.['Execution Time'] || root?.['Actual Total Time'] || 0;
                return (
                  <div key={label}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium">{label}</span>
                      <span className="text-[10px] text-muted-foreground">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                      {entry.settings && Object.keys(entry.settings).length > 0 && (
                        <span className="text-[10px] text-blue-400">{Object.entries(entry.settings).map(([k, v]) => `${k}=${v}`).join(', ')}</span>
                      )}
                    </div>
                    <div className="rounded border px-2 py-1 text-xs mb-2">
                      <span>Exec: {formatTime(execTime)}</span>
                      <span className="ml-3">Cost: {root?.['Total Cost']?.toFixed(1)}</span>
                      <span className="ml-3">Root: {root?.['Node Type']}</span>
                    </div>
                    {root && <PlanNode node={root} maxTime={compareMaxTime} criticalPath={buildCriticalPath(root)} />}
                  </div>
                );
              })}
            </div>
            {/* Delta summary */}
            {(() => {
              const timeA = compareA.plan?.[0]?.['Execution Time'] || compareRootA?.['Actual Total Time'] || 0;
              const timeB = compareB.plan?.[0]?.['Execution Time'] || compareRootB?.['Actual Total Time'] || 0;
              const costA = compareRootA?.['Total Cost'] || 0;
              const costB = compareRootB?.['Total Cost'] || 0;
              const timeDelta = timeB - timeA;
              const costDelta = costB - costA;
              return (
                <div className="rounded border p-2 text-xs">
                  <span className="font-medium">Delta (B − A): </span>
                  <span className={timeDelta < 0 ? 'text-green-500' : timeDelta > 0 ? 'text-red-500' : ''}>
                    Time: {timeDelta > 0 ? '+' : ''}{formatTime(timeDelta)}
                  </span>
                  <span className={`ml-4 ${costDelta < 0 ? 'text-green-500' : costDelta > 0 ? 'text-red-500' : ''}`}>
                    Cost: {costDelta > 0 ? '+' : ''}{costDelta.toFixed(1)}
                  </span>
                  {compareRootA?.['Node Type'] !== compareRootB?.['Node Type'] && (
                    <span className="ml-4 text-yellow-500">Plan changed: {compareRootA?.['Node Type']} → {compareRootB?.['Node Type']}</span>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
