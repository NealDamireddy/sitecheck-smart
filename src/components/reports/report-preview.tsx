'use client';

import { useEffect } from 'react';
import { useReportStore } from '@/stores/report-store';
import { useProjectStore } from '@/stores/project-store';
import { EditableSection } from '@/components/reports/editable-section';
import { SignatureBlock } from '@/components/reports/signature-block';

export function ReportPreview() {
  const { sections, setSections, updateSection, signed, signedBy, signedDate, sign, unsign, loading, generateReport } =
    useReportStore();
  const currentProject = useProjectStore((s) => s.currentProject());
  const isLinear = currentProject?.projectType === 'linear';
  const reportTitle = isLinear ? 'Corridor Inspection Report' : 'Site Inspection Report';
  const projectDisplayName = currentProject?.name ?? 'Riverside Commercial — Phase 2';

  useEffect(() => {
    if (sections.length === 0) {
      generateReport();
    }
  }, [sections.length, generateReport]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-[800px]">
        <div className="rounded-sm border border-black/10 shadow-2xl p-10 text-center" style={{ backgroundColor: '#F5F5F0' }}>
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-amber-500 border-t-transparent" />
          <p className="mt-4 text-sm text-neutral-500">Generating report...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[800px]">
      {/* Paper-on-dark styling */}
      <div
        className="rounded-sm border border-black/10 shadow-2xl"
        style={{ backgroundColor: '#F5F5F0' }}
      >
        {/* Report Header */}
        <div className="border-b border-neutral-300 px-4 py-6 sm:px-10 sm:py-8">
          <div className="text-center">
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-400">
              California Construction General Permit
            </p>
            <h1 className="mt-2 text-xl font-bold tracking-wide text-neutral-800">
              {reportTitle}
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {projectDisplayName}
            </p>
            <div className="mx-auto mt-3 h-px w-24 bg-neutral-300" />
            <p className="mt-2 text-xs text-neutral-400">
              Report ID: RPT-2026-03-28-001
            </p>
          </div>
        </div>

        {/* Sections */}
        <div className="px-4 py-6 sm:px-10 sm:py-8">
          {sections.map((section) => (
            <EditableSection
              key={section.id}
              section={section}
              onSave={(content) => updateSection(section.id, content)}
            />
          ))}
        </div>

        {/* Signature Block */}
        <div className="border-t border-neutral-300 px-4 py-6 sm:px-10 sm:py-8">
          <SignatureBlock
            signed={signed}
            signedBy={signedBy}
            signedDate={signedDate}
            onSign={sign}
            onUnsign={unsign}
          />
        </div>
      </div>
    </div>
  );
}
