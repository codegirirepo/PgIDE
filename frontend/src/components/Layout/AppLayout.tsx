import { useState, useEffect, useRef, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/services/api';
import ConnectionManager from '@/components/ConnectionManager/ConnectionManager';
import DatabaseExplorer from '@/components/DatabaseExplorer/DatabaseExplorer';
import QueryEditor from '@/components/QueryEditor/QueryEditor';
import ResultsViewer from '@/components/ResultsViewer/ResultsViewer';
import QueryHistory from '@/components/Layout/QueryHistory';
import ExplainViewer from '@/components/ExplainViewer/ExplainViewer';
import IndexAdvisor from '@/components/IndexAdvisor/IndexAdvisor';
import TableStats from '@/components/TableStats/TableStats';
import SchemaDiffViewer from '@/components/SchemaDiff/SchemaDiff';
import SlowQueries from '@/components/SlowQueries/SlowQueries';
import ERDiagram from '@/components/ERDiagram/ERDiagram';
import Bookmarks from '@/components/Bookmarks/Bookmarks';
import PgVectorAdvisor from '@/components/PgVectorAdvisor/PgVectorAdvisor';
import VisualQueryBuilder from '@/components/VisualQueryBuilder/VisualQueryBuilder';
import DumpImport from '@/components/DumpImport/DumpImport';
import KeyboardShortcuts from '@/components/KeyboardShortcuts/KeyboardShortcuts';
import ActiveSessions from '@/components/ActiveSessions/ActiveSessions';
import LockMonitor from '@/components/LockMonitor/LockMonitor';
import ReplicationMonitor from '@/components/ReplicationMonitor/ReplicationMonitor';
import DiskUsage from '@/components/DiskUsage/DiskUsage';
import RoleManager from '@/components/RoleManager/RoleManager';
import ServerConfig from '@/components/ServerConfig/ServerConfig';
import ExtensionManager from '@/components/ExtensionManager/ExtensionManager';
import TriggerInspector from '@/components/TriggerInspector/TriggerInspector';
import Maintenance from '@/components/Maintenance/Maintenance';
import TablespaceManager from '@/components/TablespaceManager/TablespaceManager';
import {
  Database, Sun, Moon, History, Plug, PanelLeftClose, PanelLeft,
  BarChart3, GitCompare, Gauge, Network, Bookmark, X, Boxes, Workflow, HardDrive, Keyboard,
  Minimize2, Maximize2, ChevronsDownUp, ChevronDown,
  Users, Lock, Radio, Shield, Settings, Puzzle, Zap, Wrench, Server,
  Search, Activity, FolderTree, Cog,
} from 'lucide-react';

type BottomPanel = 'results' | 'explain' | 'indexAdvisor';
type SidePanel = 'explorer' | 'history' | 'bookmarks' | 'pgvector';
type ModalPanel = 'tableStats' | 'schemaDiff' | 'slowQueries' | 'erDiagram' | 'queryBuilder' | 'dumpImport' | 'shortcuts'
  | 'sessions' | 'locks' | 'replication' | 'diskUsage' | 'roles' | 'serverConfig' | 'extensions' | 'triggers' | 'maintenance' | 'tablespaces' | null;

const modalLabels: Record<string, string> = {
  tableStats: 'Table Stats', slowQueries: 'Slow Queries', erDiagram: 'ER Diagram',
  schemaDiff: 'Schema Diff', queryBuilder: 'Query Builder', dumpImport: 'Dump / Import',
  shortcuts: 'Keyboard Shortcuts', sessions: 'Active Sessions', locks: 'Lock Monitor',
  replication: 'Replication', diskUsage: 'Disk Usage', roles: 'Roles & Permissions',
  serverConfig: 'Server Config', extensions: 'Extensions', triggers: 'Triggers & Rules',
  maintenance: 'Maintenance', tablespaces: 'Tablespaces',
};

interface MenuGroup {
  label: string;
  icon: React.ElementType;
  items: { id: ModalPanel; label: string; icon: React.ElementType; desc: string }[];
}

const menuGroups: MenuGroup[] = [
  {
    label: 'Query', icon: Search,
    items: [
      { id: 'queryBuilder', label: 'Visual Query Builder', icon: Workflow, desc: 'Drag-and-drop query design' },
      { id: 'slowQueries', label: 'Slow Queries', icon: Gauge, desc: 'pg_stat_statements analysis' },
      { id: 'dumpImport', label: 'Dump / Import', icon: HardDrive, desc: 'Export & import SQL' },
      { id: 'shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard, desc: 'Customize key bindings' },
    ],
  },
  {
    label: 'Schema', icon: FolderTree,
    items: [
      { id: 'erDiagram', label: 'ER Diagram', icon: Network, desc: 'Interactive entity-relationship view' },
      { id: 'schemaDiff', label: 'Schema Diff', icon: GitCompare, desc: 'Compare & migrate schemas' },
      { id: 'triggers', label: 'Triggers & Rules', icon: Zap, desc: 'Inspect triggers and rules' },
      { id: 'extensions', label: 'Extensions', icon: Puzzle, desc: 'Install & manage extensions' },
    ],
  },
  {
    label: 'Monitor', icon: Activity,
    items: [
      { id: 'sessions', label: 'Active Sessions', icon: Users, desc: 'Live connections & queries' },
      { id: 'locks', label: 'Lock Monitor', icon: Lock, desc: 'Locks & blocking chains' },
      { id: 'tableStats', label: 'Table Stats', icon: BarChart3, desc: 'Health, bloat & cache ratios' },
      { id: 'replication', label: 'Replication', icon: Radio, desc: 'Replicas & slot status' },
    ],
  },
  {
    label: 'Admin', icon: Cog,
    items: [
      { id: 'maintenance', label: 'Maintenance', icon: Wrench, desc: 'Vacuum, Reindex, Analyze, Cluster' },
      { id: 'diskUsage', label: 'Disk Usage', icon: Server, desc: 'Database & table sizes' },
      { id: 'roles', label: 'Roles & Permissions', icon: Shield, desc: 'Users, roles & grants' },
      { id: 'serverConfig', label: 'Server Config', icon: Settings, desc: 'pg_settings browser' },
      { id: 'tablespaces', label: 'Tablespaces', icon: Database, desc: 'Tablespace usage & locations' },
    ],
  },
];

function DropdownMenu({ group, modal, setModal }: { group: MenuGroup; modal: ModalPanel; setModal: (m: ModalPanel) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActive = group.items.some(i => i.id === modal);

  const handleEnter = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(true);
  };

  const handleLeave = () => {
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };

  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  return (
    <div className="relative" ref={ref} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors
          ${open ? 'bg-accent text-foreground' : isActive ? 'bg-accent/70 text-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground'}`}
      >
        <group.icon className="h-3.5 w-3.5" />
        {group.label}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 w-64 rounded-lg border border-border bg-popover text-popover-foreground shadow-2xl backdrop-blur-sm">
          <div className="px-1 py-1.5">
            <div className="px-3 pb-1.5 mb-1 border-b border-border">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-popover-foreground/50">{group.label} Tools</span>
            </div>
            {group.items.map(item => (
              <button
                key={item.id}
                onClick={() => { setModal(modal === item.id ? null : item.id); setOpen(false); }}
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors
                  ${modal === item.id ? 'bg-primary/15 text-primary' : 'text-popover-foreground hover:bg-accent'}`}
              >
                <div className={`rounded-md p-1.5 shrink-0 ${modal === item.id ? 'bg-primary/20' : 'bg-accent'}`}>
                  <item.icon className={`h-3.5 w-3.5 ${modal === item.id ? 'text-primary' : 'text-popover-foreground/70'}`} />
                </div>
                <div className="min-w-0">
                  <div className={`text-xs font-medium leading-tight ${modal === item.id ? 'text-primary' : 'text-popover-foreground'}`}>{item.label}</div>
                  <div className="text-[10px] text-popover-foreground/50 leading-tight mt-0.5">{item.desc}</div>
                </div>
                {modal === item.id && <span className="ml-auto text-[9px] text-primary font-medium shrink-0 self-center">Active</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { theme, toggleTheme, connections, tabs, addTab, activeConnectionId } = useAppStore();
  const [connManagerOpen, setConnManagerOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidePanel, setSidePanel] = useState<SidePanel>('explorer');
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>('results');
  const [modal, setModal] = useState<ModalPanel>(null);
  const resultsPanelRef = useRef<ImperativePanelHandle>(null);
  const editorPanelRef = useRef<ImperativePanelHandle>(null);
  const [resultsPanelState, setResultsPanelState] = useState<'normal' | 'minimized' | 'maximized'>('normal');

  const minimizeResults = useCallback(() => { resultsPanelRef.current?.resize(5); setResultsPanelState('minimized'); }, []);
  const maximizeResults = useCallback(() => { editorPanelRef.current?.resize(5); setResultsPanelState('maximized'); }, []);
  const restoreResults = useCallback(() => { editorPanelRef.current?.resize(55); resultsPanelRef.current?.resize(45); setResultsPanelState('normal'); }, []);

  useEffect(() => {
    api.getConnections().then(conns => {
      useAppStore.getState().setConnections(conns.map(c => ({ ...c, connected: false })));
    }).catch(() => {});
  }, []);

  useEffect(() => { if (tabs.length === 0) addTab(activeConnectionId); }, []);

  const connectedCount = connections.filter(c => c.connected).length;
  const activeConnName = activeConnectionId ? connections.find(c => c.id === activeConnectionId)?.name : null;

  const renderModal = () => {
    switch (modal) {
      case 'tableStats': return <TableStats />;
      case 'slowQueries': return <SlowQueries />;
      case 'erDiagram': return <ERDiagram />;
      case 'schemaDiff': return <SchemaDiffViewer />;
      case 'queryBuilder': return <VisualQueryBuilder />;
      case 'dumpImport': return <DumpImport />;
      case 'shortcuts': return <KeyboardShortcuts />;
      case 'sessions': return <ActiveSessions />;
      case 'locks': return <LockMonitor />;
      case 'replication': return <ReplicationMonitor />;
      case 'diskUsage': return <DiskUsage />;
      case 'roles': return <RoleManager />;
      case 'serverConfig': return <ServerConfig />;
      case 'extensions': return <ExtensionManager />;
      case 'triggers': return <TriggerInspector />;
      case 'maintenance': return <Maintenance />;
      case 'tablespaces': return <TablespaceManager />;
      default: return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* ─── Top Header ─── */}
      <header className="flex h-11 items-center border-b bg-card px-3 gap-2 shrink-0">
        {/* Logo + sidebar toggle */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 text-sm font-bold text-primary">
            <Database className="h-4 w-4" /> PgIDE
          </div>
          <div className="w-px h-5 bg-border" />
          <button onClick={() => setSidebarVisible(v => !v)} className="rounded-md p-1.5 hover:bg-accent transition-colors" title="Toggle Sidebar">
            {sidebarVisible ? <PanelLeftClose className="h-4 w-4 text-muted-foreground" /> : <PanelLeft className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>

        {/* Connection button */}
        <button
          onClick={() => setConnManagerOpen(true)}
          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors
            ${connectedCount > 0 ? 'text-green-500 hover:bg-green-500/10' : 'text-muted-foreground hover:bg-accent'}`}
        >
          <Plug className="h-3.5 w-3.5" />
          {connectedCount > 0 ? (
            <><span className="hidden sm:inline">{activeConnName || 'Connected'}</span><span className="rounded-full bg-green-500 px-1.5 text-[10px] text-white ml-0.5">{connectedCount}</span></>
          ) : (
            <span>Connect</span>
          )}
        </button>

        <div className="w-px h-5 bg-border" />

        {/* ─── Grouped dropdown menus ─── */}
        <nav className="flex items-center gap-0.5">
          {menuGroups.map(g => (
            <DropdownMenu key={g.label} group={g} modal={modal} setModal={setModal} />
          ))}
        </nav>

        {/* ─── Right side ─── */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          <button onClick={() => { setSidePanel('pgvector'); setSidebarVisible(true); }}
            className={`rounded-md p-1.5 transition-colors ${sidePanel === 'pgvector' && sidebarVisible ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent'}`} title="pgvector">
            <Boxes className="h-4 w-4" />
          </button>
          <button onClick={() => { setSidePanel('history'); setSidebarVisible(true); }}
            className={`rounded-md p-1.5 transition-colors ${sidePanel === 'history' && sidebarVisible ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent'}`} title="History">
            <History className="h-4 w-4" />
          </button>
          <button onClick={() => { setSidePanel('bookmarks'); setSidebarVisible(true); }}
            className={`rounded-md p-1.5 transition-colors ${sidePanel === 'bookmarks' && sidebarVisible ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent'}`} title="Bookmarks">
            <Bookmark className="h-4 w-4" />
          </button>
          <div className="w-px h-5 bg-border mx-0.5" />
          <button onClick={toggleTheme} className="rounded-md p-1.5 hover:bg-accent transition-colors" title="Toggle Theme">
            {theme === 'dark' ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />}
          </button>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <div className="flex-1 min-h-0">
        {modal ? (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between border-b px-4 py-1.5 bg-card shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{modalLabels[modal] || modal}</span>
              </div>
              <button onClick={() => setModal(null)} className="rounded-md p-1 hover:bg-accent transition-colors" title="Close (Esc)">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 min-h-0">{renderModal()}</div>
          </div>
        ) : (
          <PanelGroup direction="horizontal">
            {sidebarVisible && (
              <>
                <Panel defaultSize={20} minSize={15} maxSize={40}>
                  <div className="flex flex-col h-full">
                    <div className="flex border-b shrink-0">
                      {(['explorer', 'history', 'bookmarks', 'pgvector'] as SidePanel[]).map(p => (
                        <button
                          key={p}
                          onClick={() => setSidePanel(p)}
                          className={`flex-1 px-2 py-1.5 text-[10px] capitalize transition-colors ${sidePanel === p ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 min-h-0">
                      {sidePanel === 'explorer' && <DatabaseExplorer />}
                      {sidePanel === 'history' && <QueryHistory onClose={() => setSidePanel('explorer')} />}
                      {sidePanel === 'bookmarks' && <Bookmarks />}
                      {sidePanel === 'pgvector' && <PgVectorAdvisor />}
                    </div>
                  </div>
                </Panel>
                <PanelResizeHandle className="w-1 bg-border hover:bg-primary/50 transition-colors" />
              </>
            )}

            <Panel defaultSize={80}>
              <PanelGroup direction="vertical">
                <Panel ref={editorPanelRef} defaultSize={55} minSize={5}>
                  <QueryEditor onOpenConnectionManager={() => setConnManagerOpen(true)} />
                </Panel>
                <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" onDragging={(isDragging) => { if (!isDragging) setResultsPanelState('normal'); }} />
                <Panel ref={resultsPanelRef} defaultSize={45} minSize={5}>
                  <div className="flex flex-col h-full">
                    <div className="flex border-b shrink-0 bg-card">
                      {([
                        { id: 'results' as BottomPanel, label: 'Results' },
                        { id: 'explain' as BottomPanel, label: 'EXPLAIN' },
                        { id: 'indexAdvisor' as BottomPanel, label: 'Index Advisor' },
                      ]).map(p => (
                        <button
                          key={p.id}
                          onClick={() => setBottomPanel(p.id)}
                          className={`px-3 py-1.5 text-xs transition-colors ${bottomPanel === p.id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          {p.label}
                        </button>
                      ))}
                      <div className="ml-auto flex items-center gap-0.5 pr-1">
                        {resultsPanelState !== 'minimized' && (
                          <button onClick={minimizeResults} className="rounded p-1 hover:bg-accent" title="Minimize">
                            <Minimize2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {resultsPanelState !== 'normal' && (
                          <button onClick={restoreResults} className="rounded p-1 hover:bg-accent" title="Restore">
                            <ChevronsDownUp className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {resultsPanelState !== 'maximized' && (
                          <button onClick={maximizeResults} className="rounded p-1 hover:bg-accent" title="Maximize">
                            <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 min-h-0">
                      {bottomPanel === 'results' && <ResultsViewer />}
                      {bottomPanel === 'explain' && <ExplainViewer />}
                      {bottomPanel === 'indexAdvisor' && <IndexAdvisor />}
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>
          </PanelGroup>
        )}
      </div>

      {/* ─── Status Bar ─── */}
      <footer className="flex h-6 items-center justify-between border-t bg-card px-3 text-[10px] text-muted-foreground shrink-0">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            {activeConnectionId ? (
              <><span className="h-1.5 w-1.5 rounded-full bg-green-500 inline-block" /> Connected: {activeConnName || 'Unknown'}</>
            ) : (
              <><span className="h-1.5 w-1.5 rounded-full bg-gray-400 inline-block" /> Not connected</>
            )}
          </span>
          {modal && <span className="text-primary">● {modalLabels[modal]}</span>}
        </div>
        <span>PgIDE v1.0.0</span>
      </footer>

      <ConnectionManager open={connManagerOpen} onClose={() => setConnManagerOpen(false)} />
    </div>
  );
}
