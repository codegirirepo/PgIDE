import { useAppStore } from '@/store/useAppStore';
import { Database } from 'lucide-react';

interface Props {
  value: string | null;
  onChange: (id: string) => void;
  className?: string;
}

export default function ConnectionPicker({ value, onChange, className = '' }: Props) {
  const connected = useAppStore(s => s.connections.filter(c => c.connected));

  if (connected.length <= 1) return null;

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Database className="h-3 w-3 text-muted-foreground shrink-0" />
      <select
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        className="h-6 rounded border px-1 text-xs bg-background truncate max-w-[180px]"
      >
        {connected.map(c => (
          <option key={c.id} value={c.id}>{c.name} ({c.database})</option>
        ))}
      </select>
    </div>
  );
}
