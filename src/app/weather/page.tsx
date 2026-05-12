'use client';

import { SectionHeader } from '@/components/shared/section-header';
import { CurrentConditions } from '@/components/weather/current-conditions';
import { ForecastChart } from '@/components/weather/forecast-chart';
import { PrecipitationEvents } from '@/components/weather/precipitation-events';
import { InspectionTimeline } from '@/components/weather/inspection-timeline';
import { AlertPanel } from '@/components/weather/alert-panel';
import { PageTransition } from '@/components/shared/page-transition';
import { useAppMode } from '@/hooks/use-app-mode';
import { cn } from '@/lib/utils';

export default function WeatherPage() {
  const { isApp } = useAppMode();

  return (
    <PageTransition>
    <div className={cn('flex flex-col gap-4 p-4', isApp && 'gap-3 p-3')}>
      <SectionHeader
        title="Weather & Compliance Monitor"
        description="Real-time weather tracking, QPE monitoring, and inspection scheduling"
      />

      {isApp ? (
        <div className="space-y-3">
          <CurrentConditions />
          <AlertPanel />
          <ForecastChart />
          <PrecipitationEvents />
          <InspectionTimeline />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Left column: Current + Forecast */}
          <div className="space-y-4 lg:col-span-2">
            <CurrentConditions />
            <ForecastChart />
            <InspectionTimeline />
          </div>

          {/* Right column: Alerts + QPE events */}
          <div className="space-y-4">
            <AlertPanel />
            <PrecipitationEvents />
          </div>
        </div>
      )}
    </div>
    </PageTransition>
  );
}
