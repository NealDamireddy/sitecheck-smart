'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { format } from 'date-fns';
import { ProjectStatusHeader } from '@/components/dashboard/project-status-header';
import { RainEventBanner } from '@/components/dashboard/rain-event-banner';
import { MetricCard } from '@/components/dashboard/metric-card';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { CheckCircle, TrendingUp, Calendar, AlertTriangle, Waypoints, ShieldCheck, Route } from 'lucide-react';
import { PageTransition } from '@/components/shared/page-transition';
import { useAppMode } from '@/hooks/use-app-mode';
import { useProjectStore } from '@/stores/project-store';
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
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);

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

      {/* Rain-event banner — auto-checks for QPE events on mount */}
      <RainEventBanner />

      {/* Project Status Bar */}
      <ProjectStatusHeader compact={isApp} />

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
