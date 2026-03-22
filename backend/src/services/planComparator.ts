// Plan Comparator — ported from github.com/JacobArthurs/pgplan
// Per-node diff of two EXPLAIN plans with significance threshold

export type Direction = 'improved' | 'regressed' | 'unchanged';
export type ChangeType = 'no_change' | 'modified' | 'added' | 'removed' | 'type_changed';

export interface NodeDelta {
  nodeType: string;
  relation: string;
  changeType: ChangeType;
  oldNodeType?: string;
  newNodeType?: string;
  oldCost: number; newCost: number; costDelta: number; costPct: number; costDir: Direction;
  oldTime: number; newTime: number; timeDelta: number; timePct: number; timeDir: Direction;
  oldRows: number; newRows: number; rowsDelta: number; rowsPct: number;
  oldLoops: number; newLoops: number;
  oldRowsRemovedByFilter: number; newRowsRemovedByFilter: number;
  oldWorkersLaunched: number; newWorkersLaunched: number;
  oldWorkersPlanned: number; newWorkersPlanned: number;
  oldBufferReads: number; newBufferReads: number;
  oldBufferHits: number; newBufferHits: number;
  bufferDir: Direction;
  oldSortSpill: boolean; newSortSpill: boolean;
  oldHashBatches: number; newHashBatches: number;
  oldFilter: string; newFilter: string;
  oldIndexCond: string; newIndexCond: string;
  oldIndexName: string; newIndexName: string;
  children: NodeDelta[];
}

export interface ComparisonSummary {
  oldTotalCost: number; newTotalCost: number; costDelta: number; costPct: number; costDir: Direction;
  oldExecutionTime: number; newExecutionTime: number; timeDelta: number; timePct: number; timeDir: Direction;
  oldPlanningTime: number; newPlanningTime: number; planningDir: Direction;
  nodesAdded: number; nodesRemoved: number; nodesModified: number; nodesTypeChanged: number;
  oldTotalReads: number; newTotalReads: number; oldTotalHits: number; newTotalHits: number;
  verdict: string;
}

export interface ComparisonResult {
  deltas: NodeDelta[];
  summary: ComparisonSummary;
}

function pctChange(old: number, nw: number): number {
  if (old === 0) return nw === 0 ? 0 : 100;
  return ((nw - old) / old) * 100;
}

function direction(old: number, nw: number, threshold: number, lowerBetter = true): Direction {
  if (Math.abs(pctChange(old, nw)) < threshold) return 'unchanged';
  if (lowerBetter) return nw < old ? 'improved' : 'regressed';
  return nw > old ? 'improved' : 'regressed';
}

function bufferDirection(old: any, nw: any, threshold: number): Direction {
  const oldTotal = (old['Shared Read Blocks'] || 0) + (old['Temp Read Blocks'] || 0) + (old['Temp Written Blocks'] || 0);
  const newTotal = (nw['Shared Read Blocks'] || 0) + (nw['Temp Read Blocks'] || 0) + (nw['Temp Written Blocks'] || 0);
  return direction(oldTotal, newTotal, threshold);
}

function isSignificant(d: NodeDelta, threshold: number): boolean {
  if (Math.abs(d.costPct) > threshold) return true;
  if (Math.abs(d.timePct) > threshold) return true;
  if (d.oldLoops !== d.newLoops && d.oldLoops > 0) {
    const ratio = d.newLoops / d.oldLoops;
    if (ratio > 2 || ratio < 0.5) return true;
  }
  if (d.oldRowsRemovedByFilter !== d.newRowsRemovedByFilter) return true;
  if (d.oldWorkersLaunched !== d.newWorkersLaunched) return true;
  if (d.oldSortSpill !== d.newSortSpill) return true;
  if (d.oldHashBatches !== d.newHashBatches) return true;
  if (d.oldBufferReads !== d.newBufferReads) return true;
  if (d.oldFilter !== d.newFilter) return true;
  if (d.oldIndexCond !== d.newIndexCond) return true;
  if (d.oldIndexName !== d.newIndexName) return true;
  return false;
}

