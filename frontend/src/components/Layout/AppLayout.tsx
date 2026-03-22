import { useState, useEffect } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
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
import {
  Database, Sun, Moon, History, Plug, PanelLeftClose, PanelLeft,
  Zap, Lightbulb, BarChart3, GitCompare, Gauge, Network, Bookmark, X, Boxes, Workflow, HardDrive, Keyboard,
} from 'lucide-react';

type BottomPanel = 'results' | 'explain' | 'indexAdvisor';
type SidePanel = 'explorer' | 'history' | 'bookmarks' | 'pgvector';
type ModalPanel = 'tableStats' | 'schemaDiff' | 'slowQueries' | 'erDiagram' | 'queryBuilder' | 'dumpImport' | 'shortcuts' | null;

export default function AppLayout() {
  const { theme, toggleTheme, connections, tabs, addTab, activeConnectionId } = useAppStore();
  const [connManagerOpen, setConnManagerOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidePanel, setSidePanel] = useState<SidePanel>('explorer');
  const [bottomPanel, setBottomPanel] = useState<BottomPanel>('results');
  const [modal, setModal] = useState<ModalPanel>(null);

  useEffect(() => {
    api.getConnections().then(conns => {
      useAppStore.getState().setConnections(conns.map(c => ({ ...c, connected: false })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (tabs.length === 0) addTab(activeConnectionId);
  }, []);

  const ToolBtn = ({ icon: Icon, label, onClick, active }: { icon: React.ElementType; label: string; onClick: () => void; active?: boolean }) => (
    <button onClick={onClick} className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs hover:bg-accent ${active ? 'bg-accent text-foreground' : 'text-muted-foreground'}`} title={label}>
      <Icon className="h-3.5 w-3.5" /> <span className="hidden lg:inline">{label}</span>
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      {/* Top toolbar */}
      <header className="flex h-10 items-center justify-between border-b bg-card px-2 gap-1 overflow-x-auto">
        <div className="flex items-center gap-1 shrink-0">
          <div className="flex items-center gap-1.5 text-sm font-bold text-primary mr-2">
            <Database className="h-4 w-4" /> PgIDE
          </div>
          <button onClick={() => setSidebarVisible(v => !v)} className="rounded p-1 hover:bg-accent" title="Toggle Sidebar">
            {sidebarVisible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </button>
        </div>

        {/* Feature buttons */}
        <div className="flex items-center gap-0.5 flex-1 justify-center">
          <ToolBtn icon={Plug} label="Connections" onClick={() => setConnManagerOpen(true)} />
          <div className="w-px h-5 bg-border mx-1" />
          <ToolBtn icon={Zap} label="EXPLAIN" onClick={() => setBottomPanel('explain')} active={bottomPanel === 'explain'} />
          <ToolBtn icon={Lightbulb} label="Index Advisor" onClick={() => setBottomPanel('indexAdvisor')} active={bottomPanel === 'indexAdvisor'} />
          <div className="w-px h-5 bg-border mx-1" />
          <ToolBtn icon={BarChart3} label="Table Stats" onClick={() => setModal(m => m === 'tableStats' ? null : 'tableStats')} active={modal === 'tableStats'} />
          <ToolBtn icon={Gauge} label="Slow Queries" onClick={() => setModal(m => m === 'slowQueries' ? null : 'slowQueries')} active={modal === 'slowQueries'} />
          <ToolBtn icon={Network} label="ER Diagram" onClick={() => setModal(m => m === 'erDiagram' ? null : 'erDiagram')} active={modal === 'erDiagram'} />
          <ToolBtn icon={GitCompare} label="Schema Diff" onClick={() => setModal(m => m === 'schemaDiff' ? null : 'schemaDiff')} active={modal === 'schemaDiff'} />
          <ToolBtn icon={Workflow} label="Query Builder" onClick={() => setModal(m => m === 'queryBuilder' ? null : 'queryBuilder')} active={modal === 'queryBuilder'} />
          <ToolBtn icon={HardDrive} label="Dump/Import" onClick={() => setModal(m => m === 'dumpImport' ? null : 'dumpImport')} active={modal === 'dumpImport'} />
          <ToolBtn icon={Keyboard} label="Shortcuts" onClick={() => setModal(m => m === 'shortcuts' ? null : 'shortcuts')} active={modal === 'shortcuts'} />
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <ToolBtn icon={Boxes} label="pgvector" onClick={() => { setSidePanel('pgvector'); setSidebarVisible(true); }} active={sidePanel === 'pgvector'} />
          <ToolBtn icon={History} label="History" onClick={() => { setSidePanel('history'); setSidebarVisible(true); }} active={sidePanel === 'history'} />
          <ToolBtn icon={Bookmark} label="Bookmarks" onClick={() => { setSidePanel('bookmarks'); setSidebarVisible(true); }} active={sidePanel === 'bookmarks'} />
          <button onClick={toggleTheme} className="rounded p-1.5 hover:bg-accent" title="Toggle Theme">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          {connections.filter(c => c.connected).length > 0 && (
            <span className="rounded-full bg-green-500 px-1.5 text-[10px] text-white ml-1">
              {connections.filter(c => c.connected).length}
            </span>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 min-h-0">
        {modal ? (
          /* Full-screen modal panels */
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between border-b px-3 py-1 bg-card shrink-0">
              <span className="text-xs text-muted-foreground">
                {modal === 'tableStats' && 'Table Stats Dashboard'}
                {modal === 'slowQueries' && 'Slow Queries'}
                {modal === 'erDiagram' && 'ER Diagram'}
                {modal === 'schemaDiff' && 'Schema Diff & Migration'}
                {modal === 'queryBuilder' && 'Visual Query Builder'}
                {modal === 'dumpImport' && 'SQL Dump & Import'}
                {modal === 'shortcuts' && 'Keyboard Shortcuts'}
              </span>
              <button onClick={() => setModal(null)} className="rounded p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 min-h-0">
              {modal === 'tableStats' && <TableStats />}
              {modal === 'slowQueries' && <SlowQueries />}
              {modal === 'erDiagram' && <ERDiagram />}
              {modal === 'schemaDiff' && <SchemaDiffViewer />}
              {modal === 'queryBuilder' && <VisualQueryBuilder />}
              {modal === 'dumpImport' && <DumpImport />}
              {modal === 'shortcuts' && <KeyboardShortcuts />}
            </div>
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
                          className={`flex-1 px-2 py-1.5 text-[10px] capitalize ${sidePanel === p ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
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
                <Panel defaultSize={55} minSize={20}>
                  <QueryEditor onOpenConnectionManager={() => setConnManagerOpen(true)} />
                </Panel>
                <PanelResizeHandle className="h-1 bg-border hover:bg-primary/50 transition-colors" />
                <Panel defaultSize={45} minSize={15}>
                  <div className="flex flex-col h-full">
                    {/* Bottom panel tabs */}
                    <div className="flex border-b shrink-0 bg-card">
                      {([
                        { id: 'results' as BottomPanel, label: 'Results' },
                        { id: 'explain' as BottomPanel, label: 'EXPLAIN' },
                        { id: 'indexAdvisor' as BottomPanel, label: 'Index Advisor' },
                      ]).map(p => (
                        <button
                          key={p.id}
                          onClick={() => setBottomPanel(p.id)}
                          className={`px-3 py-1.5 text-xs ${bottomPanel === p.id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                        >
                          {p.label}
                        </button>
                      ))}
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

      {/* Status bar */}
      <footer className="flex h-6 items-center justify-between border-t bg-card px-3 text-[10px] text-muted-foreground">
        <span>
          {activeConnectionId
            ? `Connected: ${connections.find(c => c.id === activeConnectionId)?.name || 'Unknown'}`
            : 'Not connected'}
        </span>
        <span>PgIDE v1.0.0</span>
      </footer>

      <ConnectionManager open={connManagerOpen} onClose={() => setConnManagerOpen(false)} />
    </div>
  );
}
