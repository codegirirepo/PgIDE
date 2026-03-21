import { useState, useEffect } from 'react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import type { ColumnInfo, IndexInfo, ConstraintInfo } from '@/types';
import { Table, Key, Link, Loader2, X } from 'lucide-react';

interface Props {
  connectionId: string;
  schema: string;
  table: string;
  onClose: () => void;
}

export default function TableDesigner({ connectionId, schema, table, onClose }: Props) {
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [indexes, setIndexes] = useState<IndexInfo[]>([]);
  const [constraints, setConstraints] = useState<ConstraintInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'columns' | 'indexes' | 'constraints' | 'ddl'>('columns');
  const [ddl, setDdl] = useState('');
  const updateTab = useAppStore(s => s.updateTab);
  const activeTabId = useAppStore(s => s.activeTabId);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [cols, idx, cons] = await Promise.all([
          api.getColumns(connectionId, schema, table),
          api.getIndexes(connectionId, schema, table),
          api.getConstraints(connectionId, schema, table),
        ]);
        setColumns(cols);
        setIndexes(idx);
        setConstraints(cons);

        // Generate DDL
        const colDefs = cols.map((c: ColumnInfo) => {
          let def = `  "${c.name}" ${c.data_type}`;
          if (c.character_maximum_length) def += `(${c.character_maximum_length})`;
          if (c.is_nullable === 'NO') def += ' NOT NULL';
          if (c.column_default) def += ` DEFAULT ${c.column_default}`;
          return def;
        });
        const pks = cols.filter((c: ColumnInfo) => c.is_primary_key).map((c: ColumnInfo) => `"${c.name}"`);
        if (pks.length) colDefs.push(`  PRIMARY KEY (${pks.join(', ')})`);
        setDdl(`CREATE TABLE "${schema}"."${table}" (\n${colDefs.join(',\n')}\n);`);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    })();
  }, [connectionId, schema, table]);

  const openDdlInEditor = () => {
    if (activeTabId) updateTab(activeTabId, { sql: ddl });
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const Tab = ({ id, label }: { id: typeof activeSection; label: string }) => (
    <button
      onClick={() => setActiveSection(id)}
      className={`px-3 py-1.5 text-xs ${activeSection === id ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <Table className="h-4 w-4" /> {schema}.{table}
        </h3>
        <button onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex border-b">
        <Tab id="columns" label="Columns" />
        <Tab id="indexes" label="Indexes" />
        <Tab id="constraints" label="Constraints" />
        <Tab id="ddl" label="DDL" />
      </div>

      <div className="flex-1 overflow-auto">
        {activeSection === 'columns' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr>
                {['Name', 'Type', 'Nullable', 'Default', 'PK'].map(h => (
                  <th key={h} className="border-b px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {columns.map(c => (
                <tr key={c.name} className="hover:bg-accent/50">
                  <td className="border-b px-3 py-1.5 font-medium">{c.name}</td>
                  <td className="border-b px-3 py-1.5">{c.data_type}{c.character_maximum_length ? `(${c.character_maximum_length})` : ''}</td>
                  <td className="border-b px-3 py-1.5">{c.is_nullable}</td>
                  <td className="border-b px-3 py-1.5 text-muted-foreground">{c.column_default || '—'}</td>
                  <td className="border-b px-3 py-1.5">{c.is_primary_key ? <Key className="h-3 w-3 text-yellow-500" /> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeSection === 'indexes' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr>
                <th className="border-b px-3 py-2 text-left font-medium">Name</th>
                <th className="border-b px-3 py-2 text-left font-medium">Definition</th>
              </tr>
            </thead>
            <tbody>
              {indexes.map(i => (
                <tr key={i.name} className="hover:bg-accent/50">
                  <td className="border-b px-3 py-1.5 font-medium">{i.name}</td>
                  <td className="border-b px-3 py-1.5 font-mono text-muted-foreground">{i.definition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeSection === 'constraints' && (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr>
                {['Name', 'Type', 'Columns', 'References'].map(h => (
                  <th key={h} className="border-b px-3 py-2 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {constraints.map(c => (
                <tr key={c.name} className="hover:bg-accent/50">
                  <td className="border-b px-3 py-1.5 font-medium">{c.name}</td>
                  <td className="border-b px-3 py-1.5">{c.type}</td>
                  <td className="border-b px-3 py-1.5">{c.columns}</td>
                  <td className="border-b px-3 py-1.5 text-muted-foreground">
                    {c.foreign_table ? <span className="flex items-center gap-1"><Link className="h-3 w-3" />{c.foreign_schema}.{c.foreign_table}({c.foreign_columns})</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeSection === 'ddl' && (
          <div className="p-3">
            <pre className="rounded-md bg-muted p-3 text-xs font-mono overflow-auto whitespace-pre-wrap">{ddl}</pre>
            <button onClick={openDdlInEditor} className="mt-2 rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:bg-primary/90">
              Open in Editor
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
