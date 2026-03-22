// Plan Analyzer — ported from github.com/JacobArthurs/pgplan
// 15+ rules for analyzing PostgreSQL EXPLAIN plans

export type Severity = 'critical' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  nodeType: string;
  relation: string;
  description: string;
  suggestion: string;
}

export interface AnalysisResult {
  findings: Finding[];
  totalCost: number;
  executionTime: number;
  planningTime: number;
}

interface PlanNode {
  'Node Type': string;
  'Parent Relationship'?: string;
  'Relation Name'?: string;
  'Alias'?: string;
  'Schema'?: string;
  'Index Name'?: string;
  'Index Cond'?: string;
  'Filter'?: string;
  'Rows Removed by Filter'?: number;
  'Join Type'?: string;
  'Join Filter'?: string;
  'Hash Cond'?: string;
  'Merge Cond'?: string;
  'Rows Removed by Join Filter'?: number;
  'Startup Cost': number;
  'Total Cost': number;
  'Plan Rows': number;
  'Plan Width': number;
  'Actual Startup Time'?: number;
  'Actual Total Time'?: number;
  'Actual Rows'?: number;
  'Actual Loops'?: number;
  'Shared Hit Blocks'?: number;
  'Shared Read Blocks'?: number;
  'Temp Read Blocks'?: number;
  'Temp Written Blocks'?: number;
  'Sort Method'?: string;
  'Sort Space Used'?: number;
  'Sort Space Type'?: string;
  'Hash Batches'?: number;
  'Peak Memory Usage'?: number;
  'Workers Planned'?: number;
  'Workers Launched'?: number;
  'Exact Heap Blocks'?: number;
  'Lossy Heap Blocks'?: number;
  'Subplan Name'?: string;
  'CTE Name'?: string;
  'Subplans Removed'?: number;
  'Group Key'?: string[];
  'Sort Key'?: string[];
  Plans?: PlanNode[];
  [key: string]: any;
}

// Thresholds (from pgplan)
const MIN_ROWS_SEQ_SCAN_WARNING = 10000;
const MIN_ROWS_CRITICAL_SCAN = 100000;
const MIN_ROWS_CRITICAL_SEQ_SCAN = 1000000;
const MIN_ROWS_LOW_SELECTIVITY = 10000;
const FILTER_REMOVAL_WARNING_PCT = 50;
const FILTER_REMOVAL_CRITICAL_PCT = 95;
const FILTER_REMOVAL_CAP_PCT = 99.99;
const RECHECK_WARNING_PCT = 50;
const RECHECK_CRITICAL_PCT = 90;
const READ_BLOCKS_CRITICAL_PCT = 50;
const NESTED_LOOP_WARNING_LOOPS = 1000;
const NESTED_LOOP_CRITICAL_LOOPS = 10000;
const NESTED_LOOP_MIN_TOTAL_TIME = 500;
const NESTED_LOOP_CRITICAL_TOTAL_TIME = 5000;
const MATERIALIZE_WARNING_LOOPS = 100;
const MATERIALIZE_CRITICAL_LOOPS = 10000;
const MIN_READ_BLOCKS_LOW_SELECT = 1000;
const HASH_BATCHES_CRITICAL = 8;
const JOIN_FILTER_REMOVAL_WARNING = 10000;
const JOIN_FILTER_REMOVAL_CRITICAL = 1000000;
const ESTIMATE_MISMATCH_RATIO = 3;
const MIN_ROWS_ESTIMATE_MISMATCH = 100;
const WIDE_ROW_THRESHOLD = 2000;
const WIDE_ROW_MIN_ROWS = 10000;

// --- Helpers ---

const columnRefRe = /\b(\w+)\.(\w+)\b/g;
const castColRe = /\(([a-zA-Z_]\w*)\)::/g;
const stringLiteralRe = /'[^']*'/g;
const literalRe = /(?:^|[^<>!])=\s*'((?:[^']|'')*?)'/;

function extractConditionColumns(cond: string): string[] {
  if (!cond) return [];
  const cleaned = cond.replace(stringLiteralRe, '');
  const seen = new Set<string>();
  const cols: string[] = [];
  let m: RegExpExecArray | null;
  const re1 = new RegExp(columnRefRe.source, 'g');
  while ((m = re1.exec(cleaned))) {
    if (!seen.has(m[2])) { seen.add(m[2]); cols.push(m[2]); }
  }
  const re2 = new RegExp(castColRe.source, 'g');
  while ((m = re2.exec(cleaned))) {
    if (!seen.has(m[1])) { seen.add(m[1]); cols.push(m[1]); }
  }
  return cols;
}

