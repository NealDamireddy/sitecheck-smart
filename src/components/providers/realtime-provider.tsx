'use client';

import { useEffect } from 'react';
import { useNotificationStore } from '@/stores/notification-store';
import { useCheckpointStore } from '@/stores/checkpoint-store';

/**
 * Centralized Supabase Realtime subscription manager.
 * Subscribes to notifications and checkpoints tables on mount,
 * and cleans up subscriptions on unmount.
 */
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let unsubNotifications: (() => void) | undefined;
    let unsubCheckpoints: (() => void) | undefined;

    try {
      unsubNotifications = useNotificationStore.getState().subscribeRealtime();
      unsubCheckpoints = useCheckpointStore.getState().subscribeRealtime();
    } catch (err) {
      console.warn('Realtime subscriptions failed:', err);
    }

    return () => {
      unsubNotifications?.();
      unsubCheckpoints?.();
    };
  }, []);

  return <>{children}</>;
}
