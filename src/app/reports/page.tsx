'use client';

import { SectionHeader } from '@/components/shared/section-header';
import { ReportPreview } from '@/components/reports/report-preview';
import { ExportControls } from '@/components/reports/export-controls';
import { PageTransition } from '@/components/shared/page-transition';
import { useAppMode } from '@/hooks/use-app-mode';
import { cn } from '@/lib/utils';

export default function ReportsPage() {
  const { isApp } = useAppMode();

  return (
    <PageTransition>
    <div className={cn('flex flex-col gap-4 p-4', isApp && 'gap-3 p-3')}>
      <div className={cn(
        'flex flex-col gap-3',
        isApp ? 'flex-col gap-2' : 'sm:flex-row sm:items-center sm:justify-between'
      )}>
        <SectionHeader
          title="Report Generator"
          description="CGP-compliant inspection report with AI-generated content"
        />
        <ExportControls />
      </div>

      <ReportPreview />
    </div>
    </PageTransition>
  );
}