function conditionColumnsNotIn(filter: string, indexCond: string): string[] {
  const filterCols = extractConditionColumns(filter);
  const indexCols = new Set(extractConditionColumns(indexCond));
  return filterCols.filter(c => !indexCols.has(c));
}

function extractLiteralValue(cond: string): string {
  const m = literalRe.exec(cond);
  return m ? m[1].replace(/''/g, "'") : '';
}

function isJoinNode(node: PlanNode): boolean {
  return ['Hash Join', 'Merge Join', 'Nested Loop'].includes(node['Node Type']);
}

function nodeLabel(node: PlanNode): string {
  const rel = node['Relation Name'];
  const alias = node['Alias'];
  if (rel) {
    if (alias && alias !== rel) return `${node['Node Type']} on ${rel} (${alias})`;
    return `${node['Node Type']} on ${rel}`;
  }
  return node['Node Type'];
}

function findSiblingRows(childIdx: number, parent: PlanNode): number {
  const plans = parent.Plans || [];
  for (let i = 0; i < plans.length; i++) {
    if (i !== childIdx) return plans[i]['Actual Rows'] || plans[i]['Plan Rows'] || 0;
  }
  return -1;
}

function extractJoinColumnForTable(joinNode: PlanNode, relation: string, alias?: string): string {
  const cond = joinNode['Hash Cond'] || joinNode['Merge Cond'] || '';
  if (!cond) return '';
  for (const prefix of [alias, relation].filter(Boolean) as string[]) {
    const cols = extractConditionColumns(cond);
    const condLower = cond.toLowerCase();
    for (const col of cols) {
      if (condLower.includes(`${prefix.toLowerCase()}.${col.toLowerCase()}`)) return col;
    }
  }
  return '';
}

// --- CTE context ---

interface CTEInfo {
  name: string;
  node: PlanNode;
  estimatedRows: number;
  actualRows: number;
}

interface NodeRef {
  node: PlanNode;
  parent: PlanNode | null;
  childIdx: number;
}

interface PlanContext {
  ctes: Map<string, CTEInfo>;
  allNodes: NodeRef[];
}

function buildContext(root: PlanNode): PlanContext {
  const ctx: PlanContext = { ctes: new Map(), allNodes: [] };
  collectContext(root, null, -1, ctx);
  return ctx;
}

function collectContext(node: PlanNode, parent: PlanNode | null, childIdx: number, ctx: PlanContext) {
  ctx.allNodes.push({ node, parent, childIdx });
  if (node['Subplan Name']?.startsWith('CTE ')) {
    const name = node['Subplan Name'].slice(4);
    ctx.ctes.set(name, {
      name, node,
      estimatedRows: node['Plan Rows'] || 0,
      actualRows: node['Actual Rows'] || 0,
    });
  }
  for (let i = 0; i < (node.Plans?.length || 0); i++) {
    collectContext(node.Plans![i], node, i, ctx);
  }
}

// --- 15 Rules ---

type Rule = (node: PlanNode, parent: PlanNode | null, childIdx: number, ctx: PlanContext) => Finding[];

function checkIndexScanFilterInefficiency(node: PlanNode, parent: PlanNode | null): Finding[] {
  if (node['Node Type'] !== 'Index Scan' && node['Node Type'] !== 'Index Only Scan') return [];
  const filter = node['Filter'] || '';
  const removed = node['Rows Removed by Filter'] || 0;
  if (!filter || !removed) return [];
  const total = (node['Actual Rows'] || 0) + removed;
  if (!total) return [];
  let removedPct = (removed / total) * 100;
  if (removedPct < FILTER_REMOVAL_WARNING_PCT) return [];
  if (removedPct > FILTER_REMOVAL_CAP_PCT && (node['Actual Rows'] || 0) > 0) removedPct = FILTER_REMOVAL_CAP_PCT;
  const severity: Severity = removedPct > FILTER_REMOVAL_CRITICAL_PCT ? 'critical' : 'warning';
  const desc = `${node['Node Type']} on ${node['Relation Name']} using ${node['Index Name']} filters out ${removedPct.toFixed(2)}% of rows (${removed} of ${total})`;
  const missingCols = conditionColumnsNotIn(filter, node['Index Cond'] || '');
  const indexCols = extractConditionColumns(node['Index Cond'] || '');
  let suggestion: string;
  if (missingCols.length > 0 && indexCols.length > 0) {
    const composite = [...indexCols, ...missingCols].join(', ');
    suggestion = `Column \`${missingCols.join(', ')}\` in filter is not in index; consider composite index on (${composite})`;
    const lit = extractLiteralValue(filter);
    if (lit && missingCols.length === 1) suggestion += ` or partial index WHERE ${missingCols[0]} = '${lit}'`;
  } else {
    suggestion = `Add an index on ${node['Relation Name']} covering the filter condition`;
  }
  return [{ severity, nodeType: node['Node Type'], relation: node['Relation Name'] || '', description: desc, suggestion }];
}

