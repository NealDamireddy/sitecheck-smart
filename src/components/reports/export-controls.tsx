'use client';

import { useState } from 'react';
import { FileDown, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useReportStore } from '@/stores/report-store';
import { useAppMode } from '@/hooks/use-app-mode';
import { cn } from '@/lib/utils';

export function ExportControls() {
  const signed = useReportStore((s) => s.signed);
  const reportId = useReportStore((s) => s.reportId);
  const generateReport = useReportStore((s) => s.generateReport);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isApp } = useAppMode();

  async function handleGeneratePDF() {
    setIsGenerating(true);
    setError(null);
    try {
      // Make sure we have a persisted report row to render from.
      let activeReportId = reportId;
      if (!activeReportId) {
        await generateReport();
        activeReportId = useReportStore.getState().reportId;
      }
      if (!activeReportId) {
        throw new Error('Report could not be created');
      }

      const res = await fetch(`/api/reports/${activeReportId}/pdf`);
      if (!res.ok) {
        throw new Error(`PDF render failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cgp-report-${activeReportId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revocation so Safari has a tick to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error('PDF download failed:', err);
      setError(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className={cn(
      'flex flex-wrap items-center gap-3',
      isApp && 'flex-col items-stretch gap-2'
    )}>
      <Button
        onClick={handleGeneratePDF}
        disabled={!signed || isGenerating}
        className={cn(
          'bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 gap-2',
          isApp && 'w-full'
        )}
      >
        {isGenerating ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileDown className="size-4" />
        )}
        {isGenerating ? 'Generating...' : 'Generate PDF'}
      </Button>

      {!isApp && (
        <Button
          variant="outline"
          disabled
          className="gap-2 opacity-50 cursor-not-allowed"
        >
          <FileSpreadsheet className="size-4" />
          Export for SMARTS
          <Badge className="bg-muted text-muted-foreground text-[9px] px-1.5 py-0 border-0">
            Coming Soon
          </Badge>
        </Button>
      )}

      {!signed && (
        <p className="text-xs text-muted-foreground">
          Sign the report to enable PDF generation
        </p>
      )}

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