function diffNodes(old: any, nw: any, threshold: number): NodeDelta {
  const delta: NodeDelta = {
    nodeType: old['Node Type'],
    relation: old['Relation Name'] || nw['Relation Name'] || '',
    changeType: old['Node Type'] !== nw['Node Type'] ? 'type_changed' : 'modified',
    oldNodeType: old['Node Type'] !== nw['Node Type'] ? old['Node Type'] : undefined,
    newNodeType: old['Node Type'] !== nw['Node Type'] ? nw['Node Type'] : undefined,
    oldCost: old['Total Cost'] || 0, newCost: nw['Total Cost'] || 0,
    costDelta: (nw['Total Cost'] || 0) - (old['Total Cost'] || 0),
    costPct: pctChange(old['Total Cost'] || 0, nw['Total Cost'] || 0),
    costDir: direction(old['Total Cost'] || 0, nw['Total Cost'] || 0, threshold),
    oldTime: old['Actual Total Time'] || 0, newTime: nw['Actual Total Time'] || 0,
    timeDelta: (nw['Actual Total Time'] || 0) - (old['Actual Total Time'] || 0),
    timePct: pctChange(old['Actual Total Time'] || 0, nw['Actual Total Time'] || 0),
    timeDir: direction(old['Actual Total Time'] || 0, nw['Actual Total Time'] || 0, threshold),
    oldRows: old['Actual Rows'] || 0, newRows: nw['Actual Rows'] || 0,
    rowsDelta: (nw['Actual Rows'] || 0) - (old['Actual Rows'] || 0),
    rowsPct: pctChange(old['Actual Rows'] || 0, nw['Actual Rows'] || 0),
    oldLoops: old['Actual Loops'] || 0, newLoops: nw['Actual Loops'] || 0,
    oldRowsRemovedByFilter: old['Rows Removed by Filter'] || 0,
    newRowsRemovedByFilter: nw['Rows Removed by Filter'] || 0,
    oldWorkersLaunched: old['Workers Launched'] || 0, newWorkersLaunched: nw['Workers Launched'] || 0,
    oldWorkersPlanned: old['Workers Planned'] || 0, newWorkersPlanned: nw['Workers Planned'] || 0,
    oldBufferReads: (old['Shared Read Blocks'] || 0) + (old['Temp Read Blocks'] || 0),
    newBufferReads: (nw['Shared Read Blocks'] || 0) + (nw['Temp Read Blocks'] || 0),
    oldBufferHits: old['Shared Hit Blocks'] || 0, newBufferHits: nw['Shared Hit Blocks'] || 0,
    bufferDir: bufferDirection(old, nw, threshold),
    oldSortSpill: old['Sort Space Type'] === 'Disk', newSortSpill: nw['Sort Space Type'] === 'Disk',
    oldHashBatches: old['Hash Batches'] || 0, newHashBatches: nw['Hash Batches'] || 0,
    oldFilter: old['Filter'] || '', newFilter: nw['Filter'] || '',
    oldIndexCond: old['Index Cond'] || '', newIndexCond: nw['Index Cond'] || '',
    oldIndexName: old['Index Name'] || '', newIndexName: nw['Index Name'] || '',
    children: [],
  };

  if (old['Node Type'] !== nw['Node Type']) {
    delta.nodeType = nw['Node Type'];
  }

  if (delta.changeType === 'modified' && !isSignificant(delta, threshold)) {
    delta.changeType = 'no_change';
  }

  delta.children = diffChildren(old.Plans || [], nw.Plans || [], threshold);
  return delta;
}

function addedNode(node: any): NodeDelta {
  const d: NodeDelta = {
    changeType: 'added', nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    oldCost: 0, newCost: node['Total Cost'] || 0, costDelta: node['Total Cost'] || 0, costPct: 100, costDir: 'regressed',
    oldTime: 0, newTime: node['Actual Total Time'] || 0, timeDelta: node['Actual Total Time'] || 0, timePct: 100, timeDir: 'regressed',
    oldRows: 0, newRows: node['Actual Rows'] || 0, rowsDelta: node['Actual Rows'] || 0, rowsPct: 100,
    oldLoops: 0, newLoops: node['Actual Loops'] || 0,
    oldRowsRemovedByFilter: 0, newRowsRemovedByFilter: node['Rows Removed by Filter'] || 0,
    oldWorkersLaunched: 0, newWorkersLaunched: node['Workers Launched'] || 0,
    oldWorkersPlanned: 0, newWorkersPlanned: node['Workers Planned'] || 0,
    oldBufferReads: 0, newBufferReads: (node['Shared Read Blocks'] || 0) + (node['Temp Read Blocks'] || 0),
    oldBufferHits: 0, newBufferHits: node['Shared Hit Blocks'] || 0, bufferDir: 'unchanged',
    oldSortSpill: false, newSortSpill: node['Sort Space Type'] === 'Disk',
    oldHashBatches: 0, newHashBatches: node['Hash Batches'] || 0,
    oldFilter: '', newFilter: node['Filter'] || '',
    oldIndexCond: '', newIndexCond: node['Index Cond'] || '',
    oldIndexName: '', newIndexName: node['Index Name'] || '',
    children: (node.Plans || []).map(addedNode),
  };
  return d;
}