function checkSeqScanInJoin(node: PlanNode, parent: PlanNode | null, childIdx: number): Finding[] {
  if (!parent || !isJoinNode(parent) || node['Node Type'] !== 'Seq Scan') return [];
  const rows = node['Actual Rows'] || node['Plan Rows'] || 0;
  if (rows < MIN_ROWS_SEQ_SCAN_WARNING) return [];
  const siblingRows = findSiblingRows(childIdx, parent);
  if (siblingRows <= 0 || siblingRows >= rows / 10) return [];
  const severity: Severity = rows > MIN_ROWS_CRITICAL_SEQ_SCAN ? 'critical' : 'warning';
  const desc = `Seq Scan on ${node['Relation Name']} scans ${rows} rows to join against ${siblingRows} rows`;
  const joinCol = extractJoinColumnForTable(parent, node['Relation Name'] || '', node['Alias']);
  const cond = parent['Hash Cond'] || parent['Merge Cond'] || '';
  const suggestion = joinCol
    ? (cond.toLowerCase().includes('lower(')
      ? `Consider index on lower(${joinCol}) to enable index lookup instead of full scan`
      : `Consider index on ${joinCol} to enable index lookup instead of full scan`)
    : 'Consider index on join column to enable index lookup instead of full scan';
  return [{ severity, nodeType: node['Node Type'], relation: node['Relation Name'] || '', description: desc, suggestion }];
}

function checkSeqScanStandalone(node: PlanNode, parent: PlanNode | null): Finding[] {
  if (node['Node Type'] !== 'Seq Scan' || !node['Filter']) return [];
  if (parent && isJoinNode(parent)) return [];
  const removed = node['Rows Removed by Filter'] || 0;
  if (!removed) return [];
  const rows = node['Actual Rows'] || node['Plan Rows'] || 0;
  if (rows < MIN_ROWS_SEQ_SCAN_WARNING) return [];
  const total = rows + removed;
  let removedPct = (removed / total) * 100;
  if (removedPct < FILTER_REMOVAL_WARNING_PCT) return [];
  if (removedPct > FILTER_REMOVAL_CAP_PCT && (node['Actual Rows'] || 0) > 0) removedPct = FILTER_REMOVAL_CAP_PCT;
  const severity: Severity = total > MIN_ROWS_CRITICAL_SCAN ? 'critical' : 'warning';
  const desc = `Seq Scan on ${node['Relation Name']} filters out ${removedPct.toFixed(2)}% of rows (${removed} of ${total})`;
  const filterCols = extractConditionColumns(node['Filter'] || '');
  let suggestion: string;
  if (filterCols.length > 0) {
    suggestion = `Consider index on ${node['Relation Name']}(${filterCols.join(', ')})`;
    const lit = extractLiteralValue(node['Filter'] || '');
    if (lit && filterCols.length === 1) suggestion += ` or partial index WHERE ${filterCols[0]} = '${lit}'`;
  } else {
    suggestion = `Add an index on ${node['Relation Name']} covering the filter condition`;
  }
  return [{ severity, nodeType: node['Node Type'], relation: node['Relation Name'] || '', description: desc, suggestion }];
}

