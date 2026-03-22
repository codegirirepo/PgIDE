import { create } from 'zustand';

export interface ShortcutDef {
  id: string;
  label: string;
  description: string;
  defaultKeys: string;
  keys: string;
  locked?: boolean;
}

const DEFAULT_SHORTCUTS: ShortcutDef[] = [
  { id: 'executeQuery', label: 'Execute Query', description: 'Run the full query in the editor', defaultKeys: 'Ctrl+Enter', keys: 'Ctrl+Enter' },
  { id: 'executeSelection', label: 'Execute Selection', description: 'Run only the selected text', defaultKeys: 'Ctrl+Shift+Enter', keys: 'Ctrl+Shift+Enter' },
  { id: 'newTab', label: 'New Tab', description: 'Open a new query tab', defaultKeys: 'Ctrl+T', keys: 'Ctrl+T' },
  { id: 'closeTab', label: 'Close Tab', description: 'Close the active tab', defaultKeys: 'Ctrl+W', keys: 'Ctrl+W' },
  { id: 'toggleSidebar', label: 'Toggle Sidebar', description: 'Show/hide the sidebar', defaultKeys: 'Ctrl+B', keys: 'Ctrl+B' },
  { id: 'focusEditor', label: 'Focus Editor', description: 'Move focus to the query editor', defaultKeys: 'Ctrl+E', keys: 'Ctrl+E' },
  { id: 'saveBookmark', label: 'Save Bookmark', description: 'Bookmark the current query', defaultKeys: 'Ctrl+D', keys: 'Ctrl+D' },
  { id: 'toggleTheme', label: 'Toggle Theme', description: 'Switch between dark and light theme', defaultKeys: 'Ctrl+Shift+T', keys: 'Ctrl+Shift+T' },
];

function loadShortcuts(): ShortcutDef[] {
  try {
    const saved = localStorage.getItem('pgide-shortcuts');
    if (!saved) return DEFAULT_SHORTCUTS;
    const parsed: Record<string, string> = JSON.parse(saved);
    return DEFAULT_SHORTCUTS.map(s => ({ ...s, keys: parsed[s.id] || s.defaultKeys }));
  } catch { return DEFAULT_SHORTCUTS; }
}

function saveShortcuts(shortcuts: ShortcutDef[]) {
  const map: Record<string, string> = {};
  shortcuts.forEach(s => { map[s.id] = s.keys; });
  localStorage.setItem('pgide-shortcuts', JSON.stringify(map));
}

interface ShortcutState {
  shortcuts: ShortcutDef[];
  updateShortcut: (id: string, keys: string) => void;
  resetShortcut: (id: string) => void;
  resetAll: () => void;
  getKeys: (id: string) => string;
  matchesEvent: (id: string, e: KeyboardEvent) => boolean;
}

function parseKeys(keys: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = keys.split('+').map(p => p.trim().toLowerCase());
  return {
    ctrl: parts.includes('ctrl') || parts.includes('cmd'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: parts.filter(p => !['ctrl', 'cmd', 'shift', 'alt'].includes(p))[0] || '',
  };
}

export const useShortcutStore = create<ShortcutState>((set, get) => ({
  shortcuts: loadShortcuts(),

  updateShortcut: (id, keys) => set(s => {
    const shortcuts = s.shortcuts.map(sc => sc.id === id ? { ...sc, keys } : sc);
    saveShortcuts(shortcuts);
    return { shortcuts };
  }),

  resetShortcut: (id) => set(s => {
    const shortcuts = s.shortcuts.map(sc => sc.id === id ? { ...sc, keys: sc.defaultKeys } : sc);
    saveShortcuts(shortcuts);
    return { shortcuts };
  }),

  resetAll: () => {
    localStorage.removeItem('pgide-shortcuts');
    set({ shortcuts: DEFAULT_SHORTCUTS });
  },

  getKeys: (id) => get().shortcuts.find(s => s.id === id)?.keys || '',

  matchesEvent: (id, e) => {
    const shortcut = get().shortcuts.find(s => s.id === id);
    if (!shortcut) return false;
    const parsed = parseKeys(shortcut.keys);
    const eventKey = e.key === 'Enter' ? 'enter' : e.key.toLowerCase();
    return (
      parsed.ctrl === (e.ctrlKey || e.metaKey) &&
      parsed.shift === e.shiftKey &&
      parsed.alt === e.altKey &&
      parsed.key === eventKey
    );
  },
}));

export function formatKeyCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const key = e.key === ' ' ? 'Space' : e.key.length === 1 ? e.key.toUpperCase() : e.key;
  if (!['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) parts.push(key);
  return parts.join('+');
}
