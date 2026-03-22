import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState, addEdge,
  type Connection, type Edge, type Node, ReactFlowProvider, useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import TableNodeComponent from './TableNode';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/services/api';
import {
  generateVisualQuerySQL, getAllColumnsFromNodes,
  type VQBNode, type VQBEdge, type WhereCondition, type OrderByClause, type AggregateFunction,
} from '@/services/visualQueryBuilder';
import { Filter, SortAsc, Group, Hash, X, Plus, Table2, Play, Loader2, Link2, Code2, ChevronUp, ChevronDown, AlertCircle, CheckCircle2, Clock, Copy, Download } from 'lucide-react';
import type { QueryResult } from '@/types';

const JOIN_TYPES = ['INNER', 'LEFT', 'RIGHT', 'FULL OUTER', 'CROSS'] as const;
type JoinType = typeof JOIN_TYPES[number];

const nodeTypes = { table: TableNodeComponent };

function VisualQueryBuilderContent() {
  const { activeConnectionId, tabs, activeTabId, updateTab, addHistory, connections, setActiveConnection, setConnectionStatus } = useAppStore(s => ({
    activeConnectionId: s.activeConnectionId,
    tabs: s.tabs,
    activeTabId: s.activeTabId,
    updateTab: s.updateTab,
    addHistory: s.addHistory,
    connections: s.connections,
    setActiveConnection: s.setActiveConnection,
    setConnectionStatus: s.setConnectionStatus,
  }));
  const activeTab = tabs.find(t => t.id === activeTabId);
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [showSettings, setShowSettings] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);
  const [generatedSQL, setGeneratedSQL] = useState('');
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryDuration, setQueryDuration] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Quick connect to a saved connection
  const quickConnect = useCallback(async (connId: string) => {
    const conn = connections.find(c => c.id === connId);
    if (!conn) return;
    if (conn.connected) {
      setActiveConnection(connId);
      return;
    }
    setConnecting(true);
    try {
      const res = await api.connect(connId);
      if (res.success) {
        setConnectionStatus(connId, true);
        setActiveConnection(connId);
      }
    } catch { /* ignore */ }
    setConnecting(false);
  }, [connections, setActiveConnection, setConnectionStatus]);

  // Query settings
  const [whereConditions, setWhereConditions] = useState<WhereCondition[]>([]);
  const [orderBy, setOrderBy] = useState<OrderByClause[]>([]);
  const [groupBy, setGroupBy] = useState<string[]>([]);
  const [limit, setLimit] = useState('');

  // Available schemas and tables for the add-table dropdown
  const [availableSchemas, setAvailableSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState('public');
  const [availableTables, setAvailableTables] = useState<string[]>([]);
  const [selectedAddTable, setSelectedAddTable] = useState('');

  // Load schemas when connection changes
  useEffect(() => {
    if (!activeConnectionId) return;
    api.getSchemas(activeConnectionId).then(schemas => {
      const names = schemas.map(s => s.name);
      setAvailableSchemas(names);
      if (names.length && !names.includes(selectedSchema)) setSelectedSchema(names[0]);
    }).catch(() => {});
  }, [activeConnectionId]);

  // Load tables when connection or schema changes
  useEffect(() => {
    if (!activeConnectionId || !selectedSchema) { setAvailableTables([]); return; }
    api.getTables(activeConnectionId, selectedSchema).then(tables => {
      setAvailableTables(tables.map(t => t.name));
    }).catch(() => setAvailableTables([]));
  }, [activeConnectionId, selectedSchema]);

  // Column check handler
  const onColumnCheck = useCallback((nodeId: string, col: string, checked: boolean) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      const d = n.data as Record<string, any>;
      return { ...n, data: { ...d, selectedColumns: { ...d.selectedColumns, [col]: checked } } };
    }));
  }, [setNodes]);

  // Column aggregation handler
  const onColumnAgg = useCallback((nodeId: string, col: string, fn: AggregateFunction | undefined) => {
    setNodes(nds => nds.map(n => {
      if (n.id !== nodeId) return n;
      const d = n.data as Record<string, any>;
      return { ...n, data: { ...d, columnAggregations: { ...d.columnAggregations, [col]: { function: fn } } } };
    }));
  }, [setNodes]);

  // Delete node
  const deleteNode = useCallback((nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    setEdges(eds => eds.filter(e => e.source !== nodeId && e.target !== nodeId));
  }, [setNodes, setEdges]);

  // Add table to canvas
  const addTableToCanvas = useCallback(async (tableName: string) => {
    if (!activeConnectionId || !tableName) return;
    try {
      const columns = await api.getColumns(activeConnectionId, selectedSchema, tableName);
      const nodeId = `${tableName}-${Date.now()}`;
      const xOffset = nodes.length * 320;
      const newNode: Node = {
        id: nodeId, type: 'table',
        position: { x: xOffset, y: 50 },
        data: {
          label: selectedSchema === 'public' ? tableName : `"${selectedSchema}"."${tableName}"`,
          tableName,
          schema: selectedSchema,
          columns: columns.map((c: any) => ({ name: c.name || c.column_name, type: c.data_type })),
          selectedColumns: {},
          columnAggregations: {},
          columnAliases: {},
          onColumnCheck: (col: string, checked: boolean) => onColumnCheck(nodeId, col, checked),
          onColumnAgg: (col: string, fn: AggregateFunction | undefined) => onColumnAgg(nodeId, col, fn),
          onDelete: () => deleteNode(nodeId),
        },
      };
      setNodes(nds => [...nds, newNode]);
      setSelectedAddTable('');
    } catch (e) {
      console.error('Failed to fetch columns', e);
    }
  }, [activeConnectionId, selectedSchema, nodes.length, setNodes, onColumnCheck, onColumnAgg, deleteNode]);

  // Restore callbacks when nodes change (for React re-renders)
  useEffect(() => {
    setNodes(nds => nds.map(n => ({
      ...n, data: {
        ...n.data,
        onColumnCheck: (col: string, checked: boolean) => onColumnCheck(n.id, col, checked),
        onColumnAgg: (col: string, fn: AggregateFunction | undefined) => onColumnAgg(n.id, col, fn),
        onDelete: () => deleteNode(n.id),
      },
    })));
  }, [onColumnCheck, onColumnAgg, deleteNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Generate SQL on changes
  useEffect(() => {
    const vqbNodes: VQBNode[] = nodes.map(n => ({ id: n.id, data: n.data as any }));
    const vqbEdges: VQBEdge[] = edges.map(e => ({
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      data: e.data as any,
    }));
    const sql = generateVisualQuerySQL(vqbNodes, vqbEdges, whereConditions, orderBy, groupBy, limit);
    setGeneratedSQL(sql);
    if (sql && activeTabId) updateTab(activeTabId, { sql });
  }, [nodes, edges, whereConditions, orderBy, groupBy, limit, activeTabId, updateTab]);

  const onConnect = useCallback((params: Connection) => {
    setEdges(eds => addEdge({
      ...params, type: 'default', animated: true,
      data: { joinType: 'INNER' as JoinType },
      style: { stroke: '#3b82f6', strokeWidth: 2 },
      label: 'INNER',
      labelStyle: { fill: '#3b82f6', fontWeight: 700, fontSize: 10 },
      labelBgStyle: { fill: 'var(--card)', stroke: '#3b82f6', strokeWidth: 1 },
      labelBgPadding: [4, 2] as [number, number],
    }, eds));
  }, [setEdges]);

  // Change join type for an edge
  const changeJoinType = useCallback((edgeId: string, joinType: JoinType) => {
    setEdges(eds => eds.map(e => e.id !== edgeId ? e : {
      ...e,
      data: { ...e.data, joinType },
      label: joinType,
      labelStyle: { fill: '#3b82f6', fontWeight: 700, fontSize: 10 },
      labelBgStyle: { fill: 'var(--card)', stroke: '#3b82f6', strokeWidth: 1 },
      labelBgPadding: [4, 2] as [number, number],
    }));
  }, [setEdges]);

  // Click edge to cycle join type
  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    const current = (edge.data as any)?.joinType || 'INNER';
    const idx = JOIN_TYPES.indexOf(current as JoinType);
    const next = JOIN_TYPES[(idx + 1) % JOIN_TYPES.length];
    changeJoinType(edge.id, next);
  }, [changeJoinType]);

  // Remove edge
  const removeEdge = useCallback((edgeId: string) => {
    setEdges(eds => eds.filter(e => e.id !== edgeId));
  }, [setEdges]);

  // Execute query — results stay local in the builder
  const executeQuery = useCallback(async () => {
    if (!activeConnectionId || !generatedSQL) return;
    setIsExecuting(true);
    setQueryResult(null);
    setShowResults(true);
    try {
      const batch = await api.executeQuery(activeConnectionId, generatedSQL, 0, 1000);
      const result = batch.results.find(r => r.columns.length > 0) || batch.results[0];
      setQueryResult(result);
      setQueryDuration(batch.totalDuration);
      addHistory({
        sql: generatedSQL, connectionId: activeConnectionId,
        timestamp: Date.now(), duration: batch.totalDuration,
        rowCount: result.rowCount, error: result.error,
      });
    } catch (e: any) {
      setQueryResult({ queryId: '', columns: [], rows: [], rowCount: 0, command: '', duration: 0, error: e.message });
      setQueryDuration(0);
    }
    setIsExecuting(false);
  }, [activeConnectionId, generatedSQL, addHistory]);

  // All columns for dropdowns
  const allColumns = useMemo(() =>
    getAllColumnsFromNodes(nodes.map(n => ({ id: n.id, data: n.data as any }))),
    [nodes]
  );

  // Helper to get table label from node id
  const getNodeLabel = (nodeId: string) => {
    const n = nodes.find(nd => nd.id === nodeId);
    return (n?.data as any)?.label || nodeId;
  };

  // CSV export helper
  const exportCSV = useCallback(() => {
    if (!queryResult || !queryResult.columns.length) return;
    const header = queryResult.columns.map(c => c.name).join(',');
    const rows = queryResult.rows.map(r => queryResult.columns.map(c => JSON.stringify(r[c.name] ?? '')).join(','));
    const blob = new Blob([header + '\n' + rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'query-result.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [queryResult]);

  const copyJSON = useCallback(() => {
    if (!queryResult) return;
    navigator.clipboard.writeText(JSON.stringify(queryResult.rows, null, 2));
  }, [queryResult]);

  return (
    <div className="flex h-full w-full">
      {/* Left: canvas + results stacked vertically */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Canvas area */}
        <div className={`relative ${showResults ? 'flex-1 min-h-[200px]' : 'flex-1'}`}>
          {/* Top toolbar */}
          <div className="absolute top-2 left-2 z-10 flex items-center gap-2 bg-card border rounded-lg px-2 py-1.5 shadow-lg">
            {/* Connection picker */}
            <div className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full shrink-0 ${activeConnectionId ? 'bg-green-500' : 'bg-gray-400'}`} />
              <select
                value={activeConnectionId || ''}
                onChange={e => { if (e.target.value) quickConnect(e.target.value); }}
                disabled={connecting}
                className="bg-background border rounded text-xs px-2 py-1 min-w-[120px]"
              >
                <option value="">Connect...</option>
                {connections.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.connected ? '● ' : '○ '}{c.name} ({c.host}:{c.port})
                  </option>
                ))}
              </select>
              {connecting && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
            </div>

            <div className="w-px h-5 bg-border" />

            <Table2 className="h-3.5 w-3.5 text-primary" />
            <select value={selectedSchema} onChange={e => setSelectedSchema(e.target.value)}
              disabled={!activeConnectionId}
              className="bg-background border rounded text-xs px-2 py-1">
              {availableSchemas.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={selectedAddTable}
              onChange={e => { setSelectedAddTable(e.target.value); if (e.target.value) addTableToCanvas(e.target.value); }}
              disabled={!activeConnectionId}
              className="bg-background border rounded text-xs px-2 py-1 min-w-[140px]">
              <option value="">Add table...</option>
              {availableTables.map(t => <option key={t} value={t}>{t}</option>)}
            </select>

            <div className="w-px h-5 bg-border" />

            <button onClick={executeQuery}
              disabled={isExecuting || !generatedSQL || !activeConnectionId}
              className="flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-xs text-white hover:bg-green-700 disabled:opacity-50">
              {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Run
            </button>
            <button disabled={!generatedSQL}
              className="flex items-center gap-1 rounded border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
              title="SQL is synced to your active editor tab">
              <Code2 className="h-3 w-3" /> SQL Synced
            </button>
          </div>

          {/* Hint for joining */}
          {nodes.length >= 2 && edges.length === 0 && (
            <div className="absolute top-14 left-2 z-10 bg-blue-500/10 border border-blue-500/30 rounded-lg px-3 py-1.5 shadow text-[11px] text-blue-400 flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5" />
              Drag from a <span className="text-green-400 font-bold">green dot</span> (right) to a <span className="text-blue-400 font-bold">blue dot</span> (left) to create a JOIN. Click an edge to change join type.
            </div>
          )}

          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect} onEdgeClick={onEdgeClick}
            nodeTypes={nodeTypes}
            fitView minZoom={0.1} maxZoom={2}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            defaultEdgeOptions={{ animated: true, style: { stroke: '#3b82f6', strokeWidth: 2 } }}>
            <Controls className="!bg-card !border-border !shadow-lg" showInteractive={false} />
            <MiniMap nodeColor={() => '#3b82f6'} className="!bg-card !border !border-border !shadow-lg"
              style={{ width: 120, height: 80 }} zoomable pannable />
            <Background gap={16} size={1} color="var(--border)" />
          </ReactFlow>
        </div>

        {/* Bottom results panel */}
        {showResults && (
          <div className="h-[280px] border-t flex flex-col bg-card shrink-0">
            {/* Results header */}
            <div className="flex items-center gap-3 px-3 py-1.5 border-b text-xs shrink-0">
              <span className="font-bold text-[11px]">Results</span>
              {queryResult && !queryResult.error && (
                <span className="flex items-center gap-1 text-green-500">
                  <CheckCircle2 className="h-3 w-3" /> {queryResult.rowCount} rows
                </span>
              )}
              {queryResult?.error && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-3 w-3" /> Error
                </span>
              )}
              {queryDuration > 0 && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" /> {queryDuration}ms
                </span>
              )}
              {isExecuting && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
              <div className="ml-auto flex gap-1">
                {queryResult && queryResult.columns.length > 0 && (
                  <>
                    <button onClick={copyJSON} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-accent" title="Copy JSON">
                      <Copy className="h-3 w-3" /> JSON
                    </button>
                    <button onClick={exportCSV} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-accent" title="Export CSV">
                      <Download className="h-3 w-3" /> CSV
                    </button>
                  </>
                )}
                <button onClick={() => setShowResults(false)} className="p-0.5 rounded hover:bg-accent">
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Results body */}
            <div className="flex-1 overflow-auto min-h-0">
              {!queryResult && !isExecuting && (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground">Click Run to execute the query</div>
              )}
              {isExecuting && !queryResult && (
                <div className="flex items-center justify-center h-full text-xs text-muted-foreground gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Executing...
                </div>
              )}
              {queryResult?.error && (
                <div className="p-3 text-xs text-destructive whitespace-pre-wrap font-mono">{queryResult.error}</div>
              )}
              {queryResult && !queryResult.error && queryResult.columns.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">{queryResult.command || 'Query'} executed. {queryResult.rowCount} row(s) affected.</div>
              )}
              {queryResult && !queryResult.error && queryResult.columns.length > 0 && (
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr>
                      <th className="border-b border-r px-2 py-1 text-left text-muted-foreground font-medium w-[40px]">#</th>
                      {queryResult.columns.map(c => (
                        <th key={c.name} className="border-b border-r px-2 py-1 text-left font-medium whitespace-nowrap">
                          {c.name} <span className="text-[9px] text-muted-foreground">({c.dataType})</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {queryResult.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-accent/50">
                        <td className="border-b border-r px-2 py-0.5 text-muted-foreground text-center">{i + 1}</td>
                        {queryResult.columns.map(c => (
                          <td key={c.name} className="border-b border-r px-2 py-0.5 truncate max-w-[200px]" title={String(row[c.name] ?? '')}>
                            {row[c.name] === null ? <span className="italic text-muted-foreground">NULL</span> : String(row[c.name])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Settings sidebar */}
      {showSettings && (
        <div className="w-80 border-l bg-card flex flex-col overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between">
            <span className="text-xs font-bold">Query Settings</span>
            <button onClick={() => setShowSettings(false)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">

            {/* JOINs */}
            <div className="p-4 border-b">
              <div className="flex items-center gap-1.5 text-xs font-bold mb-3">
                <Link2 className="h-3.5 w-3.5 text-cyan-400" /> JOINs
              </div>
              {!edges.length && (
                <div className="text-[10px] text-muted-foreground italic">
                  {nodes.length >= 2
                    ? 'Drag between column handles on the canvas to create joins'
                    : 'Add 2+ tables to create joins'}
                </div>
              )}
              {edges.map(e => {
                const joinType = (e.data as any)?.joinType || 'INNER';
                return (
                  <div key={e.id} className="mb-2 p-2 rounded border bg-accent/20 space-y-1.5">
                    <div className="text-[10px] text-muted-foreground truncate">
                      {getNodeLabel(e.source)}.{e.sourceHandle} → {getNodeLabel(e.target)}.{e.targetHandle}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {JOIN_TYPES.map(jt => (
                        <button
                          key={jt}
                          onClick={() => changeJoinType(e.id, jt)}
                          className={`px-1.5 py-0.5 text-[9px] rounded ${joinType === jt ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground hover:text-foreground'}`}
                        >
                          {jt}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => removeEdge(e.id)}
                      className="text-[10px] text-destructive hover:underline"
                    >
                      Remove join
                    </button>
                  </div>
                );
              })}
            </div>

            {/* WHERE */}
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold"><Filter className="h-3.5 w-3.5 text-blue-400" /> WHERE</div>
                <button onClick={() => setWhereConditions([...whereConditions, { id: String(Date.now()), column: '', operator: '=', value: '', logicalOp: 'AND', isHaving: false }])}
                  className="text-blue-500 hover:text-blue-400 p-1 rounded hover:bg-blue-500/10"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              {!whereConditions.length && <div className="text-[10px] text-muted-foreground italic">No conditions</div>}
              {whereConditions.map((c, idx) => (
                <div key={c.id} className="mb-2 p-2 rounded border bg-accent/20 space-y-1.5">
                  {idx > 0 && (
                    <div className="flex gap-1">
                      {(['AND', 'OR'] as const).map(op => (
                        <button key={op} onClick={() => setWhereConditions(wc => wc.map(w => w.id === c.id ? { ...w, logicalOp: op } : w))}
                          className={`flex-1 px-2 py-0.5 text-[10px] rounded ${c.logicalOp === op ? 'bg-primary text-primary-foreground' : 'bg-accent text-muted-foreground'}`}>{op}</button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <input type="checkbox" checked={c.isHaving} onChange={e => setWhereConditions(wc => wc.map(w => w.id === c.id ? { ...w, isHaving: e.target.checked } : w))}
                      className="h-3 w-3" title="HAVING" />
                    <span className="text-[9px] text-muted-foreground">HAVING</span>
                  </div>
                  <select value={c.column} onChange={e => setWhereConditions(wc => wc.map(w => w.id === c.id ? { ...w, column: e.target.value } : w))}
                    className="w-full bg-background border rounded text-[11px] px-2 py-1">
                    <option value="">Column...</option>
                    {allColumns.map(col => <option key={col} value={col}>{col}</option>)}
                  </select>
                  <div className="flex gap-1">
                    <select value={c.operator} onChange={e => setWhereConditions(wc => wc.map(w => w.id === c.id ? { ...w, operator: e.target.value } : w))}
                      className="bg-background border rounded text-[11px] px-1 py-1 w-16">
                      {['=', '!=', '>', '<', '>=', '<=', 'LIKE', 'IN'].map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                    <input value={c.value} onChange={e => setWhereConditions(wc => wc.map(w => w.id === c.id ? { ...w, value: e.target.value } : w))}
                      placeholder="Value" className="flex-1 bg-background border rounded text-[11px] px-2 py-1" />
                    <button onClick={() => setWhereConditions(wc => wc.filter(w => w.id !== c.id))}
                      className="text-destructive hover:bg-destructive/10 p-1 rounded"><X className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
            </div>

            {/* GROUP BY */}
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold"><Group className="h-3.5 w-3.5 text-purple-400" /> GROUP BY</div>
                <button onClick={() => setGroupBy([...groupBy, ''])} className="text-blue-500 hover:text-blue-400 p-1 rounded hover:bg-blue-500/10"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              {!groupBy.length && <div className="text-[10px] text-muted-foreground italic">No grouping</div>}
              {groupBy.map((col, idx) => (
                <div key={idx} className="flex gap-1 mb-1.5">
                  <select value={col} onChange={e => setGroupBy(gb => gb.map((c, i) => i === idx ? e.target.value : c))}
                    className="flex-1 bg-background border rounded text-[11px] px-2 py-1">
                    <option value="">Column...</option>
                    {allColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={() => setGroupBy(gb => gb.filter((_, i) => i !== idx))}
                    className="text-destructive hover:bg-destructive/10 p-1 rounded"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>

            {/* ORDER BY */}
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5 text-xs font-bold"><SortAsc className="h-3.5 w-3.5 text-green-400" /> ORDER BY</div>
                <button onClick={() => setOrderBy([...orderBy, { id: String(Date.now()), column: '', direction: 'ASC' }])}
                  className="text-blue-500 hover:text-blue-400 p-1 rounded hover:bg-blue-500/10"><Plus className="h-3.5 w-3.5" /></button>
              </div>
              {!orderBy.length && <div className="text-[10px] text-muted-foreground italic">No sorting</div>}
              {orderBy.map(o => (
                <div key={o.id} className="flex gap-1 mb-1.5">
                  <select value={o.column} onChange={e => setOrderBy(ob => ob.map(x => x.id === o.id ? { ...x, column: e.target.value } : x))}
                    className="flex-1 bg-background border rounded text-[11px] px-2 py-1">
                    <option value="">Column...</option>
                    {allColumns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={o.direction} onChange={e => setOrderBy(ob => ob.map(x => x.id === o.id ? { ...x, direction: e.target.value as 'ASC' | 'DESC' } : x))}
                    className="bg-background border rounded text-[11px] px-1 py-1 w-16">
                    <option value="ASC">ASC</option>
                    <option value="DESC">DESC</option>
                  </select>
                  <button onClick={() => setOrderBy(ob => ob.filter(x => x.id !== o.id))}
                    className="text-destructive hover:bg-destructive/10 p-1 rounded"><X className="h-3 w-3" /></button>
                </div>
              ))}
            </div>

            {/* LIMIT */}
            <div className="p-4 border-b">
              <div className="flex items-center gap-1.5 text-xs font-bold mb-3"><Hash className="h-3.5 w-3.5 text-orange-400" /> LIMIT</div>
              <input type="number" value={limit} onChange={e => setLimit(e.target.value)}
                placeholder="e.g. 100" min="1"
                className="w-full bg-background border rounded text-[11px] px-2 py-1.5" />
            </div>

            {/* Generated SQL preview */}
            <div className="p-4">
              <div className="flex items-center gap-1.5 text-xs font-bold mb-3"><Code2 className="h-3.5 w-3.5 text-emerald-400" /> Generated SQL</div>
              {generatedSQL ? (
                <pre className="bg-background border rounded p-2 text-[10px] whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto font-mono">
                  {generatedSQL}
                </pre>
              ) : (
                <div className="text-[10px] text-muted-foreground italic">Add tables and select columns to generate SQL</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Show settings button when hidden */}
      {!showSettings && (
        <button onClick={() => setShowSettings(true)}
          className="absolute top-2 right-2 z-10 bg-card border rounded-lg px-3 py-1.5 text-xs flex items-center gap-1.5 shadow-lg hover:bg-accent">
          <Filter className="h-3.5 w-3.5" /> Settings
        </button>
      )}
    </div>
  );
}

export default function VisualQueryBuilder() {
  return (
    <ReactFlowProvider>
      <VisualQueryBuilderContent />
    </ReactFlowProvider>
  );
}
