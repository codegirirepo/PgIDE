import { create } from 'zustand';
import type { SavedConnection, QueryTab, TreeNode, QueryHistoryEntry, QueryBookmark, QueryResult } from '@/types';

let tabCounter = 1;
function newTabId() { return `tab-${Date.now()}-${tabCounter++}`; }

interface AppState {
  // Theme
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // Connections
  connections: SavedConnection[];
  activeConnectionId: string | null;
  setConnections: (c: SavedConnection[]) => void;
  addConnection: (c: SavedConnection) => void;
  removeConnection: (id: string) => void;
  setActiveConnection: (id: string | null) => void;
  setConnectionStatus: (id: string, connected: boolean) => void;
  getEffectiveConnectionId: () => string | null;

  // Explorer tree
  treeNodes: TreeNode[];
  setTreeNodes: (nodes: TreeNode[]) => void;
  updateTreeNode: (id: string, updates: Partial<TreeNode>) => void;

  // Query tabs
  tabs: QueryTab[];
  activeTabId: string | null;
  addTab: (connectionId: string | null) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<QueryTab>) => void;

  // History
  history: QueryHistoryEntry[];
  addHistory: (entry: Omit<QueryHistoryEntry, 'id'>) => void;
  clearHistory: () => void;
  // Append rows for lazy loading
  appendRows: (tabId: string, resultIndex: number, newResult: QueryResult, newOffset: number) => void;
  // Bookmarks
  bookmarks: QueryBookmark[];
  addBookmark: (b: Omit<QueryBookmark, 'id' | 'createdAt'>) => void;
  removeBookmark: (id: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  theme: 'dark',
  toggleTheme: () => set(s => {
    const next = s.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    return { theme: next };
  }),

  connections: [],
  activeConnectionId: null,
  setConnections: (connections) => set({ connections }),
  addConnection: (c) => set(s => ({ connections: [...s.connections, c] })),
  removeConnection: (id) => set(s => ({
    connections: s.connections.filter(c => c.id !== id),
    activeConnectionId: s.activeConnectionId === id ? null : s.activeConnectionId,
  })),
  setActiveConnection: (id) => set({ activeConnectionId: id }),
  getEffectiveConnectionId: () => {
    const s = get();
    // 1. Global active connection if it's actually connected
    if (s.activeConnectionId && s.connections.find(c => c.id === s.activeConnectionId && c.connected)) return s.activeConnectionId;
    // 2. Active tab's connection if connected
    const tab = s.tabs.find(t => t.id === s.activeTabId);
    if (tab?.connectionId && s.connections.find(c => c.id === tab.connectionId && c.connected)) return tab.connectionId;
    // 3. Any connected connection
    const any = s.connections.find(c => c.connected);
    return any?.id || s.activeConnectionId;
  },
  setConnectionStatus: (id, connected) => set(s => ({
    connections: s.connections.map(c => c.id === id ? { ...c, connected } : c),
  })),

  treeNodes: [],
  setTreeNodes: (treeNodes) => set({ treeNodes }),
  updateTreeNode: (id, updates) => {
    const updateNodes = (nodes: TreeNode[]): TreeNode[] =>
      nodes.map(n => n.id === id ? { ...n, ...updates } : { ...n, children: n.children ? updateNodes(n.children) : undefined });
    set(s => ({ treeNodes: updateNodes(s.treeNodes) }));
  },

  tabs: [],
  activeTabId: null,
  addTab: (connectionId) => {
    const id = newTabId();
    set(s => ({
      tabs: [...s.tabs, { id, title: `Query ${s.tabs.length + 1}`, sql: '', connectionId, batchResult: null, activeResultIndex: 0, isExecuting: false, lastExecutedSql: undefined, loadedOffset: 0, isLoadingMore: false }],
      activeTabId: id,
    }));
  },
  removeTab: (id) => set(s => {
    const tabs = s.tabs.filter(t => t.id !== id);
    return { tabs, activeTabId: s.activeTabId === id ? (tabs[tabs.length - 1]?.id || null) : s.activeTabId };
  }),
  setActiveTab: (id) => set({ activeTabId: id }),
  updateTab: (id, updates) => set(s => ({
    tabs: s.tabs.map(t => t.id === id ? { ...t, ...updates } : t),
  })),

  history: [],
  addHistory: (entry) => set(s => ({
    history: [{ ...entry, id: `hist-${Date.now()}` }, ...s.history].slice(0, 500),
  })),
  clearHistory: () => set({ history: [] }),

  appendRows: (tabId, resultIndex, newResult, newOffset) => set(s => ({
    tabs: s.tabs.map(t => {
      if (t.id !== tabId || !t.batchResult) return t;
      const results = t.batchResult.results.map((r, i) => {
        if (i !== resultIndex) return r;
        return {
          ...r,
          rows: [...r.rows, ...newResult.rows],
          rowCount: r.rowCount + newResult.rowCount,
          hasMore: newResult.hasMore,
        };
      });
      return { ...t, batchResult: { ...t.batchResult, results }, loadedOffset: newOffset, isLoadingMore: false };
    }),
  })),

  bookmarks: JSON.parse(localStorage.getItem('pgide-bookmarks') || '[]'),
  addBookmark: (b) => set(s => {
    const bookmarks = [...s.bookmarks, { ...b, id: `bm-${Date.now()}`, createdAt: Date.now() }];
    localStorage.setItem('pgide-bookmarks', JSON.stringify(bookmarks));
    return { bookmarks };
  }),
  removeBookmark: (id) => set(s => {
    const bookmarks = s.bookmarks.filter(b => b.id !== id);
    localStorage.setItem('pgide-bookmarks', JSON.stringify(bookmarks));
    return { bookmarks };
  }),
}));
