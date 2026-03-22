export interface ConnectionConfig {
  id?: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

export interface SavedConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  ssl: boolean;
  connected?: boolean;
}

export interface QueryResult {
  queryId: string;
  columns: { name: string; dataType: string }[];
  rows: Record<string, any>[];
  rowCount: number;
  totalRows?: number;
  hasMore?: boolean;
  command: string;
  duration: number;
  error?: string;
}

export interface BatchResult {
  queryId: string;
  results: QueryResult[];
  totalDuration: number;
}

export interface TreeNode {
  id: string;
  label: string;
  type: 'server' | 'database' | 'schema' | 'table' | 'view' | 'function' | 'column' | 'folder';
  children?: TreeNode[];
  isLoaded?: boolean;
  isExpanded?: boolean;
  connectionId?: string;
  schema?: string;
  table?: string;
  meta?: Record<string, any>;
}

export interface QueryTab {
  id: string;
  title: string;
  sql: string;
  connectionId: string | null;
  batchResult: BatchResult | null;
  activeResultIndex: number;
  isExecuting: boolean;
  lastExecutedSql?: string;
  loadedOffset?: number;
  isLoadingMore?: boolean;
}

export interface QueryHistoryEntry {
  id: string;
  sql: string;
  connectionId: string;
  timestamp: number;
  duration: number;
  rowCount: number;
  error?: string;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_primary_key: boolean;
}

export interface IndexInfo { name: string; definition: string; }
export interface ConstraintInfo { name: string; type: string; columns: string; foreign_schema?: string; foreign_table?: string; foreign_columns?: string; }

export interface AutocompleteData {
  tables: { schema: string; name: string; type: string }[];
  columns: { schema: string; table_name: string; name: string; data_type: string }[];
  functions: { schema: string; name: string; type: string }[];
}

// ─── Advanced Feature Types ───

export interface ExplainNode {
  'Node Type': string;
  'Relation Name'?: string;
  'Schema'?: string;
  'Alias'?: string;
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
  'Filter'?: string;
  'Rows Removed by Filter'?: number;
  'Index Name'?: string;
  'Index Cond'?: string;
  'Join Type'?: string;
  'Hash Cond'?: string;
  'Sort Key'?: string[];
  'Sort Method'?: string;
  Plans?: ExplainNode[];
  [key: string]: any;
}

export interface IndexSuggestion {
  table: string;
  columns: string[];
  reason: string;
  createSql: string;
}

export interface TableStat {
  schema: string;
  table: string;
  live_rows: number;
  dead_rows: number;
  dead_pct: number;
  last_vacuum: string | null;
  last_autovacuum: string | null;
  last_analyze: string | null;
  last_autoanalyze: string | null;
  seq_scan: number;
  idx_scan: number;
  idx_hit_pct: number;
  total_size: number;
}

export interface SchemaDiff {
  table: string;
  status: 'added' | 'removed' | 'modified';
  details: { column: string; change: string }[];
}

export interface SlowQuery {
  queryid: string;
  query: string;
  calls: number;
  total_time_ms: number;
  avg_time_ms: number;
  min_time_ms?: number;
  max_time_ms?: number;
  rows: number;
  shared_blks_hit: number;
  shared_blks_read: number;
  cache_hit_pct?: number;
}

export interface ERTable {
  name: string;
  columns: { table_name: string; column_name: string; data_type: string; is_nullable: string; is_pk: boolean }[];
}

export interface ERRelationship {
  source_table: string;
  source_column: string;
  target_table: string;
  target_column: string;
  constraint_name: string;
}

export interface PlanHistoryEntry {
  id: string;
  connectionId: string;
  sql: string;
  plan: any;
  settings?: Record<string, string>;
  timestamp: number;
}

export interface QueryBookmark {
  id: string;
  name: string;
  sql: string;
  tags: string[];
  connectionId?: string;
  createdAt: number;
}

export interface FunctionParameter {
  name: string;
  data_type: string;
  udt_name: string;
  mode: string;
  default_value: string | null;
  position: number;
}

export interface FunctionDetails {
  parameters: FunctionParameter[];
  return_type: string;
  volatility: string;
  kind: string;
}

// ─── pgvector Types ───

// ─── Plan Analysis Types (from pgplan) ───

export type PlanFindingSeverity = 'critical' | 'warning' | 'info';

export interface PlanFinding {
  severity: PlanFindingSeverity;
  nodeType: string;
  relation: string;
  description: string;
  suggestion: string;
}

export interface PlanAnalysisResult {
  findings: PlanFinding[];
  totalCost: number;
  executionTime: number;
  planningTime: number;
}

// ─── Plan Comparison Types (from pgplan) ───

export type ComparisonDirection = 'improved' | 'regressed' | 'unchanged';
export type ComparisonChangeType = 'no_change' | 'modified' | 'added' | 'removed' | 'type_changed';

export interface PlanNodeDelta {
  nodeType: string;
  relation: string;
  changeType: ComparisonChangeType;
  oldNodeType?: string;
  newNodeType?: string;
  oldCost: number; newCost: number; costDelta: number; costPct: number; costDir: ComparisonDirection;
  oldTime: number; newTime: number; timeDelta: number; timePct: number; timeDir: ComparisonDirection;
  oldRows: number; newRows: number; rowsDelta: number; rowsPct: number;
  oldLoops: number; newLoops: number;
  oldFilter: string; newFilter: string;
  oldIndexName: string; newIndexName: string;
  oldSortSpill: boolean; newSortSpill: boolean;
  oldHashBatches: number; newHashBatches: number;
  oldBufferReads: number; newBufferReads: number;
  bufferDir: ComparisonDirection;
  children: PlanNodeDelta[];
}

export interface PlanComparisonSummary {
  oldTotalCost: number; newTotalCost: number; costDelta: number; costPct: number; costDir: ComparisonDirection;
  oldExecutionTime: number; newExecutionTime: number; timeDelta: number; timePct: number; timeDir: ComparisonDirection;
  nodesAdded: number; nodesRemoved: number; nodesModified: number; nodesTypeChanged: number;
  verdict: string;
}

export interface PlanComparisonResult {
  deltas: PlanNodeDelta[];
  summary: PlanComparisonSummary;
}

// ─── pgvector Types (continued) ───

export interface PgVectorStatus {
  installed: boolean;
  version: string | null;
  vectorColumns: VectorColumnInfo[];
  vectorIndexes: VectorIndexInfo[];
  hints: PgVectorHint[];
}

export interface VectorColumnInfo {
  schema: string;
  table: string;
  column: string;
  dimensions: number | null;
  hasIndex: boolean;
  rowEstimate: number;
  storageSetting: string | null;
}

export interface VectorIndexInfo {
  schema: string;
  table: string;
  indexName: string;
  indexMethod: string;
  opclass: string;
  definition: string;
}

export interface PgVectorHint {
  type: 'info' | 'warning' | 'suggestion';
  category: string;
  message: string;
  sql?: string;
}
