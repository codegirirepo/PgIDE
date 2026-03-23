import { useState, useCallback, memo } from 'react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import type { ConnectionConfig, SavedConnection } from '@/types';
import {
  Database, Plus, Trash2, Plug, PlugZap, TestTube, Loader2, X, Check, AlertCircle,
} from 'lucide-react';

const empty: ConnectionConfig = { name: '', host: 'localhost', port: 5432, database: 'postgres', user: 'postgres', password: '', ssl: false };

function Field({ label, value, type = 'text', onChange }: {
  label: string; value: string | number; type?: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type={type}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );
}

const ConnectionList = memo(function ConnectionList({
  connections, onConnect, onDisconnect, onDelete,
}: {
  connections: SavedConnection[];
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Saved Connections</h3>
      <div className="max-h-[300px] space-y-1 overflow-auto">
        {connections.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">No saved connections</p>}
        {connections.map(c => (
          <div key={c.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
            <div>
              <div className="font-medium flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${c.connected ? 'bg-green-500' : 'bg-gray-400'}`} />
                {c.name}
              </div>
              <div className="text-xs text-muted-foreground">{c.host}:{c.port}/{c.database}</div>
            </div>
            <div className="flex gap-1">
              {c.connected ? (
                <button onClick={() => onDisconnect(c.id)} className="rounded p-1 hover:bg-destructive/20 text-destructive" title="Disconnect">
                  <PlugZap className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button onClick={() => onConnect(c.id)} className="rounded p-1 hover:bg-green-500/20 text-green-500" title="Connect">
                  <Plug className="h-3.5 w-3.5" />
                </button>
              )}
              <button onClick={() => onDelete(c.id)} className="rounded p-1 hover:bg-destructive/20 text-destructive" title="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

export default function ConnectionManager({ open, onClose }: { open: boolean; onClose: () => void }) {
  const connections = useAppStore(s => s.connections);
  const addConnection = useAppStore(s => s.addConnection);
  const removeConnection = useAppStore(s => s.removeConnection);
  const setConnectionStatus = useAppStore(s => s.setConnectionStatus);
  const setActiveConnection = useAppStore(s => s.setActiveConnection);

  const [form, setForm] = useState<ConnectionConfig>({ ...empty });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const updateField = useCallback((name: keyof ConnectionConfig, value: string) => {
    setForm(f => ({
      ...f,
      [name]: name === 'port' ? (value === '' ? '' : +value) : value,
    }));
  }, []);

  if (!open) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection(form);
      setTestResult(res);
    } catch (e: any) {
      setTestResult({ success: false, message: e.message });
    }
    setTesting(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await api.saveConnection(form);
      addConnection({ ...saved, connected: false });
      // Auto-connect after save
      try {
        const res = await api.connect(saved.id);
        if (res.success) {
          setConnectionStatus(saved.id, true);
          setActiveConnection(saved.id);
        }
      } catch {}
      setForm({ ...empty });
      setTestResult(null);
      onClose();
    } catch (e: any) {
      setTestResult({ success: false, message: e.message });
    }
    setSaving(false);
  };

  const handleConnect = async (id: string) => {
    try {
      const res = await api.connect(id);
      if (res.success) {
        setConnectionStatus(id, true);
        setActiveConnection(id);
        onClose();
      }
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleDisconnect = async (id: string) => {
    await api.disconnect(id);
    setConnectionStatus(id, false);
  };

  const handleDelete = async (id: string) => {
    await api.deleteConnection(id);
    removeConnection(id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="w-[700px] max-h-[85vh] overflow-auto rounded-lg border bg-card shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Database className="h-5 w-5" /> Connection Manager</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-4 p-4">
          <ConnectionList
            connections={connections}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onDelete={handleDelete}
          />

          <div className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">New Connection</h3>
            <Field label="Connection Name" value={form.name} onChange={v => updateField('name', v)} />
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2"><Field label="Host" value={form.host} onChange={v => updateField('host', v)} /></div>
              <Field label="Port" type="number" value={form.port} onChange={v => updateField('port', v)} />
            </div>
            <Field label="Database" value={form.database} onChange={v => updateField('database', v)} />
            <Field label="Username" value={form.user} onChange={v => updateField('user', v)} />
            <Field label="Password" type="password" value={form.password} onChange={v => updateField('password', v)} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.ssl || false} onChange={e => setForm(f => ({ ...f, ssl: e.target.checked }))} />
              Use SSL
            </label>

            {testResult && (
              <div className={`flex items-center gap-2 rounded-md p-2 text-xs ${testResult.success ? 'bg-green-500/10 text-green-500' : 'bg-destructive/10 text-destructive'}`}>
                {testResult.success ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                {testResult.message}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={handleTest} disabled={testing} className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-sm hover:bg-secondary/80">
                {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube className="h-3.5 w-3.5" />} Test
              </button>
              {testResult?.success && (
                <button onClick={handleSave} disabled={saving || !form.name} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Save & Connect
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
