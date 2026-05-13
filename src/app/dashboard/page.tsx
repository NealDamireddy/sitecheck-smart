'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { ProjectStatusHeader } from '@/components/dashboard/project-status-header';
import { MetricCard } from '@/components/dashboard/metric-card';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { InspectionPicker } from '@/components/dashboard/inspection-picker';
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  CloudRain,
  Droplets,
  Loader2,
  Route,
  ShieldCheck,
  TrendingUp,
  Waypoints,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/page-transition';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAppMode } from '@/hooks/use-app-mode';
import { useProjectStore } from '@/stores/project-store';
import { useSmartsEventsStore } from '@/stores/smarts-events-store';
import { cn } from '@/lib/utils';
import { checkpoints as staticCheckpoints } from '@/data/checkpoints';
import { inspections as staticInspections } from '@/data/inspections';
import { deficiencies as staticDeficiencies } from '@/data/deficiencies';

const SiteOverviewMap = dynamic(
  () => import('@/components/dashboard/site-overview-map').then((m) => ({ default: m.SiteOverviewMap })),
  {
    ssr: false,
    loading: () => <div className="h-80 animate-pulse rounded-lg bg-muted" />,
  }
);

interface DashboardMetrics {
  totalCheckpoints: number;
  complianceRate: number;
  daysSinceInspection: number | null;
  lastInspectionType: string | null;
  lastInspectionDate: string | null;
  activeDeficiencies: number;
  checkpointsByStatus: { compliant: number; deficient: number; needsReview: number };
  isLinear?: boolean;
  corridorLengthFeet?: number | null;
  corridorLengthMiles?: number | null;
  acreage?: number | null;
  crossingsCount?: number;
  permits?: { active: number; expiring: number; expired: number; total: number };
}

function formatInspectionType(type: string | null): string {
  if (!type) return 'N/A';
  return type
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('-');
}

/**
 * Compute dashboard metrics from static demo data — used as a fallback
 * when /api/dashboard/metrics is unavailable (e.g. in demo mode).
 */
function computeStaticMetrics(): DashboardMetrics {
  const total = staticCheckpoints.length;
  const compliant = staticCheckpoints.filter((c) => c.status === 'compliant').length;
  const deficient = staticCheckpoints.filter((c) => c.status === 'deficient').length;
  const needsReview = staticCheckpoints.filter((c) => c.status === 'needs-review').length;
  const lastInspection = [...staticInspections].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )[0];
  const daysSince = lastInspection
    ? Math.floor((Date.now() - new Date(lastInspection.date).getTime()) / 86_400_000)
    : null;
  return {
    totalCheckpoints: total,
    complianceRate: total > 0 ? Math.round((compliant / total) * 1000) / 10 : 0,
    daysSinceInspection: daysSince,
    lastInspectionType: lastInspection?.type ?? null,
    lastInspectionDate: lastInspection?.date ?? null,
    activeDeficiencies: staticDeficiencies.filter((d) => d.status === 'open').length,
    checkpointsByStatus: { compliant, deficient, needsReview },
  };
}

