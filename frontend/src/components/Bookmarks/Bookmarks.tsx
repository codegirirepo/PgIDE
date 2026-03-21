import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { Bookmark, Plus, Trash2, Play, Search, Tag, X } from 'lucide-react';

export default function Bookmarks() {
  const { bookmarks, addBookmark, removeBookmark, tabs, activeTabId, updateTab, addTab, activeConnectionId } = useAppStore();
  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', tags: '' });

  const allTags = [...new Set(bookmarks.flatMap(b => b.tags))];

  const filtered = bookmarks.filter(b => {
    if (search && !b.name.toLowerCase().includes(search.toLowerCase()) && !b.sql.toLowerCase().includes(search.toLowerCase())) return false;
    if (tagFilter && !b.tags.includes(tagFilter)) return false;
    return true;
  });

  const saveBookmark = () => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab?.sql.trim() || !form.name.trim()) return;
    addBookmark({
      name: form.name.trim(),
      sql: activeTab.sql,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      connectionId: activeTab.connectionId || undefined,
    });
    setForm({ name: '', tags: '' });
    setShowAdd(false);
  };

  const loadBookmark = (sql: string, connectionId?: string) => {
    const connId = connectionId || activeConnectionId;
    if (activeTabId) {
      updateTab(activeTabId, { sql, connectionId: connId });
    } else {
      addTab(connId);
      setTimeout(() => {
        const tabId = useAppStore.getState().activeTabId;
        if (tabId) updateTab(tabId, { sql, connectionId: connId });
      }, 0);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Bookmark className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Bookmarks</span>
        <button onClick={() => setShowAdd(s => !s)} className="ml-auto flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-accent">
          <Plus className="h-3 w-3" /> Save Current
        </button>
      </div>

      {showAdd && (
        <div className="border-b p-3 space-y-2">
          <input
            value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Bookmark name..."
            className="h-7 w-full rounded border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <input
            value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            placeholder="Tags (comma separated)..."
            className="h-7 w-full rounded border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex gap-2">
            <button onClick={saveBookmark} disabled={!form.name.trim()} className="rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Save</button>
            <button onClick={() => setShowAdd(false)} className="rounded px-3 py-1 text-xs hover:bg-accent">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 border-b px-3 py-1.5 shrink-0">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="h-6 flex-1 bg-transparent text-xs focus:outline-none" />
      </div>

      {allTags.length > 0 && (
        <div className="flex gap-1 px-3 py-1.5 border-b flex-wrap shrink-0">
          {tagFilter && (
            <button onClick={() => setTagFilter('')} className="flex items-center gap-0.5 rounded-full bg-primary px-2 py-0.5 text-[10px] text-primary-foreground">
              {tagFilter} <X className="h-2.5 w-2.5" />
            </button>
          )}
          {allTags.filter(t => t !== tagFilter).map(tag => (
            <button key={tag} onClick={() => setTagFilter(tag)} className="flex items-center gap-0.5 rounded-full bg-muted px-2 py-0.5 text-[10px] hover:bg-accent">
              <Tag className="h-2.5 w-2.5" /> {tag}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 && <p className="p-4 text-center text-xs text-muted-foreground">No bookmarks</p>}
        {filtered.map(b => (
          <div key={b.id} className="group border-b px-3 py-2 hover:bg-accent/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">{b.name}</span>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                <button onClick={() => loadBookmark(b.sql, b.connectionId)} className="rounded p-1 hover:bg-primary/20" title="Load"><Play className="h-3 w-3" /></button>
                <button onClick={() => removeBookmark(b.id)} className="rounded p-1 hover:bg-destructive/20 text-destructive" title="Delete"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
            {b.tags.length > 0 && (
              <div className="flex gap-1 mt-0.5">
                {b.tags.map(t => <span key={t} className="rounded-full bg-muted px-1.5 py-0 text-[9px]">{t}</span>)}
              </div>
            )}
            <pre className="mt-1 text-[10px] font-mono text-muted-foreground truncate">{b.sql}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
