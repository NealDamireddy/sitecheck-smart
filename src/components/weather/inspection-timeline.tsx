'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { INSPECTION_TYPE_LABELS } from '@/lib/constants';
import type { InspectionType } from '@/types/drone';
import { inspections as staticInspections } from '@/data/inspections';

const typeColors: Record<InspectionType, { bg: string; border: string; text: string; dot: string }> = {
  routine: {
    bg: 'bg-blue-500/10',
    border: 'border-blue-500',
    text: 'text-blue-400',
    dot: 'bg-blue-500',
  },
  'pre-storm': {
    bg: 'bg-amber-500/10',
    border: 'border-amber-500',
    text: 'text-amber-400',
    dot: 'bg-amber-500',
  },
  'post-storm': {
    bg: 'bg-green-500/10',
    border: 'border-green-500',
    text: 'text-green-400',
    dot: 'bg-green-500',
  },
  qpe: {
    bg: 'bg-red-500/10',
    border: 'border-red-500',
    text: 'text-red-400',
    dot: 'bg-red-500',
  },
};

export function InspectionTimeline() {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/inspections')
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setInspections(Array.isArray(data) ? data : staticInspections);
        setLoading(false);
      })
      .catch(() => {
        setInspections(staticInspections);
        setLoading(false);
      });
  }, []);

  const latestId = inspections[inspections.length - 1]?.id;

  if (loading) {
    return (
      <Card className="border-border bg-surface">
        <CardHeader>
          <CardTitle className="text-foreground">Inspection Timeline</CardTitle>
          <CardDescription>
            History of site inspections with compliance tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-32 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-surface">
      <CardHeader>
        <CardTitle className="text-foreground">Inspection Timeline</CardTitle>
        <CardDescription>
          History of site inspections with compliance tracking
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="relative flex items-start gap-0 pb-4 pt-2" style={{ minWidth: `${inspections.length * 160}px` }}>
            {/* Connecting line */}
            <div className="absolute top-[26px] left-[40px] right-[40px] h-0.5 bg-[#2A2A2A]" />

            {inspections.map((inspection, index) => {
              const colors = typeColors[inspection.type as InspectionType];
              const isLatest = inspection.id === latestId;
              const isHovered = hoveredId === inspection.id;

              return (
                <div
                  key={inspection.id}
                  className="relative flex flex-1 flex-col items-center"
                  style={{ minWidth: '140px' }}
                  onMouseEnter={() => setHoveredId(inspection.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {/* Dot */}
                  <div
                    className={`relative z-10 flex h-[18px] w-[18px] items-center justify-center rounded-full border-2 transition-all ${colors.border} ${
                      isLatest
                        ? `${colors.dot} ring-4 ring-amber-500/20`
                        : `bg-[#0A0A0A]`
                    } ${isHovered ? 'scale-125' : ''}`}
                  >
                    {isLatest && (
                      <span className="absolute h-full w-full animate-ping rounded-full bg-amber-500/30" />
                    )}
                    <span className={`h-2 w-2 rounded-full ${colors.dot}`} />
                  </div>

                  {/* Info below */}
                  <div className="mt-3 flex flex-col items-center text-center">
                    <span className="text-[11px] font-medium text-foreground">
                      {format(new Date(inspection.date), 'MMM d')}
                    </span>
                    <span
                      className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}
                    >
                      {INSPECTION_TYPE_LABELS[inspection.type as InspectionType]}
                    </span>
                    <span
                      className={`mt-1.5 font-heading text-sm font-bold ${
                        inspection.overallCompliance >= 95
                          ? 'text-green-400'
                          : inspection.overallCompliance >= 85
                            ? 'text-amber-400'
                            : 'text-red-400'
                      }`}
                    >
                      {inspection.overallCompliance}%
                    </span>
                    {isLatest && (
                      <span className="mt-1 text-[9px] font-semibold uppercase tracking-wider text-amber-500">
                        Latest
                      </span>
                    )}
                  </div>

                  {/* Tooltip on hover */}
                  {isHovered && (
                    <div className="absolute top-full mt-16 z-20 w-48 rounded-lg border border-[#2A2A2A] bg-[#1C1C1C] p-3 shadow-xl">
                      <p className="text-xs font-medium text-foreground">{inspection.id}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {format(new Date(inspection.date), 'MMM d, yyyy h:mm a')}
                      </p>
                      <div className="mt-2 space-y-1 border-t border-[#2A2A2A] pt-2">
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Inspector</span>
                          <span className="text-foreground">{inspection.inspector.split(',')[0]}</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Findings</span>
                          <span className="text-foreground">{inspection.findings?.length ?? 0} items</span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Deficient</span>
                          <span className="text-red-400">
                            {inspection.findings?.filter((f: any) => f.status === 'deficient').length ?? 0}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px]">
                          <span className="text-muted-foreground">Needs Review</span>
                          <span className="text-purple-400">
                            {inspection.findings?.filter((f: any) => f.status === 'needs-review').length ?? 0}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[#2A2A2A] pt-3">
          {(Object.keys(typeColors) as InspectionType[]).map((type) => (
            <div key={type} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className={`h-2.5 w-2.5 rounded-full ${typeColors[type].dot}`} />
              {INSPECTION_TYPE_LABELS[type]}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
