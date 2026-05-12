'use client';

import { Camera, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { Waypoint } from '@/types/drone';

interface CaptureTimelineProps {
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  onSelectWaypoint: (index: number) => void;
}

const COMPLETED_STATUSES = new Set([
  'captured',
  'compliant',
  'deficient',
  'needs-maintenance',
  'not-visible',
  'blocked',
  'unsafe',
  'ground-follow-up',
]);

function isDeficient(status: string): boolean {
  return status === 'deficient' || status === 'unsafe';
}

export function CaptureTimeline({
  waypoints,
  currentWaypointIndex,
  onSelectWaypoint,
}: CaptureTimelineProps) {
  return (
    <Card className="border-border bg-surface">
      <CardContent className="pt-4">
        <p className="text-xs font-medium text-foreground mb-3">Capture Timeline</p>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
          {waypoints.map((wp, idx) => {
            const isCurrent = idx === currentWaypointIndex;
            const hasCapture = COMPLETED_STATUSES.has(wp.captureStatus);
            const hasPhoto = !!wp.photo;
            const isDeficientWp = isDeficient(wp.captureStatus);

            return (
              <button
                key={wp.number}
                onClick={() => onSelectWaypoint(idx)}
                className={cn(
                  'relative flex-shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden transition-all',
                  'focus:outline-none focus:ring-2 focus:ring-amber-500/50',
                  isCurrent
                    ? 'border-amber-500 ring-2 ring-amber-500/30 animate-pulse'
                    : hasCapture
                      ? isDeficientWp
                        ? 'border-red-500/50'
                        : 'border-green-500/50'
                      : 'border-border hover:border-muted-foreground/50'
                )}
              >
                {/* Background: photo thumbnail or placeholder */}
                {hasPhoto ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${wp.photo})` }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                    <Camera className={cn(
                      'h-4 w-4',
                      isCurrent ? 'text-amber-400' : 'text-muted-foreground/50'
                    )} />
                  </div>
                )}

                {/* Waypoint number badge */}
                <span className="absolute top-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] font-mono text-white">
                  {wp.number}
                </span>

                {/* Status overlay */}
                {hasCapture && (
                  <span className={cn(
                    'absolute bottom-0.5 right-0.5 rounded-full p-0.5',
                    isDeficientWp ? 'bg-red-500' : 'bg-green-500'
                  )}>
                    {isDeficientWp ? (
                      <X className="h-2 w-2 text-white" />
                    ) : (
                      <Check className="h-2 w-2 text-white" />
                    )}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Summary */}
        <div className="flex items-center justify-between mt-2">
          <p className="text-[10px] text-muted-foreground">
            {waypoints.filter((wp) => COMPLETED_STATUSES.has(wp.captureStatus)).length} of{' '}
            {waypoints.length} captured
          </p>
          <p className="text-[10px] text-muted-foreground">
            WP #{waypoints[currentWaypointIndex]?.number ?? '—'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
