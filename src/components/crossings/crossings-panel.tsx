'use client';

import { useEffect, useMemo, useState } from 'react';
import { useProjectStore } from '@/stores/project-store';
import { useCrossingsStore } from '@/stores/crossings-store';
import {
  CROSSING_TYPE_LABELS,
  CROSSING_TYPE_ICONS,
  CROSSING_STATUS_LABELS,
  CROSSING_STATUS_COLORS,
} from '@/types/crossing';
import type { Crossing } from '@/types/crossing';
import { CrossingForm } from './crossing-form';

const EMPTY_CROSSINGS: Crossing[] = [];

interface CrossingsPanelProps {
  /** When true, render compact list (no header). Useful for embedding inside other panels. */
  compact?: boolean;
}

export function CrossingsPanel({ compact = false }: CrossingsPanelProps) {
  const project = useProjectStore((s) => s.currentProject());
  const projectId = useProjectStore((s) => s.currentProjectId);
  // Select raw value (stable ref) and default outside the selector — see error #185.
  const crossingsForProject = useCrossingsStore((s) => s.crossingsByProject[projectId]);
  const crossings = crossingsForProject ?? EMPTY_CROSSINGS;
  const loading = useCrossingsStore((s) => s.loading);
  const fetchCrossings = useCrossingsStore((s) => s.fetchCrossings);

  const [editing, setEditing] = useState<Crossing | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (project?.projectType === 'linear' && projectId) {
      fetchCrossings(projectId);
    }
  }, [project?.projectType, projectId, fetchCrossings]);

  // Group crossings by segment
  const grouped = useMemo(() => {
    const byId: Record<string, Crossing[]> = {};
    for (const c of crossings) {
      const key = c.segmentId ?? '__unassigned';
      if (!byId[key]) byId[key] = [];
      byId[key].push(c);
    }
    // Sort each group by station number
    for (const key in byId) {
      byId[key].sort((a, b) => (a.stationNumber ?? 0) - (b.stationNumber ?? 0));
    }
    return byId;
  }, [crossings]);

  if (project?.projectType !== 'linear') {
    return null;
  }

  const segments = project.segments ?? [];

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {!compact && (
        <div className="border-b border-border px-4 py-3 flex items-center justify-between">
          <div>
            <h3 className="font-heading text-sm font-semibold tracking-wide">Crossings</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {crossings.length} crossing{crossings.length !== 1 ? 's' : ''} along this corridor
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors"
          >
            + Add Crossing
          </button>
        </div>
      )}

      <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
        {loading && (
          <div className="p-6 text-center text-xs text-muted-foreground">Loading crossings…</div>
        )}

        {!loading && crossings.length === 0 && (
          <div className="p-6 text-center text-xs text-muted-foreground">
            No crossings yet. Add the first crossing for this corridor.
          </div>
        )}

        {segments.map((seg) => {
          const segCrossings = grouped[seg.id] ?? [];
          if (segCrossings.length === 0) return null;
          return (
            <div key={seg.id}>
              <div className="bg-elevated px-4 py-2 sticky top-0 z-10">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {seg.name}
                </p>
              </div>
              {segCrossings.map((c) => (
                <CrossingRow
                  key={c.id}
                  crossing={c}
                  onEdit={() => {
                    setEditing(c);
                    setShowForm(true);
                  }}
                />
              ))}
            </div>
          );
        })}

        {grouped.__unassigned && grouped.__unassigned.length > 0 && (
          <div>
            <div className="bg-elevated px-4 py-2 sticky top-0 z-10">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Unassigned
              </p>
            </div>
            {grouped.__unassigned.map((c) => (
              <CrossingRow
                key={c.id}
                crossing={c}
                onEdit={() => {
                  setEditing(c);
                  setShowForm(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <CrossingForm
          crossing={editing}
          projectId={projectId}
          segments={segments}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CrossingRow({ crossing, onEdit }: { crossing: Crossing; onEdit: () => void }) {
  const statusColor = CROSSING_STATUS_COLORS[crossing.status];
  return (
    <button
      type="button"
      onClick={onEdit}
      className="w-full text-left px-4 py-3 hover:bg-elevated/50 transition-colors flex items-start gap-3"
    >
      <span className="text-lg leading-none mt-0.5">{CROSSING_TYPE_ICONS[crossing.crossingType]}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">{crossing.name}</p>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none border ${statusColor.bg} ${statusColor.text} ${statusColor.border}`}
          >
            {CROSSING_STATUS_LABELS[crossing.status]}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>{CROSSING_TYPE_LABELS[crossing.crossingType]}</span>
          {crossing.stationLabel && (
            <>
              <span>·</span>
              <span className="font-mono">{crossing.stationLabel}</span>
            </>
          )}
        </div>
        {crossing.permitsRequired.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {crossing.permitsRequired.map((p) => (
              <span
                key={p}
                className="inline-flex items-center rounded border border-border bg-elevated px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
              >
                {p}
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
