import { create } from 'zustand';
import { createClient } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface Notification {
  id: string;
  type: 'alert' | 'warning' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
}

// Transform snake_case DB row to camelCase Notification
function transformNotification(row: Record<string, unknown>): Notification {
  return {
    id: row.id as string,
    type: row.type as Notification['type'],
    title: row.title as string,
    message: row.message as string,
    timestamp: row.timestamp as string,
    read: row.read as boolean,
    link: row.link as string | undefined,
  };
}

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  addNotification: (notification: Notification) => void;
  subscribeRealtime: () => () => void;
}

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  loading: false,
  fetchNotifications: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      const res = await fetch('/api/notifications');
      if (!res.ok) throw new Error('Failed to fetch notifications');
      const json = await res.json();
      // API returns { notifications: [...], unreadCount: N }
      const notifications: Notification[] = json.notifications || [];
      const unreadCount: number = json.unreadCount ?? notifications.filter((n) => !n.read).length;
      set({ notifications, unreadCount, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  markAsRead: async (id) => {
    // Optimistic update
    set((state) => {
      const notifications = state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return { notifications, unreadCount: notifications.filter((n) => !n.read).length };
    });
    // Persist to database
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
    } catch {
      // Revert on failure
      get().fetchNotifications();
    }
  },
  markAllAsRead: async () => {
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
    // Mark all as read on server
    try {
      const promises = get().notifications
        .filter((n) => !n.read)
        .map((n) => fetch(`/api/notifications/${n.id}/read`, { method: 'POST' }));
      await Promise.all(promises);
    } catch {
      get().fetchNotifications();
    }
  },
  addNotification: (notification) =>
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.read ? 0 : 1),
    })),

  subscribeRealtime: () => {
    try {
      const supabase = createClient();

      const channel = supabase
        .channel('notifications-realtime')
        .on(
          'postgres_changes' as 'system',
          { event: 'INSERT', schema: 'public', table: 'notifications' },
          (payload: { new: Record<string, unknown> }) => {
            const notification = transformNotification(payload.new);
            const existing = get().notifications.find((n) => n.id === notification.id);
            if (!existing) {
              set((state) => ({
                notifications: [notification, ...state.notifications],
                unreadCount: state.unreadCount + (notification.read ? 0 : 1),
              }));
            }
          }
        )
        .on(
          'postgres_changes' as 'system',
          { event: 'UPDATE', schema: 'public', table: 'notifications' },
          (payload: { new: Record<string, unknown> }) => {
            const updated = transformNotification(payload.new);
            set((state) => {
              const notifications = state.notifications.map((n) =>
                n.id === updated.id ? updated : n
              );
              return {
                notifications,
                unreadCount: notifications.filter((n) => !n.read).length,
              };
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    } catch (err) {
      console.warn('Notification realtime subscription failed:', err);
      return () => {};
    }
  },
}));
