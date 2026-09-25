'use client';

import { useEffect, useState } from 'react';

/** True once `active` has stayed true for `delayMs`. */
export function useSlow(active: boolean, delayMs = 4_000): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);
  return slow;
}
