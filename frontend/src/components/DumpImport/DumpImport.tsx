import { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import { Download, Upload, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

type Tab = 'export' | 'import';

export default function DumpImport() {
  const { connections, activeConnectionId } = useAppStore();
  const connected = connections.filter(c => c.connected);

  const [tab, setTab] = useState<Tab>('export');
  const [connId, setConnId] = useState(activeConnectionId || '');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Export options
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchema, setSelectedSchema] = useState('');
  const [schemaOnly, setSchemaOnly] = useState(false);
  const [dataOnly, setDataOnly] = useState(false);

  // Import
  const [importSQL, setImportSQL] = useState('');

  useEffect(() => {
    if (!connId) return;
    api.getDumpSchemas(connId).then(setSchemas).catch(() => setSchemas([]));
  }, [connId]);

  const handleExport = async () => {
    if (!connId) return;
    setLoading(true); setMessage(null);
    try {
      const sql = await api.exportDatabase(connId, { schemaOnly, dataOnly, schema: selectedSchema || undefined });
      const blob = new Blob([sql], { type: 'text/sql' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dump_${selectedSchema || 'full'}_${Date.now()}.sql`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: `Exported ${(sql.length / 1024).toFixed(1)} KB` });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
  };

  const handleImport = async () => {
    if (!connId || !importSQL.trim()) return;
    setLoading(true); setMessage(null);
    try {
      const result = await api.importSQL(connId, importSQL);
      setMessage({ type: 'success', text: result.message });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
    }
    setLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportSQL(reader.result as string);
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b shrink-0">
        {([['export', 'Export', Download], ['import', 'Import', Upload]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => { setTab(id); setMessage(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs ${tab === id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto p-4 max-w-xl">
        {/* Connection selector */}
        <div className="mb-4">
          <label className="text-xs text-muted-foreground block mb-1">Connection</label>
          <select value={connId} onChange={e => setConnId(e.target.value)}
            className="w-full bg-background border rounded px-3 py-1.5 text-xs">
            <option value="">Select connection...</option>
            {connected.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Export tab */}
        {tab === 'export' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Schema (optional)</label>
              <select value={selectedSchema} onChange={e => setSelectedSchema(e.target.value)}
                className="w-full bg-background border rounded px-3 py-1.5 text-xs">
                <option value="">All schemas</option>
                {schemas.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={schemaOnly} onChange={e => { setSchemaOnly(e.target.checked); if (e.target.checked) setDataOnly(false); }}
                  className="h-3 w-3 rounded" /> Schema only
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="checkbox" checked={dataOnly} onChange={e => { setDataOnly(e.target.checked); if (e.target.checked) setSchemaOnly(false); }}
                  className="h-3 w-3 rounded" /> Data only
              </label>
            </div>
            <button onClick={handleExport} disabled={loading || !connId}
              className="flex items-center gap-1.5 rounded bg-primary px-4 py-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Export SQL
            </button>
          </div>
        )}

        {/* Import tab */}
        {tab === 'import' && (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Upload .sql file or paste SQL</label>
              <input type="file" accept=".sql,.txt" onChange={handleFileUpload}
                className="text-xs mb-2" />
              <textarea value={importSQL} onChange={e => setImportSQL(e.target.value)}
                placeholder="Paste SQL here or upload a file..."
                className="w-full bg-background border rounded px-3 py-2 text-xs font-mono h-48 resize-y" />
            </div>
            <button onClick={handleImport} disabled={loading || !connId || !importSQL.trim()}
              className="flex items-center gap-1.5 rounded bg-primary px-4 py-2 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Import SQL
            </button>
          </div>
        )}

        {/* Status message */}
        {message && (
          <div className={`mt-4 flex items-center gap-2 rounded border p-3 text-xs ${message.type === 'success' ? 'border-green-500/30 bg-green-500/10 text-green-500' : 'border-red-500/30 bg-red-500/10 text-red-500'}`}>
            {message.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
