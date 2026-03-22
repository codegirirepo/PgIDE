import type {
  ConnectionConfig, SavedConnection, BatchResult, AutocompleteData,
  ExplainNode, IndexSuggestion, TableStat, SchemaDiff, SlowQuery, ERTable, ERRelationship,
  PlanHistoryEntry, PgVectorStatus, PgVectorHint,
  PlanAnalysisResult, PlanComparisonResult, FunctionDetails,
} from '@/types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export const api = {
  // Connections
  getConnections: () => request<SavedConnection[]>('/connections'),
  saveConnection: (config: ConnectionConfig) =>
    request<SavedConnection>('/connections', { method: 'POST', body: JSON.stringify(config) }),
  deleteConnection: (id: string) =>
    request<{ success: boolean }>(`/connections/${id}`, { method: 'DELETE' }),
  testConnection: (config: ConnectionConfig) =>
    request<{ success: boolean; message: string; version?: string }>('/connections/test', { method: 'POST', body: JSON.stringify(config) }),
  connect: (id: string) =>
    request<{ success: boolean; message: string }>(`/connections/${id}/connect`, { method: 'POST' }),
  disconnect: (id: string) =>
    request<{ success: boolean }>(`/connections/${id}/disconnect`, { method: 'POST' }),

  // Metadata
  getDatabases: (connId: string) => request<{ name: string; size: string }[]>(`/metadata/${connId}/databases`),
  getSchemas: (connId: string) => request<{ name: string }[]>(`/metadata/${connId}/schemas`),
  getTables: (connId: string, schema: string) =>
    request<{ name: string; size: string }[]>(`/metadata/${connId}/schemas/${schema}/tables`),
  getViews: (connId: string, schema: string) =>
    request<{ name: string }[]>(`/metadata/${connId}/schemas/${schema}/views`),
  getFunctions: (connId: string, schema: string) =>
    request<{ name: string; type: string; args: string }[]>(`/metadata/${connId}/schemas/${schema}/functions`),
  getFunctionDefinition: (connId: string, schema: string, funcName: string, args?: string) =>
    request<{ definition: string }>(`/metadata/${connId}/schemas/${schema}/functions/${encodeURIComponent(funcName)}/definition${args ? `?args=${encodeURIComponent(args)}` : ''}`),
  getFunctionParameters: (connId: string, schema: string, funcName: string, args?: string) =>
    request<FunctionDetails>(`/metadata/${connId}/schemas/${schema}/functions/${encodeURIComponent(funcName)}/parameters${args ? `?args=${encodeURIComponent(args)}` : ''}`),
  getColumns: (connId: string, schema: string, table: string) =>
    request<any[]>(`/metadata/${connId}/schemas/${schema}/tables/${table}/columns`),
  getIndexes: (connId: string, schema: string, table: string) =>
    request<any[]>(`/metadata/${connId}/schemas/${schema}/tables/${table}/indexes`),
  getConstraints: (connId: string, schema: string, table: string) =>
    request<any[]>(`/metadata/${connId}/schemas/${schema}/tables/${table}/constraints`),
  getAutocomplete: (connId: string) => request<AutocompleteData>(`/metadata/${connId}/autocomplete`),

  // Query
  executeQuery: (connectionId: string, sql: string, offset?: number, limit?: number) =>
    request<BatchResult>('/query/execute', { method: 'POST', body: JSON.stringify({ connectionId, sql, offset, limit }) }),
  cancelQuery: (queryId: string) =>
    request<{ cancelled: boolean }>('/query/cancel', { method: 'POST', body: JSON.stringify({ queryId }) }),

  // Advanced
  getExplainPlan: (connectionId: string, sql: string) =>
    request<ExplainNode[]>('/advanced/explain', { method: 'POST', body: JSON.stringify({ connectionId, sql }) }),
  getIndexAdvice: (connectionId: string, sql: string) =>
    request<{ plan: any; suggestions: IndexSuggestion[] }>('/advanced/index-advice', { method: 'POST', body: JSON.stringify({ connectionId, sql }) }),
  getTableStats: (connId: string) =>
    request<{ tables: TableStat[]; cacheHitRatio: number }>(`/advanced/table-stats/${connId}`),
  getSchemaDiff: (sourceConnId: string, targetConnId: string) =>
    request<SchemaDiff[]>('/advanced/schema-diff', { method: 'POST', body: JSON.stringify({ sourceConnId, targetConnId }) }),
  generateMigration: (sourceConnId: string, targetConnId: string) =>
    request<{ diffs: SchemaDiff[]; sql: string }>('/advanced/migration', { method: 'POST', body: JSON.stringify({ sourceConnId, targetConnId }) }),
  getSlowQueries: (connId: string) =>
    request<{ available: boolean; queries: SlowQuery[]; message?: string }>(`/advanced/slow-queries/${connId}`),
  getERDiagram: (connId: string, schema: string) =>
    request<{ tables: ERTable[]; relationships: ERRelationship[] }>(`/advanced/er-diagram/${connId}/${schema}`),
  getPrimaryKeys: (connId: string, schema: string, table: string) =>
    request<string[]>(`/advanced/pk/${connId}/${schema}/${table}`),
  getExplainWithSettings: (connectionId: string, sql: string, settings: Record<string, string>) =>
    request<ExplainNode[]>('/advanced/explain-with-settings', { method: 'POST', body: JSON.stringify({ connectionId, sql, settings }) }),
  savePlanHistory: (connectionId: string, sql: string, plan: any, settings?: Record<string, string>) =>
    request<PlanHistoryEntry>('/advanced/plan-history', { method: 'POST', body: JSON.stringify({ connectionId, sql, plan, settings }) }),
  getPlanHistory: (connId?: string) =>
    request<PlanHistoryEntry[]>(`/advanced/plan-history${connId ? `/${connId}` : ''}`),
  clearPlanHistory: () =>
    request<{ success: boolean }>('/advanced/plan-history', { method: 'DELETE' }),

  // Plan analysis & comparison
  analyzePlan: (plan: any) =>
    request<PlanAnalysisResult>('/advanced/analyze-plan', { method: 'POST', body: JSON.stringify({ plan }) }),
  comparePlans: (oldPlan: any, newPlan: any, threshold = 5) =>
    request<PlanComparisonResult>('/advanced/compare-plans', { method: 'POST', body: JSON.stringify({ oldPlan, newPlan, threshold }) }),

  // Vacuum
  vacuumTable: (connectionId: string, schema: string, table: string) =>
    request<{ success: boolean; message: string }>('/advanced/vacuum', { method: 'POST', body: JSON.stringify({ connectionId, schema, table }) }),

  // Dump & Import
  getDumpSchemas: (connId: string) => request<string[]>(`/dump/schemas/${connId}`),
  exportDatabase: async (connectionId: string, options: { schemaOnly?: boolean; dataOnly?: boolean; tables?: string[]; schema?: string } = {}) => {
    const res = await fetch(`${BASE}/dump/export`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectionId, ...options }),
    });
    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Export failed'); }
    return res.text();
  },
  importSQL: (connectionId: string, sql: string) =>
    request<{ success: boolean; message: string }>('/dump/import', { method: 'POST', body: JSON.stringify({ connectionId, sql }) }),

  // pgvector
  getPgVectorStatus: (connId: string) => request<PgVectorStatus>(`/metadata/${connId}/pgvector`),
  analyzePgVectorSQL: (connId: string, sql: string) =>
    request<{ hints: PgVectorHint[] }>(`/metadata/${connId}/pgvector/analyze`, { method: 'POST', body: JSON.stringify({ sql }) }),
};
