'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Plane, AlertTriangle, FileText, CloudRain, CheckCircle, AlertCircle, ChevronRight, ExternalLink } from 'lucide-react';
import { formatRelativeTime } from '@/lib/format';
import { useAppMode } from '@/hooks/use-app-mode';
import { useProjectStore } from '@/stores/project-store';
import { useSupabaseRealtime } from '@/hooks/use-supabase-realtime';
import type { ActivityEvent } from '@/types/activity';
import { ActivityType } from '@/types/activity';
import { activityEvents as staticActivityEvents } from '@/data/activity-events';

// Transform snake_case DB row from realtime to camelCase ActivityEvent
function transformRealtimeActivity(row: Record<string, unknown>): ActivityEvent {
  return {
    id: row.id as string,
    type: row.type as ActivityType,
    title: row.title as string,
    description: row.description as string,
    timestamp: row.timestamp as string,
    severity: row.severity as ActivityEvent['severity'],
    linkedEntityId: row.linked_entity_id as string | undefined,
    linkedEntityType: row.linked_entity_type as string | undefined,
  };
}

// Only return links for entities that have real detail pages
function getDetailHref(event: ActivityEvent): string | null {
  if (event.linkedEntityType && event.linkedEntityId) {
    switch (event.linkedEntityType) {
      case 'checkpoint':
        return `/checkpoints/${event.linkedEntityId}`;
      case 'mission':
        return `/missions/${event.linkedEntityId}`;
    }
  }
  return null;
}

const severityLabels: Record<string, string> = {
  info: 'Info',
  warning: 'Warning',
  critical: 'Critical',
};

const typeLabels: Record<ActivityType, string> = {
  drone: 'Drone Mission',
  inspection: 'Inspection',
  alert: 'Alert',
  weather: 'Weather',
  document: 'Document',
  deficiency: 'Deficiency',
};

const typeIcons: Record<ActivityType, React.ElementType> = {
  drone: Plane,
  inspection: CheckCircle,
  alert: AlertTriangle,
  weather: CloudRain,
  document: FileText,
  deficiency: AlertCircle,
};

const typeColors: Record<ActivityType, string> = {
  drone: 'text-blue-400 bg-blue-400/10',
  inspection: 'text-green-400 bg-green-400/10',
  alert: 'text-amber-400 bg-amber-400/10',
  weather: 'text-cyan-400 bg-cyan-400/10',
  document: 'text-purple-400 bg-purple-400/10',
  deficiency: 'text-red-400 bg-red-400/10',
};

const severityDot: Record<string, string> = {
  info: 'bg-blue-400',
  warning: 'bg-amber-400',
  critical: 'bg-red-400',
};

export function ActivityFeed() {
  const { isApp } = useAppMode();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/activity?projectId=${currentProjectId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setEvents(Array.isArray(data) ? data : staticActivityEvents);
        setLoading(false);
      })
      .catch(() => {
        // Fall back to static demo data on auth/network failure
        setEvents(staticActivityEvents);
        setLoading(false);
      });
  }, [currentProjectId]);

  // Real-time: listen for new activity events
  const handleInsert = useCallback((payload: { new?: Record<string, unknown> }) => {
    if (!payload.new) return;
    const newEvent = transformRealtimeActivity(payload.new);
    setEvents((prev) => {
      // Avoid duplicates
      if (prev.some((e) => e.id === newEvent.id)) return prev;
      return [newEvent, ...prev];
    });
  }, []);

  useSupabaseRealtime({
    table: 'activity_events',
    event: 'INSERT',
    onInsert: handleInsert,
  });

  return (
    <div className="rounded-lg border border-border bg-surface">
      <div className="border-b border-border px-4 py-3">
        <h3 className="font-heading text-sm font-semibold tracking-wide">Activity Feed</h3>
      </div>
      {loading ? (
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : (
      <ScrollArea className={cn(isApp ? 'h-[250px]' : 'h-[400px]')}>
        <div className="space-y-0 divide-y divide-border">
          {events.map((event) => {
            const Icon = typeIcons[event.type];
            const colorClass = typeColors[event.type];
            const isExpanded = expandedId === event.id;
            const detailHref = getDetailHref(event);

            return (
              <div key={event.id}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : event.id)}
                  className="flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-elevated transition-colors cursor-pointer"
                >
                  <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md', colorClass)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-medium text-foreground truncate">{event.title}</p>
                      {event.severity && (
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', severityDot[event.severity])} />
                      )}
                    </div>
                    {!isExpanded && (
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{event.description}</p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground/60">{formatRelativeTime(event.timestamp)}</p>
                  </div>
                  <ChevronRight className={cn(
                    'mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground/50 transition-transform',
                    isExpanded && 'rotate-90'
                  )} />
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 pl-14">
                    <p className="text-xs text-muted-foreground">{event.description}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={cn(
                        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
                        colorClass
                      )}>
                        {typeLabels[event.type]}
                      </span>
                      {event.severity && (
                        <span className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium',
                          event.severity === 'critical' ? 'bg-red-400/10 text-red-400' :
                          event.severity === 'warning' ? 'bg-amber-400/10 text-amber-400' :
                          'bg-blue-400/10 text-blue-400'
                        )}>
                          <span className={cn('h-1 w-1 rounded-full', severityDot[event.severity])} />
                          {severityLabels[event.severity]}
                        </span>
                      )}
                    </div>
                    {detailHref && (
                      <Link
                        href={detailHref}
                        className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-amber-500 hover:text-amber-400 transition-colors"
                      >
                        View Details
                        <ExternalLink className="h-2.5 w-2.5" />
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
      )}
    </div>
  );
}
