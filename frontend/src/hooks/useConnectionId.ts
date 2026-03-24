import { useState } from 'react';
import { useAppStore } from '@/store/useAppStore';

/**
 * Returns a stable [connId, setConnId].
 * Reads the effective connection once on mount. User can override via ConnectionPicker.
 */
export function useConnectionId() {
  const [connId, setConnId] = useState<string | null>(
    () => useAppStore.getState().getEffectiveConnectionId()
  );
  return [connId, setConnId] as const;
}