function removedNode(node: any): NodeDelta {
  const d: NodeDelta = {
    changeType: 'removed', nodeType: node['Node Type'], relation: node['Relation Name'] || '',
    oldCost: node['Total Cost'] || 0, newCost: 0, costDelta: -(node['Total Cost'] || 0), costPct: -100, costDir: 'improved',
    oldTime: node['Actual Total Time'] || 0, newTime: 0, timeDelta: -(node['Actual Total Time'] || 0), timePct: -100, timeDir: 'improved',
    oldRows: node['Actual Rows'] || 0, newRows: 0, rowsDelta: -(node['Actual Rows'] || 0), rowsPct: -100,
    oldLoops: node['Actual Loops'] || 0, newLoops: 0,
    oldRowsRemovedByFilter: node['Rows Removed by Filter'] || 0, newRowsRemovedByFilter: 0,
    oldWorkersLaunched: node['Workers Launched'] || 0, newWorkersLaunched: 0,
    oldWorkersPlanned: node['Workers Planned'] || 0, newWorkersPlanned: 0,
    oldBufferReads: (node['Shared Read Blocks'] || 0) + (node['Temp Read Blocks'] || 0), newBufferReads: 0,
    oldBufferHits: node['Shared Hit Blocks'] || 0, newBufferHits: 0, bufferDir: 'unchanged',
    oldSortSpill: node['Sort Space Type'] === 'Disk', newSortSpill: false,
    oldHashBatches: node['Hash Batches'] || 0, newHashBatches: 0,
    oldFilter: node['Filter'] || '', newFilter: '',
    oldIndexCond: node['Index Cond'] || '', newIndexCond: '',
    oldIndexName: node['Index Name'] || '', newIndexName: '',
    children: (node.Plans || []).map(removedNode),
  };
  return d;
}

function diffChildren(oldKids: any[], newKids: any[], threshold: number): NodeDelta[] {
  const len = Math.max(oldKids.length, newKids.length);
  const deltas: NodeDelta[] = [];
  for (let i = 0; i < len; i++) {
    if (i >= oldKids.length) { deltas.push(addedNode(newKids[i])); continue; }
    if (i >= newKids.length) { deltas.push(removedNode(oldKids[i])); continue; }
    deltas.push(diffNodes(oldKids[i], newKids[i], threshold));
  }
  return deltas;
}

function countChanges(delta: NodeDelta, summary: ComparisonSummary) {
  switch (delta.changeType) {
    case 'added': summary.nodesAdded++; break;
    case 'removed': summary.nodesRemoved++; break;
    case 'modified': summary.nodesModified++; break;
    case 'type_changed': summary.nodesTypeChanged++; break;
  }
  for (const child of delta.children) countChanges(child, summary);
}

const verdicts: Record<string, string> = {
  'improved|improved': 'faster and cheaper',
  'regressed|regressed': 'slower and more expensive',
  'improved|regressed': 'faster but higher estimated cost',
  'regressed|improved': 'cheaper but slower execution',
  'improved|unchanged': 'faster',
  'regressed|unchanged': 'slower',
  'unchanged|improved': 'cheaper',
  'unchanged|regressed': 'more expensive',
};

export function comparePlans(oldPlan: any[], newPlan: any[], threshold = 5): ComparisonResult {
  const oldWrapper = oldPlan[0];
  const newWrapper = newPlan[0];
  const oldRoot = oldWrapper?.Plan || oldWrapper;
  const newRoot = newWrapper?.Plan || newWrapper;

  const rootDelta = diffNodes(oldRoot, newRoot, threshold);

  const summary: ComparisonSummary = {
    oldTotalCost: oldRoot['Total Cost'] || 0,
    newTotalCost: newRoot['Total Cost'] || 0,
    costDelta: (newRoot['Total Cost'] || 0) - (oldRoot['Total Cost'] || 0),
    costPct: pctChange(oldRoot['Total Cost'] || 0, newRoot['Total Cost'] || 0),
    costDir: direction(oldRoot['Total Cost'] || 0, newRoot['Total Cost'] || 0, threshold),
    oldExecutionTime: oldWrapper?.['Execution Time'] || oldRoot['Actual Total Time'] || 0,
    newExecutionTime: newWrapper?.['Execution Time'] || newRoot['Actual Total Time'] || 0,
    timeDelta: (newWrapper?.['Execution Time'] || newRoot['Actual Total Time'] || 0) - (oldWrapper?.['Execution Time'] || oldRoot['Actual Total Time'] || 0),
    timePct: pctChange(oldWrapper?.['Execution Time'] || oldRoot['Actual Total Time'] || 0, newWrapper?.['Execution Time'] || newRoot['Actual Total Time'] || 0),
    timeDir: direction(oldWrapper?.['Execution Time'] || oldRoot['Actual Total Time'] || 0, newWrapper?.['Execution Time'] || newRoot['Actual Total Time'] || 0, threshold),
    oldPlanningTime: oldWrapper?.['Planning Time'] || 0,
    newPlanningTime: newWrapper?.['Planning Time'] || 0,
    planningDir: direction(oldWrapper?.['Planning Time'] || 0, newWrapper?.['Planning Time'] || 0, threshold),
    nodesAdded: 0, nodesRemoved: 0, nodesModified: 0, nodesTypeChanged: 0,
    oldTotalReads: (oldRoot['Shared Read Blocks'] || 0) + (oldRoot['Temp Read Blocks'] || 0),
    newTotalReads: (newRoot['Shared Read Blocks'] || 0) + (newRoot['Temp Read Blocks'] || 0),
    oldTotalHits: oldRoot['Shared Hit Blocks'] || 0,
    newTotalHits: newRoot['Shared Hit Blocks'] || 0,
    verdict: '',
  };

  countChanges(rootDelta, summary);
  summary.verdict = verdicts[`${summary.timeDir}|${summary.costDir}`] || 'no significant change';

  return { deltas: [rootDelta], summary };
}
