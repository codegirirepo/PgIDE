import { useState, useEffect, useRef } from 'react';
import { api } from '@/services/api';
import { useAppStore } from '@/store/useAppStore';
import type { ERTable, ERRelationship } from '@/types';
import { Network, RefreshCw, Loader2, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

const TABLE_W = 200;
const COL_H = 18;
const HEADER_H = 28;
const PAD = 40;

export default function ERDiagram() {
  const connId = useAppStore(s => s.activeConnectionId);
  const [tables, setTables] = useState<ERTable[]>([]);
  const [rels, setRels] = useState<ERRelationship[]>([]);
  const [loading, setLoading] = useState(false);
  const [schema, setSchema] = useState('public');
  const [schemas, setSchemas] = useState<string[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (connId) api.getSchemas(connId).then(s => setSchemas(s.map(x => x.name))).catch(() => {});
  }, [connId]);

  const load = async () => {
    if (!connId) return;
    setLoading(true);
    try {
      const data = await api.getERDiagram(connId, schema);
      setTables(data.tables);
      setRels(data.relationships);
      // Auto-layout in grid
      const cols = Math.ceil(Math.sqrt(data.tables.length));
      const pos: Record<string, { x: number; y: number }> = {};
      data.tables.forEach((t, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const h = HEADER_H + t.columns.length * COL_H + 10;
        pos[t.name] = { x: col * (TABLE_W + PAD * 2) + PAD, y: row * (Math.max(h, 100) + PAD) + PAD };
      });
      setPositions(pos);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, [connId, schema]);

  const getTableHeight = (t: ERTable) => HEADER_H + t.columns.length * COL_H + 10;

  const handleMouseDown = (tableName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDragging(tableName);
    const pos = positions[tableName] || { x: 0, y: 0 };
    dragStart.current = { x: e.clientX / zoom - pos.x, y: e.clientY / zoom - pos.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPositions(p => ({
      ...p,
      [dragging]: { x: e.clientX / zoom - dragStart.current.x, y: e.clientY / zoom - dragStart.current.y },
    }));
  };

  const handleMouseUp = () => setDragging(null);

  const highlightedTables = new Set<string>();
  if (highlight) {
    highlightedTables.add(highlight);
    rels.forEach(r => {
      if (r.source_table === highlight) highlightedTables.add(r.target_table);
      if (r.target_table === highlight) highlightedTables.add(r.source_table);
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 border-b px-3 py-2 shrink-0 flex-wrap">
        <Network className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">ER Diagram</span>
        <select value={schema} onChange={e => setSchema(e.target.value)} className="h-7 rounded border bg-background px-2 text-xs">
          {schemas.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={load} disabled={loading} className="rounded p-1 hover:bg-accent">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setZoom(z => Math.max(0.3, z - 0.1))} className="rounded p-1 hover:bg-accent"><ZoomOut className="h-4 w-4" /></button>
          <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom(z => Math.min(2, z + 0.1))} className="rounded p-1 hover:bg-accent"><ZoomIn className="h-4 w-4" /></button>
          <button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded p-1 hover:bg-accent"><Maximize2 className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-muted/30" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        <svg
          ref={svgRef}
          width="100%" height="100%"
          style={{ cursor: dragging ? 'grabbing' : 'default' }}
        >
          <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
            {/* Relationship lines */}
            {rels.map((r, i) => {
              const sp = positions[r.source_table];
              const tp = positions[r.target_table];
              if (!sp || !tp) return null;
              const st = tables.find(t => t.name === r.source_table);
              const tt = tables.find(t => t.name === r.target_table);
              if (!st || !tt) return null;

              const sx = sp.x + TABLE_W;
              const sy = sp.y + HEADER_H + (st.columns.findIndex(c => c.column_name === r.source_column)) * COL_H + COL_H / 2;
              const tx = tp.x;
              const ty = tp.y + HEADER_H + (tt.columns.findIndex(c => c.column_name === r.target_column)) * COL_H + COL_H / 2;
              const mx = (sx + tx) / 2;

              const isHighlighted = highlight && (highlightedTables.has(r.source_table) && highlightedTables.has(r.target_table));
              return (
                <path
                  key={i}
                  d={`M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`}
                  fill="none"
                  stroke={isHighlighted ? 'hsl(217, 91%, 60%)' : 'hsl(var(--muted-foreground) / 0.3)'}
                  strokeWidth={isHighlighted ? 2 : 1}
                  markerEnd="url(#arrow)"
                />
              );
            })}

            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground) / 0.5)" />
              </marker>
            </defs>

            {/* Tables */}
            {tables.map(t => {
              const pos = positions[t.name] || { x: 0, y: 0 };
              const h = getTableHeight(t);
              const isHl = !highlight || highlightedTables.has(t.name);
              return (
                <g
                  key={t.name}
                  transform={`translate(${pos.x},${pos.y})`}
                  onMouseDown={e => handleMouseDown(t.name, e)}
                  onClick={() => setHighlight(h => h === t.name ? null : t.name)}
                  style={{ cursor: 'grab', opacity: isHl ? 1 : 0.3 }}
                >
                  <rect width={TABLE_W} height={h} rx={4} fill="hsl(var(--card))" stroke={highlight === t.name ? 'hsl(217, 91%, 60%)' : 'hsl(var(--border))'} strokeWidth={highlight === t.name ? 2 : 1} />
                  <rect width={TABLE_W} height={HEADER_H} rx={4} fill="hsl(var(--primary))" />
                  <rect y={HEADER_H - 4} width={TABLE_W} height={4} fill="hsl(var(--primary))" />
                  <text x={TABLE_W / 2} y={18} textAnchor="middle" fill="hsl(var(--primary-foreground))" fontSize={11} fontWeight="bold">{t.name}</text>
                  {t.columns.map((c, ci) => (
                    <g key={c.column_name} transform={`translate(0,${HEADER_H + ci * COL_H})`}>
                      <text x={8} y={13} fontSize={10} fill={c.is_pk ? 'hsl(45, 93%, 47%)' : 'hsl(var(--foreground))'}>
                        {c.is_pk ? '🔑 ' : '   '}{c.column_name}
                      </text>
                      <text x={TABLE_W - 8} y={13} textAnchor="end" fontSize={9} fill="hsl(var(--muted-foreground))">{c.data_type}</text>
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
