'use client';

import { useEffect, useState } from 'react';
import { isDemoSession } from '@/lib/demo/start-demo';
import { useDemoTourStore } from '@/stores/demo-tour-store';

/**
 * Returns whether the current browser is in a demo session, based on the
 * `sitecheck_demo` cookie OR an active demo tour. Used by the TopBar to
 * conditionally render the "Exit Demo" pill.
 *
 * Reads cookie inside an effect (avoids SSR / hydration mismatch).
 */
export function useDemoSession(): { inDemo: boolean } {
  const tourActive = useDemoTourStore((s) => s.active);
  const [hasCookie, setHasCookie] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read cookie post-mount to avoid SSR mismatch
    setHasCookie(isDemoSession());
  }, []);

  return { inDemo: hasCookie || tourActive };
}
