import { useState, useCallback, useRef, useEffect } from 'react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import type { TreeNode } from '@/types';
import {
  ChevronRight, ChevronDown, Database, Table, Eye, FunctionSquare,
  Folder, Columns, RefreshCw, Search, Loader2,
} from 'lucide-react';

const ICONS: Record<string, React.ElementType> = {
  server: Database, database: Database, schema: Folder, table: Table,
  view: Eye, function: FunctionSquare, column: Columns, folder: Folder,
};

export default function DatabaseExplorer() {
  const { connections, activeConnectionId, treeNodes, setTreeNodes, updateTreeNode } = useAppStore();
  const addTab = useAppStore(s => s.addTab);
  const updateTab = useAppStore(s => s.updateTab);
  const tabs = useAppStore(s => s.tabs);
  const activeTabId = useAppStore(s => s.activeTabId);
  const [loading, setLoading] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; node: TreeNode } | null>(null);
  const [filter, setFilter] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const loadChildren = useCallback(async (node: TreeNode) => {
    if (node.isLoaded) return;
    const connId = node.connectionId || activeConnectionId;
    if (!connId) return;
    setLoading(node.id);

    try {
      let children: TreeNode[] = [];
      switch (node.type) {
        case 'server': {
          const schemas = await api.getSchemas(connId);
          children = schemas.map(s => ({
            id: `${node.id}-${s.name}`, label: s.name, type: 'schema' as const,
            connectionId: connId, schema: s.name,
          }));
          break;
        }
        case 'schema': {
          const [tables, views, funcs] = await Promise.all([
            api.getTables(connId, node.label),
            api.getViews(connId, node.label),
            api.getFunctions(connId, node.label),
          ]);
          children = [
            {
              id: `${node.id}-tables`, label: 'Tables', type: 'folder' as const, connectionId: connId, schema: node.label,
              children: tables.map(t => ({
                id: `${node.id}-t-${t.name}`, label: t.name, type: 'table' as const,
                connectionId: connId, schema: node.label, table: t.name,
                meta: { size: t.size },
              })),
              isLoaded: true,
            },
            {
              id: `${node.id}-views`, label: 'Views', type: 'folder' as const, connectionId: connId, schema: node.label,
              children: views.map(v => ({
                id: `${node.id}-v-${v.name}`, label: v.name, type: 'view' as const,
                connectionId: connId, schema: node.label,
              })),
              isLoaded: true,
            },
            {
              id: `${node.id}-funcs`, label: 'Functions', type: 'folder' as const, connectionId: connId, schema: node.label,
              children: funcs.map(f => ({
                id: `${node.id}-f-${f.name}-${f.args || ''}`, label: f.args ? `${f.name}(${f.args})` : f.name,
                type: 'function' as const,
                connectionId: connId, schema: node.label,
                meta: { funcName: f.name, args: f.args || '', funcType: f.type },
              })),
              isLoaded: true,
            },
          ];
          break;
        }
        case 'table': {
          const cols = await api.getColumns(connId, node.schema!, node.label);
          children = cols.map(c => ({
            id: `${node.id}-c-${c.name}`, label: `${c.name} (${c.data_type}${c.is_primary_key ? ', PK' : ''})`,
            type: 'column' as const, connectionId: connId, schema: node.schema, table: node.label,
          }));
          break;
        }
      }
      updateTreeNode(node.id, { children, isLoaded: true, isExpanded: true });
    } catch (e: any) {
      console.error('Failed to load tree:', e);
    }
    setLoading(null);
  }, [activeConnectionId, updateTreeNode]);

  // Build tree when connections change
  useEffect(() => {
    const connected = connections.filter(c => c.connected);
    const nodes: TreeNode[] = connected.map(c => ({
      id: `srv-${c.id}`, label: `${c.name} (${c.database})`, type: 'server' as const,
      connectionId: c.id,
    }));
    setTreeNodes(nodes);
  }, [connections, setTreeNodes]);

  const toggleNode = (node: TreeNode) => {
    if (!node.isLoaded) {
      loadChildren(node);
    } else {
      updateTreeNode(node.id, { isExpanded: !node.isExpanded });
    }
  };

  const handleContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  const openSqlInEditor = (sql: string, connId: string | null | undefined) => {
    const cid = connId || activeConnectionId;
    if (tabs.length === 0 || !activeTabId) {
      addTab(cid);
    }
    setTimeout(() => {
      const tabId = useAppStore.getState().activeTabId;
      if (tabId) updateTab(tabId, { sql, connectionId: cid });
    }, 0);
    setContextMenu(null);
  };

  const queryTable = (node: TreeNode, action: string) => {
    const schema = node.schema || 'public';
    let sql = '';
    switch (action) {
      case 'select': sql = `SELECT * FROM "${schema}"."${node.label}" LIMIT 100;`; break;
      case 'count': sql = `SELECT count(*) FROM "${schema}"."${node.label}";`; break;
      case 'drop': sql = `-- DROP TABLE "${schema}"."${node.label}";`; break;
    }
    if (sql) openSqlInEditor(sql, node.connectionId);
  };

  const viewFunction = async (node: TreeNode) => {
    const connId = node.connectionId || activeConnectionId;
    if (!connId || !node.schema) return;
    const funcName = node.meta?.funcName || node.label;
    const args = node.meta?.args || '';
    try {
      const { definition } = await api.getFunctionDefinition(connId, node.schema, funcName, args);
      openSqlInEditor(definition, connId);
    } catch (e: any) {
      // Fallback: generate a basic SELECT for the function source
      openSqlInEditor(
        `-- Could not retrieve definition: ${e.message}\n-- Try manually:\nSELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = '${funcName}';`,
        connId,
      );
    }
  };

  const refreshNode = (node: TreeNode) => {
    updateTreeNode(node.id, { isLoaded: false, children: undefined, isExpanded: false });
    setContextMenu(null);
  };

  const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
    if (!filter) return nodes;
    return nodes.reduce<TreeNode[]>((acc, n) => {
      if (n.label.toLowerCase().includes(filter.toLowerCase())) {
        acc.push(n);
      } else if (n.children) {
        const filtered = filterNodes(n.children);
        if (filtered.length > 0) acc.push({ ...n, children: filtered, isExpanded: true });
      }
      return acc;
    }, []);
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const Icon = ICONS[node.type] || Folder;
    const hasChildren = node.type !== 'column';
    const isLoading = loading === node.id;

    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-1 cursor-pointer rounded px-1 py-0.5 text-sm hover:bg-accent group"
          style={{ paddingLeft: `${depth * 16 + 4}px` }}
          onClick={() => hasChildren && toggleNode(node)}
          onContextMenu={e => handleContextMenu(e, node)}
          onDoubleClick={() => {
            if (node.type === 'table' || node.type === 'view') queryTable(node, 'select');
            if (node.type === 'function') viewFunction(node);
          }}
        >
          {hasChildren ? (
            isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-muted-foreground" /> :
            node.isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> :
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : <span className="w-3.5" />}
          <Icon className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate">{node.label}</span>
        </div>
        {node.isExpanded && node.children?.map(child => renderNode(child, depth + 1))}
      </div>
    );
  };

  const visibleNodes = filterNodes(treeNodes);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter..."
          className="h-6 flex-1 bg-transparent text-xs focus:outline-none"
        />
      </div>
      <div className="flex-1 overflow-auto py-1">
        {visibleNodes.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">
            {connections.some(c => c.connected) ? 'No items found' : 'Connect to a server to browse'}
          </p>
        )}
        {visibleNodes.map(n => renderNode(n, 0))}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-50 min-w-[160px] rounded-md border bg-card py-1 shadow-lg"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {(contextMenu.node.type === 'table' || contextMenu.node.type === 'view') && (
            <>
              <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => queryTable(contextMenu.node, 'select')}>
                SELECT TOP 100
              </button>
              <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => queryTable(contextMenu.node, 'count')}>
                Count Rows
              </button>
              <div className="my-1 border-t" />
            </>
          )}
          {contextMenu.node.type === 'function' && (
            <>
              <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => viewFunction(contextMenu.node)}>
                View/Edit Definition
              </button>
              <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => {
                const schema = contextMenu.node.schema || 'public';
                const funcName = contextMenu.node.meta?.funcName || contextMenu.node.label;
                const args = contextMenu.node.meta?.args || '';
                const identifier = args ? `"${schema}"."${funcName}"(${args})` : `"${schema}"."${funcName}"`;
                openSqlInEditor(`-- DROP FUNCTION ${identifier};`, contextMenu.node.connectionId);
              }}>
                Generate DROP
              </button>
              <button className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => {
                const schema = contextMenu.node.schema || 'public';
                const funcName = contextMenu.node.meta?.funcName || contextMenu.node.label;
                const args = contextMenu.node.meta?.args || '';
                const callArgs = args ? args.split(',').map((_: string, i: number) => `$${i + 1}`).join(', ') : '';
                openSqlInEditor(`SELECT "${schema}"."${funcName}"(${callArgs});`, contextMenu.node.connectionId);
              }}>
                Generate SELECT Call
              </button>
              <div className="my-1 border-t" />
            </>
          )}
          <button className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => refreshNode(contextMenu.node)}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
      )}
    </div>
  );
}