export default function DashboardPage() {
  const { isApp } = useAppMode();
  const router = useRouter();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const currentProject = useProjectStore((s) => s.currentProject());
  const simulateEvent = useSmartsEventsStore((s) => s.simulate);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState<'forecast' | 'starting' | null>(
    null
  );
  const [simulateError, setSimulateError] = useState<string | null>(null);

  async function handleSimulate(mode: 'forecast' | 'starting') {
    setSimulating(mode);
    setSimulateError(null);
    try {
      const event = await simulateEvent(currentProjectId, mode);
      if (!event) {
        const storeErr = useSmartsEventsStore.getState().error;
        throw new Error(storeErr ?? 'Simulate returned null');
      }
      router.push(`/projects/${currentProjectId}/events/${event.id}/capture`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to simulate event';
      setSimulateError(msg);
      setSimulating(null);
    }
  }

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/metrics?projectId=${currentProjectId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data: DashboardMetrics) => {
        setMetrics(data);
        setLoading(false);
      })
      .catch(() => {
        // Fall back to static demo metrics when the API is unavailable
        setMetrics(computeStaticMetrics());
        setLoading(false);
      });
  }, [currentProjectId]);

  const inspectionSubtitle = metrics?.lastInspectionType && metrics?.lastInspectionDate
    ? `${formatInspectionType(metrics.lastInspectionType)} — ${format(new Date(metrics.lastInspectionDate), 'MMM d, yyyy')}`
    : '';

  return (
    <PageTransition>
    <div className={cn('space-y-6 p-6', isApp && 'space-y-3 p-3')}>
      {/* Page Header */}
      <div>
        <h1 className={cn('font-heading text-2xl font-bold tracking-wide', isApp && 'text-lg')}>Command Dashboard</h1>
        {!isApp && (
          <p className="mt-1 text-sm text-muted-foreground">
            Real-time overview of project compliance and inspection status
          </p>
        )}
      </div>

      {/* Project Status Bar */}
      <ProjectStatusHeader compact={isApp} />

      {/* Inspection-type dropdown — primary entry into the visit flow. */}
      <InspectionPicker />

      {/* Metric Cards */}
      {loading ? (
        <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', isApp && 'grid-cols-2 gap-2')}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', isApp && 'grid-cols-2 gap-2')}>
          <Link href="/checkpoints" className="block hover:ring-1 hover:ring-amber-500/30 rounded-lg transition-all">
            <MetricCard
              title="BMP Checkpoints"
              value={metrics?.totalCheckpoints ?? 0}
              icon={CheckCircle}
              subtitle="Extracted from SWPPP v3.1"
              accentColor="text-amber-500"
              compact={isApp}
            />
          </Link>
          <Link href="/reports" className="block hover:ring-1 hover:ring-amber-500/30 rounded-lg transition-all">
            <MetricCard
              title="Compliance Rate"
              value={metrics?.complianceRate ?? 0}
              suffix="%"
              icon={TrendingUp}
              trend={{ value: 3, positive: true }}
              accentColor="text-green-500"
              compact={isApp}
            />
          </Link>
          <Link href="/missions" className="block hover:ring-1 hover:ring-amber-500/30 rounded-lg transition-all">
            <MetricCard
              title="Days Since Inspection"
              value={metrics?.daysSinceInspection ?? 0}
              icon={Calendar}
              subtitle={inspectionSubtitle}
              accentColor="text-blue-400"
              compact={isApp}
            />
          </Link>
          <Link href="/checkpoints" className="block hover:ring-1 hover:ring-amber-500/30 rounded-lg transition-all">
            <MetricCard
              title="Active Deficiencies"
              value={metrics?.activeDeficiencies ?? 0}
              icon={AlertTriangle}
              subtitle="72-hour correction window active"
              accentColor="text-red-500"
              compact={isApp}
            />
          </Link>
        </div>
      )}

      {/* SMARTS event simulation — demo controls, visually distinct from
          production behavior via dashed border + DEMO badge. */}
      <div className="rounded-lg border-2 border-dashed border-amber-700/50 bg-amber-950/10 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border border-amber-600 bg-amber-700/40 text-[9px] uppercase tracking-wider text-amber-100">
                Demo
              </Badge>
              <h2 className="font-heading text-sm font-semibold text-slate-100">
                SMARTS event simulation
              </h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Persist a simulated rain event for{' '}
              <span className="text-slate-300">
                {currentProject?.name ?? 'this project'}
              </span>
              . Source is set to{' '}
              <code className="rounded bg-slate-950/60 px-1 py-0.5 font-mono text-[10px] text-slate-200">
                simulated
              </code>{' '}
              so it&apos;s distinguishable from real NOAA-detected events.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => handleSimulate('forecast')}
            disabled={simulating !== null}
            className="min-h-[44px] flex-1"
          >
            {simulating === 'forecast' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CloudRain className="mr-2 h-4 w-4" />
            )}
            Simulate forecast event
          </Button>
          <Button
            variant="outline"
            onClick={() => handleSimulate('starting')}
            disabled={simulating !== null}
            className="min-h-[44px] flex-1"
          >
            {simulating === 'starting' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Droplets className="mr-2 h-4 w-4" />
            )}
            Simulate active event
          </Button>
        </div>
        {simulateError && (
          <div className="mt-2 rounded-md border border-red-700 bg-red-900/40 p-2 text-xs text-red-200">
            <AlertTriangle className="mr-1 inline h-3 w-3" />
            {simulateError}
          </div>
        )}
      </div>

      {/* Linear-only metrics row */}
      {metrics?.isLinear && (
        <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-3', isApp && 'grid-cols-3 gap-2')}>
          <MetricCard
            title="Corridor Length"
            value={metrics.corridorLengthMiles ?? 0}
            suffix=" mi"
            decimals={2}
            icon={Route}
            subtitle={
              metrics.corridorLengthFeet != null
                ? `${Math.round(metrics.corridorLengthFeet).toLocaleString()} ft total`
                : 'Centerline length'
            }
            accentColor="text-emerald-400"
            compact={isApp}
          />
          <Link href="/crossings" className="block hover:ring-1 hover:ring-amber-500/30 rounded-lg transition-all">
            <MetricCard
              title="Crossings"
              value={metrics.crossingsCount ?? 0}
              icon={Waypoints}
              subtitle="Streams, roads, utilities, rail, wetlands"
              accentColor="text-cyan-400"
              compact={isApp}
            />
          </Link>
          <MetricCard
            title="Permits"
            value={metrics.permits?.active ?? 0}
            icon={ShieldCheck}
            subtitle={
              metrics.permits
                ? `${metrics.permits.active} active · ${metrics.permits.expiring} expiring · ${metrics.permits.expired} expired`
                : 'No permits tracked'
            }
            accentColor={
              (metrics.permits?.expired ?? 0) > 0
                ? 'text-red-400'
                : (metrics.permits?.expiring ?? 0) > 0
                  ? 'text-amber-400'
                  : 'text-green-400'
            }
            compact={isApp}
          />
        </div>
      )}

      {/* Map + Activity Feed */}
      <div className={cn('grid grid-cols-1 gap-6 lg:grid-cols-3', isApp && 'gap-3')}>
        <div className="lg:col-span-2">
          <SiteOverviewMap />
        </div>
        <div>
          <ActivityFeed />
        </div>
      </div>
    </div>
    </PageTransition>
  );
}
