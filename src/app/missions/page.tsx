'use client';

import Link from 'next/link';
import { Plane, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/shared/section-header';
import { MissionCard } from '@/components/missions/mission-card';
import { useDroneStore } from '@/stores/drone-store';
import { PageTransition } from '@/components/shared/page-transition';
import { useAppMode } from '@/hooks/use-app-mode';
import { cn } from '@/lib/utils';

export default function MissionsPage() {
  const { isApp } = useAppMode();
  const { missions } = useDroneStore();

  return (
    <PageTransition>
    <div className={cn('flex flex-col gap-4 p-4', isApp && 'gap-3 p-3')}>
      <div className="flex items-start justify-between">
        <SectionHeader
          title="Drone Mission Center"
          description="AI-powered drone survey missions with flight replay and analysis"
        />
        <Link href="/missions/new">
          <Button size="sm" className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" />
            {!isApp && 'New Mission'}
          </Button>
        </Link>
      </div>

      <div className="space-y-4">
        {missions.map((mission) => (
          <Link key={mission.id} href={`/missions/${mission.id}`}>
            <MissionCard mission={mission} />
          </Link>
        ))}
      </div>

      {missions.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Plane className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-sm text-muted-foreground">No missions recorded</p>
        </div>
      )}
    </div>
    </PageTransition>
  );
}
