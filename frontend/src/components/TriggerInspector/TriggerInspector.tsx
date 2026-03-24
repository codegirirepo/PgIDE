import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { RefreshCw, Loader2, Zap, ChevronDown } from 'lucide-react';
import ConnectionPicker from '@/components/shared/ConnectionPicker';
import { useConnectionId } from '@/hooks/useConnectionId';

export default function TriggerInspector() {
  const [connId, setConnId] = useConnectionId();
  const [data, setData] = useState<{ triggers: any[]; rules: any[] }>({ triggers: [], rules: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [schema, setSchema] = useState('public');
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tab, setTab] = useState<'triggers' | 'rules'>('triggers');
  const [expandedDef, setExpandedDef] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!connId) return;
    setLoading(true); setError('');
    try {
      const [d, s] = await Promise.all([api.getTriggers(connId, schema), api.getSchemas(connId)]);
      setData(d);
      setSchemas(s.map((x: any) => x.name));
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  }, [connId, schema]);

  useEffect(() => { load(); }, [load]);

  if (!connId) return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Connect to a database first</div>;

  const enabledLabel = (e: string) => {
    if (e === 'O') return <span className="text-green-500">Enabled</span>;
    if (e === 'D') return <span className="text-destructive">Disabled</span>;
    if (e === 'R') return <span className="text-yellow-500">Replica</span>;
    if (e === 'A') return <span className="text-blue-500">Always</span>;
    return e;
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0">
        <Zap className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">Triggers & Rules</span>
        <ConnectionPicker value={connId} onChange={setConnId} />
        <div className="flex gap-1 ml-2">
          {(['triggers', 'rules'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded px-2 py-0.5 text-xs capitalize ${tab === t ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              {t} ({t === 'triggers' ? data.triggers.length : data.rules.length})
            </button>
          ))}
        </div>
        <select value={schema} onChange={e => setSchema(e.target.value)} className="ml-2 h-6 rounded border px-1 text-xs bg-background">
          {schemas.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent ml-auto">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {error && <div className="px-3 py-1 text-xs text-destructive">{error}</div>}
      <div className="flex-1 overflow-auto min-h-0">
        {tab === 'triggers' ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b">
              <tr>
                {['Name','Table','Timing','Events','Function','Status','Definition'].map(h =>
                  <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.triggers.map(t => (
                <tr key={t.name + t.table} className="border-b hover:bg-accent/50 align-top">
                  <td className="px-2 py-1 font-medium">{t.name}</td>
                  <td className="px-2 py-1">{t.table}</td>
                  <td className="px-2 py-1">{t.timing}</td>
                  <td className="px-2 py-1">{t.events?.join(', ')}</td>
                  <td className="px-2 py-1 font-mono">{t.function_name}</td>
                  <td className="px-2 py-1">{enabledLabel(t.enabled)}</td>
                  <td className="px-2 py-1">
                    <button onClick={() => setExpandedDef(expandedDef === t.name ? null : t.name)}
                      className="flex items-center gap-1 text-primary hover:underline">
                      <ChevronDown className={`h-3 w-3 transition-transform ${expandedDef === t.name ? '' : '-rotate-90'}`} /> Show
                    </button>
                    {expandedDef === t.name && (
                      <pre className="mt-1 p-2 rounded bg-accent/50 text-[10px] whitespace-pre-wrap max-w-[500px]">{t.definition}</pre>
                    )}
                  </td>
                </tr>
              ))}
              {data.triggers.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">No triggers in schema "{schema}"</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card border-b">
              <tr>
                {['Name','Table','Definition'].map(h =>
                  <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground">{h}</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.rules.map(r => (
                <tr key={r.name + r.table} className="border-b hover:bg-accent/50 align-top">
                  <td className="px-2 py-1 font-medium">{r.name}</td>
                  <td className="px-2 py-1">{r.table}</td>
                  <td className="px-2 py-1">
                    <pre className="p-1 rounded bg-accent/50 text-[10px] whitespace-pre-wrap max-w-[600px]">{r.definition}</pre>
                  </td>
                </tr>
              ))}
              {data.rules.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">No rules in schema "{schema}"</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
