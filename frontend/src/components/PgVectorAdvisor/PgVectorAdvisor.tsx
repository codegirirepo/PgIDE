import { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { api } from '@/services/api';
import { analyzeSQL, EMBEDDING_MODELS, DISTANCE_OPERATORS, VECTOR_SNIPPETS } from '@/services/pgvector/pgvectorAnalyzer';
import type { PgVectorStatus, PgVectorHint } from '@/types';
import {
  AlertTriangle, Info, Lightbulb, Copy, Check, Database, Boxes, ChevronDown, ChevronRight,
  Zap, BookOpen,
} from 'lucide-react';

function HintIcon({ type }: { type: string }) {
  if (type === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />;
  if (type === 'suggestion') return <Lightbulb className="h-3.5 w-3.5 text-blue-400 shrink-0" />;
  return <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="ml-auto shrink-0 rounded p-0.5 hover:bg-accent"
      title="Copy SQL"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

function HintCard({ hint }: { hint: PgVectorHint }) {
  return (
    <div className="flex items-start gap-2 rounded border px-2.5 py-2 text-xs">
      <HintIcon type={hint.type} />
      <div className="flex-1 min-w-0">
        <p>{hint.message}</p>
        {hint.sql && (
          <div className="mt-1 flex items-center gap-1 rounded bg-muted px-2 py-1 font-mono text-[10px]">
            <span className="truncate">{hint.sql}</span>
            <CopyButton text={hint.sql} />
          </div>
        )}
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon, children, defaultOpen = false }: {
  title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b last:border-b-0">
      <button onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-accent/50">
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {icon}
        {title}
      </button>
      {open && <div className="px-3 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function SnippetCard({ title, sql }: { title: string; sql: string }) {
  const addTab = useAppStore(s => s.addTab);
  const updateTab = useAppStore(s => s.updateTab);
  const activeConnectionId = useAppStore(s => s.activeConnectionId);

  const insertSnippet = () => {
    addTab(activeConnectionId);
    setTimeout(() => {
      const tabId = useAppStore.getState().activeTabId;
      if (tabId) updateTab(tabId, { sql });
    }, 0);
  };

  return (
    <div className="rounded border text-xs">
      <div className="flex items-center justify-between border-b px-2 py-1.5 bg-muted/30">
        <span className="font-medium">{title}</span>
        <div className="flex gap-1">
          <button onClick={insertSnippet} className="rounded px-1.5 py-0.5 hover:bg-accent text-[10px]" title="Open in new tab">
            Open
          </button>
          <CopyButton text={sql} />
        </div>
      </div>
      <pre className="p-2 overflow-x-auto text-[10px] font-mono text-muted-foreground whitespace-pre-wrap">{sql}</pre>
    </div>
  );
}

export default function PgVectorAdvisor() {
  const activeConnectionId = useAppStore(s => s.activeConnectionId);
  const activeTab = useAppStore(s => s.tabs.find(t => t.id === s.activeTabId));
  const [status, setStatus] = useState<PgVectorStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [sqlHints, setSqlHints] = useState<PgVectorHint[]>([]);

  // Fetch pgvector status when connection changes
  const fetchStatus = useCallback(async () => {
    if (!activeConnectionId) { setStatus(null); return; }
    setLoading(true);
    try {
      const s = await api.getPgVectorStatus(activeConnectionId);
      setStatus(s);
    } catch { setStatus(null); }
    setLoading(false);
  }, [activeConnectionId]);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // Analyze current SQL for vector hints (debounced)
  useEffect(() => {
    const sql = activeTab?.sql || '';
    const timer = setTimeout(() => {
      const isVectorRelated = /vector|<->|<#>|<=>|embedding|hnsw|ivfflat/i.test(sql);
      setSqlHints(isVectorRelated ? analyzeSQL(sql) : []);
    }, 500);
    return () => clearTimeout(timer);
  }, [activeTab?.sql]);

  const allHints = [...sqlHints, ...(status?.hints || [])];
  const hasVectorContent = /vector|embedding|hnsw|ivfflat|<->|<#>|<=>/i.test(activeTab?.sql || '');

  if (!activeConnectionId) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground p-4 text-center">
        Connect to a database to see pgvector advisor
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Boxes className="h-4 w-4 text-purple-400" />
        <span className="text-xs font-medium">pgvector Advisor</span>
        {status?.installed && (
          <span className="ml-auto rounded bg-green-500/20 px-1.5 py-0.5 text-[10px] text-green-400">
            v{status.version}
          </span>
        )}
        {status && !status.installed && (
          <span className="ml-auto rounded bg-yellow-500/20 px-1.5 py-0.5 text-[10px] text-yellow-400">
            Not installed
          </span>
        )}
        <button onClick={fetchStatus} className="rounded p-1 hover:bg-accent" title="Refresh">
          <Database className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Active hints */}
      {allHints.length > 0 && (
        <CollapsibleSection title={`Hints (${allHints.length})`} icon={<Zap className="h-3.5 w-3.5 text-yellow-400" />} defaultOpen>
          {allHints.map((h, i) => <HintCard key={i} hint={h} />)}
        </CollapsibleSection>
      )}

      {/* Vector columns in database */}
      {status?.vectorColumns && status.vectorColumns.length > 0 && (
        <CollapsibleSection title={`Vector Columns (${status.vectorColumns.length})`} icon={<Database className="h-3.5 w-3.5 text-blue-400" />}>
          <div className="space-y-1">
            {status.vectorColumns.map((col, i) => (
              <div key={i} className="flex items-center gap-2 rounded border px-2 py-1.5 text-[11px]">
                <span className="font-mono">{col.schema}.{col.table}.{col.column}</span>
                {col.dimensions && <span className="text-muted-foreground">({col.dimensions}d)</span>}
                {col.hasIndex
                  ? <span className="ml-auto rounded bg-green-500/20 px-1 text-[9px] text-green-400">indexed</span>
                  : <span className="ml-auto rounded bg-red-500/20 px-1 text-[9px] text-red-400">no index</span>
                }
                <span className="text-muted-foreground text-[9px]">~{col.rowEstimate.toLocaleString()} rows</span>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Vector indexes */}
      {status?.vectorIndexes && status.vectorIndexes.length > 0 && (
        <CollapsibleSection title={`Vector Indexes (${status.vectorIndexes.length})`} icon={<Zap className="h-3.5 w-3.5 text-green-400" />}>
          <div className="space-y-1">
            {status.vectorIndexes.map((idx, i) => (
              <div key={i} className="rounded border px-2 py-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-medium">{idx.indexName}</span>
                  <span className="rounded bg-purple-500/20 px-1 text-[9px] text-purple-400">{idx.indexMethod}</span>
                  <span className="text-muted-foreground text-[9px]">{idx.opclass}</span>
                </div>
                <div className="mt-0.5 font-mono text-[9px] text-muted-foreground truncate">{idx.definition}</div>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      )}

      {/* Distance operators reference */}
      <CollapsibleSection title="Distance Operators" icon={<BookOpen className="h-3.5 w-3.5 text-muted-foreground" />}>
        <div className="space-y-1">
          {DISTANCE_OPERATORS.map(op => (
            <div key={op.op} className="flex items-center gap-2 rounded border px-2 py-1.5 text-[11px]">
              <code className="font-mono font-bold text-purple-400">{op.op}</code>
              <span className="font-medium">{op.name}</span>
              <span className="text-muted-foreground text-[10px]">{op.desc}</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Embedding model reference */}
      <CollapsibleSection title="Embedding Models" icon={<BookOpen className="h-3.5 w-3.5 text-muted-foreground" />}>
        <div className="space-y-1">
          {Object.entries(EMBEDDING_MODELS).map(([name, info]) => (
            <div key={name} className="flex items-center gap-2 rounded border px-2 py-1.5 text-[11px]">
              <span className="font-medium truncate">{name}</span>
              <span className="ml-auto shrink-0 font-mono text-purple-400">{info.dims}d</span>
            </div>
          ))}
        </div>
      </CollapsibleSection>

      {/* Code snippets */}
      <CollapsibleSection title="Templates & Snippets" icon={<BookOpen className="h-3.5 w-3.5 text-muted-foreground" />} defaultOpen={hasVectorContent}>
        <div className="space-y-2">
          <SnippetCard title="Create Table with Embeddings" sql={VECTOR_SNIPPETS.createTable} />
          <SnippetCard title="HNSW Index" sql={VECTOR_SNIPPETS.hnswIndex} />
          <SnippetCard title="IVFFlat Index" sql={VECTOR_SNIPPETS.ivfflatIndex} />
          <SnippetCard title="Similarity Search" sql={VECTOR_SNIPPETS.similaritySearch} />
          <SnippetCard title="Hybrid Search (Vector + Text)" sql={VECTOR_SNIPPETS.hybridSearch} />
          <SnippetCard title="RAG Pattern" sql={VECTOR_SNIPPETS.ragPattern} />
          <SnippetCard title="Performance Tuning" sql={VECTOR_SNIPPETS.perfTuning} />
        </div>
      </CollapsibleSection>
    </div>
  );
}
