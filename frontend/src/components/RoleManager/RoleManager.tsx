import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/services/api';
import { RefreshCw, Loader2, Shield, ChevronDown } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

export default function RoleManager() {
  const [connId, setConnId] = useConnectionId();
  const [roles, setRoles] = useState<any[]>([]);
  const [grants, setGrants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'roles' | 'grants'>('roles');
  const [schema, setSchema] = useState('public');
  const [schemas, setSchemas] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (!connId) { console.warn('[RoleManager] No connId, skipping load'); return; }
    console.log('[RoleManager] Loading roles for connId:', connId);
    setLoading(true); setError('');
    const errors: string[] = [];

    try {
      const r = await api.getRoles(connId);
      console.log('[RoleManager] Roles loaded:', r.length, 'rows');
      if (mountedRef.current) setRoles(r);
    } catch (e: any) {
      console.error('[RoleManager] getRoles failed:', e.message);
      errors.push(`Roles: ${e.message}`);
    }

    try {
      const s = await api.getSchemas(connId);
      console.log('[RoleManager] Schemas loaded:', s.length, 'rows');
      if (mountedRef.current) setSchemas(s.map((x: any) => x.name));
    } catch (e: any) {
      console.error('[RoleManager] getSchemas failed:', e.message);
      errors.push(`Schemas: ${e.message}`);
    }

    if (mountedRef.current) {
      if (errors.length) setError(errors.join(' | '));
      setLoading(false);
    }
  }, [connId]);

  const loadGrants = useCallback(async () => {
    if (!connId) return;
    console.log('[RoleManager] Loading grants for connId:', connId, 'schema:', schema);
    setLoading(true); setError('');
    try {
      const g = await api.getTableGrants(connId, schema);
      console.log('[RoleManager] Grants loaded:', g.length, 'rows');
      if (mountedRef.current) setGrants(g);
    } catch (e: any) {
      console.error('[RoleManager] getTableGrants failed:', e.message);
      if (mountedRef.current) setError(e.message);
    }
    if (mountedRef.current) setLoading(false);
  }, [connId, schema]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'grants') loadGrants(); }, [tab, loadGrants]);

  const toggleExpand = (name: string) => {
    setExpanded(prev => { const n = new Set(prev); n.has(name) ? n.delete(name) : n.add(name); return n; });
  };

  const grantsByTable = grants.reduce((acc: Record<string, any[]>, g) => {
    const key = `${g.schema}.${g.table}`;
    (acc[key] ||= []).push(g);
    return acc;
  }, {});

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Shield className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Roles &amp; Permissions</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        <div className="flex gap-1 ml-2">
          {(['roles', 'grants'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 text-xs capitalize ${tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{t}</button>
          ))}
        </div>
        {tab === 'grants' && (
          <select value={schema} onChange={e => setSchema(e.target.value)} className="ml-2 h-6 rounded border px-1 text-xs bg-background">
            {schemas.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <button onClick={tab === 'roles' ? load : loadGrants} disabled={loading} className="rounded p-1 hover:bg-accent ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive bg-destructive/5">{error}</div>}
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tab === 'roles' ? (
          roles.length === 0 ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {error ? 'Failed to load roles' : 'No roles found'}
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card border-b">
                <tr>
                  {['Role','Superuser','Login','Create DB','Create Role','Replication','Conn Limit','Member Of'].map(h =>
                    <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {roles.map(r => (
                  <tr key={r.name} className="border-b hover:bg-accent/50">
                    <td className="px-2 py-1 font-medium">{r.name}</td>
                    <td className="px-2 py-1">{r.is_superuser ? <span className="text-destructive font-bold">Yes</span> : 'No'}</td>
                    <td className="px-2 py-1">{r.can_login ? <span className="text-green-500">Yes</span> : 'No'}</td>
                    <td className="px-2 py-1">{r.can_create_db ? 'Yes' : 'No'}</td>
                    <td className="px-2 py-1">{r.can_create_role ? 'Yes' : 'No'}</td>
                    <td className="px-2 py-1">{r.is_replication ? 'Yes' : 'No'}</td>
                    <td className="px-2 py-1">{r.conn_limit === -1 ? '∞' : r.conn_limit}</td>
                    <td className="px-2 py-1">{r.member_of?.length ? (Array.isArray(r.member_of) ? r.member_of.join(', ') : String(r.member_of)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <div className="p-2 space-y-1">
            {Object.entries(grantsByTable).map(([table, perms]) => (
              <div key={table} className="border rounded">
                <button onClick={() => toggleExpand(table)} className="flex items-center gap-2 w-full px-2 py-1.5 text-xs hover:bg-accent">
                  <ChevronDown className={`h-3 w-3 transition-transform ${expanded.has(table) ? '' : '-rotate-90'}`} />
                  <span className="font-medium">{table}</span>
                  <span className="text-muted-foreground">({perms.length} grants)</span>
                </button>
                {expanded.has(table) && (
                  <div className="border-t px-2 py-1">
                    <table className="w-full text-xs">
                      <thead><tr>
                        {['Grantee','Privilege','Grantable'].map(h =>
                          <th key={h} className="px-2 py-1 text-left text-muted-foreground">{h}</th>
                        )}
                      </tr></thead>
                      <tbody>
                        {perms.map((p: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="px-2 py-0.5">{p.grantee}</td>
                            <td className="px-2 py-0.5 font-mono">{p.privilege_type}</td>
                            <td className="px-2 py-0.5">{p.is_grantable === 'YES' ? <span className="text-yellow-500">Yes</span> : 'No'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {Object.keys(grantsByTable).length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">
                {error ? 'Failed to load grants' : `No grants found for schema "${schema}"`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
