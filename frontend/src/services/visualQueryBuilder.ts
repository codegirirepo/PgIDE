// Visual Query Builder — SQL Generation Utilities
// Adapted from github.com/debba/tabularis

export type AggregateFunction = 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX' | 'COUNT_DISTINCT';

export interface VQBColumn {
  name: string;
  type: string;
}

export interface VQBTableData {
  label: string;
  columns: VQBColumn[];
  selectedColumns: Record<string, boolean>;
  columnAggregations: Record<string, { function?: AggregateFunction; alias?: string }>;
  columnAliases: Record<string, { alias?: string; order?: number }>;
}

export interface WhereCondition {
  id: string;
  column: string;
  operator: string;
  value: string;
  logicalOp: 'AND' | 'OR';
  isHaving: boolean;
}

export interface OrderByClause {
  id: string;
  column: string;
  direction: 'ASC' | 'DESC';
}

export interface VQBNode {
  id: string;
  data: VQBTableData;
}

export interface VQBEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  data?: { joinType: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL OUTER' | 'CROSS' };
}

function collectAliases(nodes: VQBNode[]): Record<string, string> {
  const aliases: Record<string, string> = {};
  nodes.forEach((n, i) => { aliases[n.id] = `t${i + 1}`; });
  return aliases;
}

function collectSelectedColumns(nodes: VQBNode[], aliases: Record<string, string>) {
  const cols: { expr: string; order: number }[] = [];
  const nonAggCols: string[] = [];
  let hasAgg = false;

  for (const node of nodes) {
    const d = node.data;
    const alias = aliases[node.id];
    for (const [col, checked] of Object.entries(d.selectedColumns)) {
      if (!checked) continue;
      const agg = d.columnAggregations[col];
      const colAlias = d.columnAliases[col];
      let expr = `${alias}.${col}`;
      let order = colAlias?.order ?? 999;

      if (agg?.function) {
        hasAgg = true;
        expr = agg.function === 'COUNT_DISTINCT'
          ? `COUNT(DISTINCT ${alias}.${col})`
          : `${agg.function}(${alias}.${col})`;
        if (agg.alias) expr += ` AS ${agg.alias}`;
      } else {
        nonAggCols.push(`${alias}.${col}`);
        if (colAlias?.alias) expr += ` AS ${colAlias.alias}`;
      }
      cols.push({ expr, order });
    }
  }
  cols.sort((a, b) => a.order - b.order);
  return { cols: cols.map(c => c.expr), hasAgg, nonAggCols };
}

function buildFromClause(nodes: VQBNode[], edges: VQBEdge[], aliases: Record<string, string>): string {
  if (!nodes.length) return '';
  if (!edges.length) {
    return '\nFROM\n  ' + nodes.map(n => `${n.data.label} ${aliases[n.id]}`).join(',\n  ');
  }

  const first = nodes[0];
  const processed = new Set<string>([first.id]);
  let sql = `\nFROM\n  ${first.data.label} ${aliases[first.id]}`;
  const remaining = [...edges];
  let progress = true;

  while (remaining.length && progress) {
    progress = false;
    for (let i = 0; i < remaining.length; i++) {
      const e = remaining[i];
      const srcDone = processed.has(e.source);
      const tgtDone = processed.has(e.target);

      if ((srcDone && !tgtDone) || (!srcDone && tgtDone)) {
        const newId = srcDone ? e.target : e.source;
        const newNode = nodes.find(n => n.id === newId);
        if (!newNode) continue;
        const joinType = e.data?.joinType || 'INNER';
        const srcAlias = aliases[e.source];
        const tgtAlias = aliases[e.target];
        sql += `\n${joinType} JOIN ${newNode.data.label} ${aliases[newId]} ON ${srcAlias}.${e.sourceHandle} = ${tgtAlias}.${e.targetHandle}`;
        processed.add(newId);
        remaining.splice(i, 1);
        progress = true;
        break;
      } else if (srcDone && tgtDone) {
        remaining.splice(i, 1);
        i--;
      }
    }
  }

  // Unconnected tables as comma-separated
  for (const n of nodes) {
    if (!processed.has(n.id)) sql += `,\n  ${n.data.label} ${aliases[n.id]}`;
  }
  return sql;
}

export function generateVisualQuerySQL(
  nodes: VQBNode[], edges: VQBEdge[],
  where: WhereCondition[], orderBy: OrderByClause[],
  groupBy: string[], limit: string,
): string {
  if (!nodes.length) return '';
  const aliases = collectAliases(nodes);
  const { cols, hasAgg, nonAggCols } = collectSelectedColumns(nodes, aliases);

  let sql = 'SELECT\n';
  sql += cols.length ? `  ${cols.join(',\n  ')}` : '  *';
  sql += buildFromClause(nodes, edges, aliases);

  // WHERE (non-aggregate)
  const normalWhere = where.filter(c => !c.isHaving && c.column && c.value);
  if (normalWhere.length) {
    sql += '\nWHERE\n  ' + normalWhere.map((c, i) => {
      const cond = `${c.column} ${c.operator} ${c.value}`;
      return i === 0 ? cond : `${c.logicalOp} ${cond}`;
    }).join('\n  ');
  }

  // GROUP BY
  const finalGroupBy = hasAgg && nonAggCols.length
    ? [...new Set([...nonAggCols, ...groupBy])]
    : groupBy.length ? groupBy : [];
  if (finalGroupBy.length) sql += '\nGROUP BY\n  ' + finalGroupBy.join(',\n  ');

  // HAVING (aggregate conditions)
  const havingConds = where.filter(c => c.isHaving && c.column && c.value);
  if (havingConds.length) {
    sql += '\nHAVING\n  ' + havingConds.map((c, i) => {
      const cond = `${c.column} ${c.operator} ${c.value}`;
      return i === 0 ? cond : `${c.logicalOp} ${cond}`;
    }).join('\n  ');
  }

  // ORDER BY
  if (orderBy.length) sql += '\nORDER BY\n  ' + orderBy.map(o => `${o.column} ${o.direction}`).join(',\n  ');

  // LIMIT
  if (limit?.trim()) sql += `\nLIMIT ${limit.trim()}`;

  return sql;
}

export function getAllColumnsFromNodes(nodes: VQBNode[]): string[] {
  const cols: string[] = [];
  nodes.forEach((n, i) => {
    const alias = `t${i + 1}`;
    n.data.columns.forEach(c => cols.push(`${alias}.${c.name}`));
  });
  return cols;
}