function checkBitmapHeapRecheck(node: PlanNode): Finding[] {
  if (node['Node Type'] !== 'Bitmap Heap Scan') return [];
  const lossy = node['Lossy Heap Blocks'] || 0;
  if (!lossy) return [];
  const total = (node['Exact Heap Blocks'] || 0) + lossy;
  const lossyPct = (lossy / total) * 100;
  if (lossyPct < RECHECK_WARNING_PCT) return [];
  const severity: Severity = lossyPct > RECHECK_CRITICAL_PCT ? 'critical' : 'warning';
  return [{
    severity, nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `Bitmap Heap Scan on ${node['Relation Name']} has ${lossyPct.toFixed(1)}% lossy pages (${lossy} of ${total} blocks) — bitmap exceeded work_mem`,
    suggestion: 'Increase work_mem to keep bitmap exact, or use a more selective index to reduce bitmap size',
  }];
}

function checkNestedLoopHighLoops(node: PlanNode): Finding[] {
  if (node['Node Type'] !== 'Nested Loop' || !node.Plans || node.Plans.length < 2) return [];
  const inner = node.Plans[1];
  const loops = inner['Actual Loops'] || 0;
  if (loops < NESTED_LOOP_WARNING_LOOPS) return [];
  const innerTime = (inner['Actual Total Time'] || 0) * loops;
  if (innerTime < NESTED_LOOP_MIN_TOTAL_TIME) return [];
  const severity: Severity = innerTime > NESTED_LOOP_CRITICAL_TOTAL_TIME ? 'critical' : 'warning';
  const label = `${inner['Node Type']}${inner['Relation Name'] ? ' on ' + inner['Relation Name'] : ''}${inner['Index Name'] ? ' using ' + inner['Index Name'] : ''}`;
  let suggestion = 'Consider Hash Join or Merge Join; verify indexes exist on inner side join columns';
  if (inner['Node Type'] === 'Index Scan' && inner['Filter']) suggestion += `; filter on ${inner['Relation Name']} may warrant a more selective index`;
  return [{
    severity, nodeType: node['Node Type'], relation: inner['Relation Name'] || '',
    description: `Nested Loop executes ${label} ${loops} times (${innerTime.toFixed(1)}ms total, ${(inner['Actual Total Time'] || 0).toFixed(3)}ms/iter)`,
    suggestion,
  }];
}

function checkSubPlanHighLoops(node: PlanNode): Finding[] {
  if (node['Parent Relationship'] !== 'SubPlan') return [];
  const loops = node['Actual Loops'] || 0;
  if (loops < NESTED_LOOP_WARNING_LOOPS) return [];
  const severity: Severity = loops > NESTED_LOOP_CRITICAL_LOOPS ? 'critical' : 'warning';
  const totalTime = (node['Actual Total Time'] || 0) * loops;
  return [{
    severity, nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `Correlated SubPlan executes ${loops} times (${totalTime.toFixed(1)}ms total)`,
    suggestion: 'Rewrite as a JOIN or lateral join to avoid per-row subquery execution',
  }];
}

function checkSortSpill(node: PlanNode): Finding[] {
  if (node['Sort Space Type'] !== 'Disk') return [];
  return [{
    severity: 'critical', nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `Sort spilled to disk (${node['Sort Space Used'] || 0}kB) on ${nodeLabel(node)}`,
    suggestion: `Increase work_mem (currently needs >${node['Sort Space Used'] || 0}kB) or reduce data before sorting`,
  }];
}

function checkHashSpill(node: PlanNode): Finding[] {
  const batches = node['Hash Batches'] || 0;
  if (batches <= 1) return [];
  const severity: Severity = batches > HASH_BATCHES_CRITICAL ? 'critical' : 'warning';
  return [{
    severity, nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `Hash used ${batches} batches with ${node['Peak Memory Usage'] || 0}kB memory on ${nodeLabel(node)}`,
    suggestion: 'Increase work_mem to fit the hash table in memory',
  }];
}

function checkTempBlocks(node: PlanNode): Finding[] {
  const total = (node['Temp Read Blocks'] || 0) + (node['Temp Written Blocks'] || 0);
  if (!total) return [];
  const sizeMB = (total * 8) / 1024;
  return [{
    severity: 'warning', nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `Temp I/O: ${total} blocks (${sizeMB.toFixed(1)} MB) on ${nodeLabel(node)}`,
    suggestion: 'Increase work_mem or restructure query to reduce intermediate result size',
  }];
}

function checkWorkerMismatch(node: PlanNode): Finding[] {
  const planned = node['Workers Planned'] || 0;
  const launched = node['Workers Launched'] || 0;
  if (!planned || launched >= planned) return [];
  return [{
    severity: 'warning', nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `Only ${launched} of ${planned} planned parallel workers launched on ${nodeLabel(node)}`,
    suggestion: 'Check max_parallel_workers and max_parallel_workers_per_gather settings',
  }];
}

