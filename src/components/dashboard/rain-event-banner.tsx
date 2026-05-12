'use client';

/**
 * Block 5 — Rain-Event Banner
 *
 * Sticky bar shown on the dashboard whenever a qualifying QPE rain event
 * has been detected for the active project. Color tier escalates as the
 * 48-hour CGP inspection window narrows:
 *
 *   > 24h remaining → emerald  (you have time)
 *   12-24h          → amber    (plan today)
 *   < 12h           → red      (do it now)
 *   overdue         → maroon + AlertOctagon
 *
 * Calls `useRainEventStore.checkRainEvents(projectId)` once per project
 * change. The check is idempotent server-side so re-mount is harmless.
 *
 * Dismissable per-session — clicking the X hides the banner until the
 * page is reloaded. We deliberately don't persist the dismissal because
 * the banner is the QSP's only reminder that they're under a regulatory
 * deadline.
 */

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { CloudRain, AlertOctagon, X, ArrowRight } from 'lucide-react';
import { useRainEventStore } from '@/stores/rain-event-store';
import { useProjectStore } from '@/stores/project-store';

interface CountdownState {
  hoursRemaining: number;
  overdue: boolean;
  formatted: string;
}

function computeCountdown(dueByIso: string): CountdownState {
  const now = Date.now();
  const due = new Date(dueByIso).getTime();
  const diffMs = due - now;
  const hoursRemaining = diffMs / (1000 * 60 * 60);
  const overdue = diffMs <= 0;

  if (overdue) {
    const overdueHours = Math.floor(Math.abs(hoursRemaining));
    return {
      hoursRemaining,
      overdue: true,
      formatted: `${overdueHours}h overdue`,
    };
  }

  if (hoursRemaining < 1) {
    const minutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
    return {
      hoursRemaining,
      overdue: false,
      formatted: `${minutes} min remaining`,
    };
  }

  const wholeHours = Math.floor(hoursRemaining);
  const wholeMinutes = Math.floor((hoursRemaining - wholeHours) * 60);
  return {
    hoursRemaining,
    overdue: false,
    formatted:
      wholeHours >= 24
        ? `${Math.floor(wholeHours / 24)}d ${wholeHours % 24}h remaining`
        : `${wholeHours}h ${wholeMinutes}m remaining`,
  };
}

function tierStyles(countdown: CountdownState) {
  if (countdown.overdue) {
    return {
      bg: 'bg-red-950/80 border-red-700',
      text: 'text-red-100',
      pill: 'bg-red-800/60 text-red-100',
    };
  }
  if (countdown.hoursRemaining < 12) {
    return {
      bg: 'bg-red-900/60 border-red-600',
      text: 'text-red-100',
      pill: 'bg-red-800/60 text-red-100',
    };
  }
  if (countdown.hoursRemaining < 24) {
    return {
      bg: 'bg-amber-900/60 border-amber-600',
      text: 'text-amber-100',
      pill: 'bg-amber-800/60 text-amber-100',
    };
  }
  return {
    bg: 'bg-emerald-900/60 border-emerald-600',
    text: 'text-emerald-100',
    pill: 'bg-emerald-800/60 text-emerald-100',
  };
}

export function RainEventBanner() {
  const projectId = useProjectStore((s) => s.currentProjectId);
  const rainEvent = useRainEventStore((s) => s.rainEventByProject[projectId] ?? null);
  const draftInspection = useRainEventStore(
    (s) => s.draftInspectionByProject[projectId] ?? null
  );
  const dismissed = useRainEventStore((s) =>
    s.dismissedProjectIds.has(projectId)
  );
  const checkRainEvents = useRainEventStore((s) => s.checkRainEvents);
  const dismissForSession = useRainEventStore((s) => s.dismissForSession);

  useEffect(() => {
    if (!projectId) return;
    checkRainEvents(projectId);
  }, [projectId, checkRainEvents]);

  const countdown = useMemo(() => {
    if (!draftInspection?.dueBy) return null;
    return computeCountdown(draftInspection.dueBy);
  }, [draftInspection?.dueBy]);

  // Hide when:
  //  * no rain event detected (no key, no precipitation, etc)
  //  * user dismissed for this session
  //  * draft inspection has been submitted (status flips off `draft`)
  if (!rainEvent || !draftInspection || dismissed) return null;
  if (draftInspection.status === 'submitted') return null;
  if (!countdown) return null;

  const styles = tierStyles(countdown);
  const Icon = countdown.overdue ? AlertOctagon : CloudRain;

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${styles.bg} ${styles.text}`}
      role="alert"
    >
      <div className="flex items-start gap-3 min-w-0">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            <span>
              Rain event detected — {rainEvent.totalPrecipitationInches.toFixed(2)}&quot; on{' '}
              {new Date(rainEvent.startedAt).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles.pill}`}
            >
              {countdown.formatted}
            </span>
          </div>
          <div className="mt-0.5 text-xs opacity-90">
            CGP 2022 requires a post-storm inspection by{' '}
            {new Date(draftInspection.dueBy ?? '').toLocaleString()}.
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          href={`/inspections/${draftInspection.id}`}
          className={`inline-flex items-center gap-1.5 rounded-md border border-current/30 px-3 py-1.5 text-xs font-medium hover:bg-white/10`}
        >
          Open Draft Inspection
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <button
          type="button"
          onClick={() => dismissForSession(projectId)}
          aria-label="Dismiss for session"
          className="rounded-md p-1.5 hover:bg-white/10"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
