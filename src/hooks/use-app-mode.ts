import { useViewModeStore } from '@/stores/view-mode-store';

export function useAppMode() {
  const viewMode = useViewModeStore((s) => s.viewMode);
  return { isApp: viewMode === 'app' };
}