function checkParallelOverhead(node: PlanNode): Finding[] {
  if (node['Node Type'] !== 'Gather' && node['Node Type'] !== 'Gather Merge') return [];
  if (!node.Plans?.length) return [];
  const child = node.Plans[0];
  if (!child['Actual Loops']) return [];
  const workerTime = (child['Actual Total Time'] || 0) * (child['Actual Loops'] || 1);
  const gatherTime = node['Actual Total Time'] || 0;
  if (gatherTime <= workerTime) return [];
  const overhead = gatherTime - workerTime;
  return [{
    severity: 'info', nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `${node['Node Type']} overhead (${overhead.toFixed(1)}ms) exceeds parallel benefit (workers: ${workerTime.toFixed(1)}ms, gather: ${gatherTime.toFixed(1)}ms)`,
    suggestion: 'Parallel execution not beneficial here; consider SET max_parallel_workers_per_gather = 0 for this query',
  }];
}

function checkLargeJoinFilterRemoval(node: PlanNode): Finding[] {
  const removed = node['Rows Removed by Join Filter'] || 0;
  if (removed < JOIN_FILTER_REMOVAL_WARNING) return [];
  const severity: Severity = removed > JOIN_FILTER_REMOVAL_CRITICAL ? 'critical' : 'warning';
  return [{
    severity, nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `Join filter removed ${removed} rows on ${nodeLabel(node)}`,
    suggestion: 'Move filter condition into the join clause or add an index to reduce join input',
  }];
}

function checkMaterializeHighLoops(node: PlanNode): Finding[] {
  if (node['Node Type'] !== 'Materialize') return [];
  const loops = node['Actual Loops'] || 0;
  if (loops < MATERIALIZE_WARNING_LOOPS) return [];
  const severity: Severity = loops > MATERIALIZE_CRITICAL_LOOPS ? 'critical' : 'warning';
  const totalTime = (node['Actual Total Time'] || 0) * loops;
  return [{
    severity, nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `Materialize scanned ${loops} times (${totalTime.toFixed(1)}ms total, ${node['Actual Rows'] || 0} rows per scan)`,
    suggestion: "Planner couldn't find a better strategy; consider restructuring the query to use a Hash Join or CTE",
  }];
}

function checkIndexScanLowSelectivity(node: PlanNode): Finding[] {
  if (node['Node Type'] !== 'Index Scan' && node['Node Type'] !== 'Index Only Scan') return [];
  if ((node['Actual Rows'] || 0) < MIN_ROWS_LOW_SELECTIVITY) return [];
  const totalBlocks = (node['Shared Hit Blocks'] || 0) + (node['Shared Read Blocks'] || 0);
  if (!totalBlocks || (node['Shared Read Blocks'] || 0) < MIN_READ_BLOCKS_LOW_SELECT) return [];
  const readPct = ((node['Shared Read Blocks'] || 0) / totalBlocks) * 100;
  if (readPct < READ_BLOCKS_CRITICAL_PCT) return [];
  if (node['Filter'] && (node['Rows Removed by Filter'] || 0) > 0) return [];
  return [{
    severity: 'info', nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `${node['Node Type']} on ${node['Relation Name']} using ${node['Index Name']} returned ${node['Actual Rows']} rows reading ${totalBlocks} blocks (${Math.round(readPct)}% from disk)`,
    suggestion: 'Index has low selectivity for this query; a Seq Scan may be cheaper, or the query may benefit from a more selective condition',
  }];
}

function checkWideRows(node: PlanNode): Finding[] {
  if ((node['Plan Width'] || 0) < WIDE_ROW_THRESHOLD) return [];
  const rows = node['Actual Rows'] || node['Plan Rows'] || 0;
  if (rows < WIDE_ROW_MIN_ROWS) return [];
  return [{
    severity: 'info', nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    description: `${nodeLabel(node)} produces ${rows} rows at ${node['Plan Width']} bytes wide`,
    suggestion: 'Select only needed columns to reduce memory usage and improve cache efficiency',
  }];
}

// --- CTE estimate mismatch (consolidated) ---

function collectSourceRelations(node: PlanNode, relations: string[]) {
  if (node['Relation Name']) relations.push(node['Relation Name']);
  for (const child of node.Plans || []) collectSourceRelations(child, relations);
}

