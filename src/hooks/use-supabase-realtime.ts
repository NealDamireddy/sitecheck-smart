'use client';

import { useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type PostgresChangeEvent = 'INSERT' | 'UPDATE' | 'DELETE';

interface UseSupabaseRealtimeOptions {
  table: string;
  schema?: string;
  event?: PostgresChangeEvent | '*';
  filter?: string;
  onInsert?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onUpdate?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onDelete?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  enabled?: boolean;
}

/**
 * Hook to subscribe to Supabase Realtime Postgres changes on a table.
 * Automatically manages channel subscription lifecycle.
 */
export function useSupabaseRealtime({
  table,
  schema = 'public',
  event = '*',
  filter,
  onInsert,
  onUpdate,
  onDelete,
  onChange,
  enabled = true,
}: UseSupabaseRealtimeOptions) {
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    if (!enabled) return;

    try {
      const supabase = createClient();
      const channelName = `realtime-${table}-${Date.now()}`;

      // Build the channel config
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const channelConfig: Record<string, any> = {
        event,
        schema,
        table,
      };

      if (filter) {
        channelConfig.filter = filter;
      }

      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes' as 'system',
          channelConfig,
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            // Call the general onChange handler
            onChange?.(payload);

            // Call specific event handlers
            switch (payload.eventType) {
              case 'INSERT':
                onInsert?.(payload);
                break;
              case 'UPDATE':
                onUpdate?.(payload);
                break;
              case 'DELETE':
                onDelete?.(payload);
                break;
            }
          }
        )
        .subscribe();

      channelRef.current = channel;

      return () => {
        supabase.removeChannel(channel);
        channelRef.current = null;
      };
    } catch (err) {
      console.warn(`Supabase realtime subscription failed for ${table}:`, err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, schema, event, filter, enabled]);
}
