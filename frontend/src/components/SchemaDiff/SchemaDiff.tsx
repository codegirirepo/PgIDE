import { useState } from 'react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import type { SchemaDiff } from '@/types';
import { GitCompare, Loader2, Plus, Minus, PenLine, Copy, FileCode } from 'lucide-react';

export default function SchemaDiffViewer() {
  const connections = useAppStore(s => s.connections.filter(c => c.connected));
  const updateTab = useAppStore(s => s.updateTab);
  const activeTabId = useAppStore(s => s.activeTabId);
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [diffs, setDiffs] = useState<SchemaDiff[]>([]);
  const [migrationSql, setMigrationSql] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'diff' | 'migration'>('diff');

  const compare = async () => {
    if (!source || !target) return;
    setLoading(true);
    setError('');
    try {
      const result = await api.generateMigration(source, target);
      setDiffs(result.diffs);
      setMigrationSql(result.sql);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  const statusIcon = (s: string) => {
    if (s === 'added') return <Plus className="h-3.5 w-3.5 text-green-500" />;
    if (s === 'removed') return <Minus className="h-3.5 w-3.5 text-destructive" />;
    return <PenLine className="h-3.5 w-3.5 text-yellow-500" />;
  };

  const statusColor = (s: string) => s === 'added' ? 'border-green-500/30 bg-green-500/5' : s === 'removed' ? 'border-destructive/30 bg-destructive/5' : 'border-yellow-500/30 bg-yellow-500/5';

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0 flex-wrap">
        <GitCompare className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Schema Diff</span>
        <select value={source} onChange={e => setSource(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs">
          <option value="">Source...</option>
          {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.database})</option>)}
        </select>
        <span className="text-xs text-muted-foreground">→</span>
        <select value={target} onChange={e => setTarget(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs">
          <option value="">Target...</option>
          {connections.map(c => <option key={c.id} value={c.id}>{c.name} ({c.database})</option>)}
        </select>
        <button onClick={compare} disabled={loading || !source || !target} className="flex items-center gap-1 rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <GitCompare className="h-3 w-3" />} Compare
        </button>
      </div>

      {diffs.length > 0 && (
        <div className="flex border-b shrink-0">
          <button onClick={() => setView('diff')} className={`px-3 py-1.5 text-xs ${view === 'diff' ? 'border-b-2 border-primary' : 'text-muted-foreground'}`}>
            Differences ({diffs.length})
          </button>
          <button onClick={() => setView('migration')} className={`px-3 py-1.5 text-xs ${view === 'migration' ? 'border-b-2 border-primary' : 'text-muted-foreground'}`}>
            <FileCode className="h-3 w-3 inline mr-1" />Migration SQL
          </button>
        </div>
      )}

      <div className="flex-1 overflow-auto p-3">
        {error && <div className="text-destructive text-sm mb-3">{error}</div>}

        {!loading && diffs.length === 0 && !error && (
          <div className="text-center text-sm text-muted-foreground py-8">
            Select two connected databases and click Compare to see schema differences
          </div>
        )}

        {view === 'diff' && diffs.map((d, i) => (
          <div key={i} className={`rounded-lg border p-3 mb-2 ${statusColor(d.status)}`}>
            <div className="flex items-center gap-2">
              {statusIcon(d.status)}
              <span className="text-sm font-medium">{d.table}</span>
              <span className="text-[10px] uppercase text-muted-foreground">{d.status}</span>
            </div>
            <div className="mt-1.5 space-y-0.5">
              {d.details.map((det, j) => (
                <div key={j} className="text-xs text-muted-foreground pl-5">
                  <span className="font-medium text-foreground">{det.column}</span>: {det.change}
                </div>
              ))}
            </div>
          </div>
        ))}

        {view === 'migration' && migrationSql && (
          <div>
            <div className="flex gap-2 mb-2">
              <button onClick={() => navigator.clipboard.writeText(migrationSql)} className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent">
                <Copy className="h-3 w-3" /> Copy
              </button>
              <button
                onClick={() => { if (activeTabId) updateTab(activeTabId, { sql: migrationSql }); }}
                className="flex items-center gap-1 rounded px-2 py-1 text-xs bg-primary/10 hover:bg-primary/20 text-primary"
              >
                Open in Editor
              </button>
            </div>
            <pre className="rounded bg-muted p-3 text-xs font-mono whitespace-pre-wrap overflow-auto">{migrationSql}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
