import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/**
 * True after hydration, false during SSR and the first client render.
 *
 * Replacement for the `const [mounted, setMounted] = useState(false);
 * useEffect(() => setMounted(true), [])` pattern — same semantics, no
 * extra render from a setState-in-effect, and hydration-safe by
 * construction (server snapshot is always false).
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
