import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { VQBTableData, AggregateFunction } from '@/services/visualQueryBuilder';
import { X } from 'lucide-react';

interface TableNodeProps {
  label: string;
  columns: { name: string; type: string }[];
  selectedColumns: Record<string, boolean>;
  columnAggregations: Record<string, { function?: AggregateFunction; alias?: string }>;
  onColumnCheck: (col: string, checked: boolean) => void;
  onColumnAgg: (col: string, fn: AggregateFunction | undefined) => void;
  onDelete: () => void;
}

function TableNodeComponent({ data }: NodeProps & { data: TableNodeProps }) {
  return (
    <div className="rounded-lg border bg-card shadow-lg min-w-[220px] max-w-[280px] overflow-visible">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-primary/10 rounded-t-lg">
        <span className="text-xs font-bold text-primary truncate">{data.label}</span>
        <button onClick={data.onDelete} className="text-muted-foreground hover:text-destructive p-0.5">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="max-h-[240px] overflow-y-auto overflow-x-visible">
        {data.columns.map(col => (
          <div key={col.name} className="flex items-center gap-1.5 px-5 py-1.5 hover:bg-accent/30 text-[11px] relative group overflow-visible">
            <Handle
              type="target"
              position={Position.Left}
              id={col.name}
              className="!w-3.5 !h-3.5 !bg-blue-500 !border-2 !border-blue-300 !left-0 hover:!scale-150 !transition-transform !cursor-crosshair"
              title={`Drop here to join ON ${col.name}`}
            />
            <input
              type="checkbox"
              checked={!!data.selectedColumns[col.name]}
              onChange={e => data.onColumnCheck(col.name, e.target.checked)}
              className="h-3 w-3 rounded border-muted-foreground accent-primary"
            />
            <span className="font-medium truncate flex-1">{col.name}</span>
            <span className="text-muted-foreground text-[9px]">{col.type}</span>
            {data.selectedColumns[col.name] && (
              <select
                value={data.columnAggregations[col.name]?.function || ''}
                onChange={e => data.onColumnAgg(col.name, (e.target.value || undefined) as AggregateFunction | undefined)}
                className="bg-background border rounded text-[9px] px-0.5 py-0 w-14 opacity-0 group-hover:opacity-100 transition-opacity"
                title="Aggregate"
              >
                <option value="">—</option>
                <option value="COUNT">COUNT</option>
                <option value="SUM">SUM</option>
                <option value="AVG">AVG</option>
                <option value="MIN">MIN</option>
                <option value="MAX">MAX</option>
              </select>
            )}
            <Handle
              type="source"
              position={Position.Right}
              id={col.name}
              className="!w-3.5 !h-3.5 !bg-green-500 !border-2 !border-green-300 !right-0 hover:!scale-150 !transition-transform !cursor-crosshair"
              title={`Drag from here to join ON ${col.name}`}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(TableNodeComponent);
