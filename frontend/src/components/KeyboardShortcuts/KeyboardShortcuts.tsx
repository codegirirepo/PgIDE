import { useState } from 'react';
import { useShortcutStore, formatKeyCombo } from '@/store/useShortcutStore';
import { RotateCcw, Keyboard } from 'lucide-react';

export default function KeyboardShortcuts() {
  const { shortcuts, updateShortcut, resetShortcut, resetAll } = useShortcutStore();
  const [recording, setRecording] = useState<string | null>(null);

  const handleKeyDown = (e: React.KeyboardEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;
    const combo = formatKeyCombo(e.nativeEvent);
    updateShortcut(id, combo);
    setRecording(null);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <Keyboard className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Keyboard Shortcuts</span>
        </div>
        <button onClick={resetAll} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <RotateCcw className="h-3 w-3" /> Reset All
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="space-y-1 max-w-lg">
          {shortcuts.map(s => (
            <div key={s.id} className="flex items-center gap-3 rounded border px-3 py-2 hover:bg-accent/30">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{s.label}</div>
                <div className="text-[10px] text-muted-foreground">{s.description}</div>
              </div>
              <div className="flex items-center gap-1.5">
                {recording === s.id ? (
                  <input
                    autoFocus
                    readOnly
                    placeholder="Press keys..."
                    onKeyDown={e => handleKeyDown(e, s.id)}
                    onBlur={() => setRecording(null)}
                    className="bg-primary/10 border border-primary rounded px-2 py-1 text-xs w-36 text-center animate-pulse"
                  />
                ) : (
                  <button
                    onClick={() => setRecording(s.id)}
                    className={`rounded border px-2 py-1 text-xs font-mono min-w-[100px] text-center hover:border-primary transition-colors ${s.keys !== s.defaultKeys ? 'border-primary/50 bg-primary/5' : ''}`}
                  >
                    {s.keys}
                  </button>
                )}
                {s.keys !== s.defaultKeys && (
                  <button onClick={() => resetShortcut(s.id)} title="Reset to default"
                    className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-accent">
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-4">Click a shortcut to record a new key combination. Changes are saved automatically.</p>
      </div>
    </div>
  );
}
