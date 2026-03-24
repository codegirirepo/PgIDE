import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { RefreshCw, Loader2, Puzzle, Plus, Trash2, Search } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

export default function ExtensionManager() {
  const [connId, setConnId] = useConnectionId();
  const [data, setData] = useState<{ installed: any[]; available: any[] }>({ installed: [], available: [] });
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'installed' | 'available'>('installed');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    if (!connId) return;
    setLoading(true); setError('');
    try { setData(await api.getExtensions(connId)); }
    catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [connId]);

  useEffect(() => { load(); }, [load]);

  const manage = async (name: string, action: 'install' | 'drop') => {
    if (!connId) return;
    if (!confirm(`${action === 'install' ? 'Install' : 'Drop'} extension "${name}"?`)) return;
    setActing(name);
    try { await api.manageExtension(connId, name, action); load(); }
    catch (e: any) { alert(e.message); }
    setActing(null);
  };

  const q = search.toLowerCase();
  const filteredInstalled = data.installed.filter(e => !q || e.name.toLowerCase().includes(q));
  const filteredAvailable = data.available.filter(e => !q || e.name.toLowerCase().includes(q) || e.comment?.toLowerCase().includes(q));

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Puzzle className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Extensions</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        <div className="flex gap-1 ml-2">
          {(['installed', 'available'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 text-xs capitalize ${tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              {t} ({t === 'installed' ? data.installed.length : data.available.length})
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-2 border rounded px-2 h-6 bg-background">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-full w-36 text-xs bg-transparent outline-none" />
        </div>
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      <div className="flex-1 overflow-auto min-h-0">
        {tab === 'installed' ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b">
              <tr>
                {['Extension','Version','Schema','Actions'].map(h =>
                  <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredInstalled.map(e => (
                <tr key={e.name} className="border-b hover:bg-accent/50">
                  <td className="px-2 py-1.5 font-medium">{e.name}</td>
                  <td className="px-2 py-1.5 font-mono">{e.version}</td>
                  <td className="px-2 py-1.5">{e.schema}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => manage(e.name, 'drop')} disabled={acting === e.name}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-destructive hover:bg-destructive/10 disabled:opacity-50">
                      {acting === e.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />} Drop
                    </button>
                  </td>
                </tr>
              ))}
              {filteredInstalled.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No installed extensions</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b">
              <tr>
                {['Extension','Version','Description','Actions'].map(h =>
                  <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredAvailable.map(e => (
                <tr key={e.name} className="border-b hover:bg-accent/50">
                  <td className="px-2 py-1.5 font-medium">{e.name}</td>
                  <td className="px-2 py-1.5 font-mono">{e.default_version}</td>
                  <td className="px-2 py-1.5 max-w-[400px] truncate text-muted-foreground" title={e.comment}>{e.comment || '—'}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => manage(e.name, 'install')} disabled={acting === e.name}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-green-500 hover:bg-green-500/10 disabled:opacity-50">
                      {acting === e.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Install
                    </button>
                  </td>
                </tr>
              ))}
              {filteredAvailable.length === 0 && <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">No available extensions</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
