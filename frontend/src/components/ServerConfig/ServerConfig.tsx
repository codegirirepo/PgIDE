import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/services/api';
import { RefreshCw, Loader2, Settings, Search } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

export default function ServerConfig() {
  const [connId, setConnId] = useConnectionId();
  const [settings, setSettings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const load = useCallback(async () => {
    if (!connId) return;
    setLoading(true); setError('');
    try { setSettings(await api.getServerConfig(connId)); }
    catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [connId]);

  useEffect(() => { load(); }, [load]);

  const categories = useMemo(() => [...new Set(settings.map(s => s.category))].sort(), [settings]);

  const filtered = useMemo(() => settings.filter(s => {
    if (categoryFilter && s.category !== categoryFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return s.name.toLowerCase().includes(q) || s.description?.toLowerCase().includes(q) || s.setting?.toLowerCase().includes(q);
  }), [settings, search, categoryFilter]);

  const isModified = (s: any) => s.source !== 'default' && s.source !== 'override';

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0 flex-wrap">
        <Settings className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Server Configuration</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        <span className="text-xs text-muted-foreground">({filtered.length} params)</span>
        <div className="flex items-center gap-1 ml-2 border rounded px-2 h-6 bg-background">
          <Search className="h-3 w-3 text-muted-foreground" />
          <input placeholder="Search settings..." value={search} onChange={e => setSearch(e.target.value)}
            className="h-full w-48 text-xs bg-transparent outline-none" />
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}
          className="h-6 rounded border px-1 text-xs bg-background">
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-card border-b">
            <tr>
              {['Name','Value','Unit','Default','Source','Context','Description'].map(h =>
                <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.name} className={`border-b hover:bg-accent/50 ${isModified(s) ? 'bg-yellow-500/5' : ''}`}>
                <td className="px-2 py-1 font-mono font-medium">{s.name}</td>
                <td className="px-2 py-1 font-mono">
                  <span className={isModified(s) ? 'text-yellow-500 font-bold' : ''}>{s.setting}</span>
                </td>
                <td className="px-2 py-1 text-muted-foreground">{s.unit || '—'}</td>
                <td className="px-2 py-1 font-mono text-muted-foreground">{s.default_value || '—'}</td>
                <td className="px-2 py-1">
                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                    s.source === 'default' ? 'bg-accent' :
                    s.source === 'configuration file' ? 'bg-blue-500/20 text-blue-500' :
                    s.source === 'session' ? 'bg-green-500/20 text-green-500' :
                    'bg-yellow-500/20 text-yellow-500'
                  }`}>{s.source}</span>
                </td>
                <td className="px-2 py-1 text-[10px]">{s.context}</td>
                <td className="px-2 py-1 max-w-[300px] truncate text-muted-foreground" title={s.description}>{s.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