function collectAncestors(current: PlanNode, target: PlanNode, ancestors: Set<PlanNode>): boolean {
  if (current === target) return true;
  for (const child of current.Plans || []) {
    if (collectAncestors(child, target, ancestors)) { ancestors.add(current); return true; }
  }
  return false;
}

function consolidateEstimateMismatches(root: PlanNode, ctx: PlanContext): Finding[] {
  const findings: Finding[] = [];
  for (const [, cte] of ctx.ctes) {
    if (!cte.actualRows || !cte.estimatedRows || cte.actualRows < MIN_ROWS_ESTIMATE_MISMATCH) continue;
    let ratio = cte.estimatedRows / cte.actualRows;
    if (ratio < 1) ratio = 1 / ratio;
    if (ratio < ESTIMATE_MISMATCH_RATIO) continue;

    // Find consumers of this CTE
    const consumers = ctx.allNodes.filter(r => r.node['CTE Name'] === cte.name).map(r => r.node);
    if (!consumers.length) continue;

    const ancestorNodes = new Set<PlanNode>();
    for (const consumer of consumers) collectAncestors(root, consumer, ancestorNodes);

    const affected: string[] = [];
    for (const n of ancestorNodes) {
      if (n['Plan Rows'] && n['Actual Rows'] && n['Actual Loops']) {
        let r = n['Plan Rows'] / n['Actual Rows'];
        if (r < 1) r = 1 / r;
        if (r > ESTIMATE_MISMATCH_RATIO) affected.push(n['Node Type']);
      }
    }
    if (!affected.length) continue;

    const direction = cte.estimatedRows > cte.actualRows ? 'inflated' : 'deflated';
    const sourceRelations: string[] = [];
    collectSourceRelations(cte.node, sourceRelations);
    const unique = [...new Set(affected)];
    let suggestion = `Affects ${unique.join(', ')} estimates`;
    if (sourceRelations.length) suggestion += `; run ANALYZE on ${[...new Set(sourceRelations)].join(' and ')}`;

    findings.push({
      severity: 'info', nodeType: 'CTE', relation: cte.name,
      description: `Row estimates ${direction} downstream of CTE ${cte.name} (estimated ${cte.estimatedRows}, actual ${cte.actualRows})`,
      suggestion,
    });
  }
  return findings;
}

// --- Main analyzer ---

const defaultRules: Rule[] = [
  (n, p, i) => checkIndexScanFilterInefficiency(n, p),
  (n, p, i) => checkSeqScanInJoin(n, p, i),
  (n, p) => checkSeqScanStandalone(n, p),
  (n) => checkBitmapHeapRecheck(n),
  (n) => checkNestedLoopHighLoops(n),
  (n) => checkSubPlanHighLoops(n),
  (n) => checkSortSpill(n),
  (n) => checkHashSpill(n),
  (n) => checkTempBlocks(n),
  (n) => checkWorkerMismatch(n),
  (n) => checkParallelOverhead(n),
  (n) => checkLargeJoinFilterRemoval(n),
  (n) => checkMaterializeHighLoops(n),
  (n) => checkIndexScanLowSelectivity(n),
  (n) => checkWideRows(n),
];

function walkTree(node: PlanNode, parent: PlanNode | null, childIdx: number, ctx: PlanContext, findings: Finding[]) {
  for (const rule of defaultRules) {
    findings.push(...rule(node, parent, childIdx, ctx));
  }
  for (let i = 0; i < (node.Plans?.length || 0); i++) {
    walkTree(node.Plans![i], node, i, ctx, findings);
  }
}

const severityOrder: Record<Severity, number> = { critical: 2, warning: 1, info: 0 };

export function analyzePlan(explainOutput: any[]): AnalysisResult {
  const wrapper = explainOutput[0];
  const root: PlanNode = wrapper?.Plan || wrapper;
  if (!root) return { findings: [], totalCost: 0, executionTime: 0, planningTime: 0 };

  const ctx = buildContext(root);
  const findings: Finding[] = [];
  walkTree(root, null, -1, ctx, findings);
  findings.push(...consolidateEstimateMismatches(root, ctx));
  findings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

  return {
    findings,
    totalCost: root['Total Cost'] || 0,
    executionTime: wrapper?.['Execution Time'] || root['Actual Total Time'] || 0,
    planningTime: wrapper?.['Planning Time'] || 0,
  };
}
