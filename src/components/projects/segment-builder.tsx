'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { ProjectSegment } from '@/types/project';
import { formatStation } from '@/lib/format';

interface SegmentBuilderProps {
  segments: ProjectSegment[];
  onChange: (segments: ProjectSegment[]) => void;
  /** Total corridor length in feet — segments must fit within this */
  totalLength: number;
}

export function SegmentBuilder({ segments, onChange, totalLength }: SegmentBuilderProps) {
  const addSegment = () => {
    const lastEnd = segments.length > 0 ? segments[segments.length - 1].endStation : 0;
    const id = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([
      ...segments,
      {
        id,
        name: `Segment ${segments.length + 1}`,
        startStation: lastEnd,
        endStation: Math.min(lastEnd + Math.round(totalLength / 4), totalLength),
      },
    ]);
  };

  const updateSegment = (idx: number, updates: Partial<ProjectSegment>) => {
    const next = [...segments];
    next[idx] = { ...next[idx], ...updates };
    onChange(next);
  };

  const removeSegment = (idx: number) => {
    onChange(segments.filter((_, i) => i !== idx));
  };

  const autoSplit = (count: number) => {
    if (count < 1) return;
    const segLen = totalLength / count;
    const next: ProjectSegment[] = [];
    for (let i = 0; i < count; i++) {
      next.push({
        id: `seg-${Date.now()}-${i}`,
        name: `Segment ${i + 1}`,
        startStation: Math.round(i * segLen),
        endStation: Math.round((i + 1) * segLen),
      });
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Define named segments for the corridor. Each segment uses station ranges
          (in feet) along the centerline.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => autoSplit(2)}
            className="rounded border border-border bg-elevated px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Auto split: 2
          </button>
          <button
            type="button"
            onClick={() => autoSplit(4)}
            className="rounded border border-border bg-elevated px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            Auto split: 4
          </button>
        </div>
      </div>

      <div className="space-y-2">
        {segments.map((seg, idx) => (
          <div
            key={seg.id}
            className="grid grid-cols-12 gap-2 rounded-md border border-border bg-elevated p-2"
          >
            <input
              type="text"
              value={seg.name}
              onChange={(e) => updateSegment(idx, { name: e.target.value })}
              placeholder="Segment name"
              className="col-span-5 rounded border border-border bg-surface px-2 py-1.5 text-xs focus:border-amber-500/50 focus:outline-none"
            />
            <div className="col-span-3">
              <input
                type="number"
                value={seg.startStation}
                onChange={(e) =>
                  updateSegment(idx, { startStation: Number(e.target.value) || 0 })
                }
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs font-mono focus:border-amber-500/50 focus:outline-none"
              />
              <p className="mt-0.5 text-[9px] text-muted-foreground font-mono">
                {formatStation(seg.startStation)}
              </p>
            </div>
            <div className="col-span-3">
              <input
                type="number"
                value={seg.endStation}
                onChange={(e) =>
                  updateSegment(idx, { endStation: Number(e.target.value) || 0 })
                }
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-xs font-mono focus:border-amber-500/50 focus:outline-none"
              />
              <p className="mt-0.5 text-[9px] text-muted-foreground font-mono">
                {formatStation(seg.endStation)}
              </p>
            </div>
            <button
              type="button"
              onClick={() => removeSegment(idx)}
              className="col-span-1 flex items-center justify-center rounded border border-red-500/40 bg-red-500/10 text-red-300 hover:bg-red-500/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addSegment}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-border bg-elevated/50 px-3 py-2 text-xs text-muted-foreground hover:border-amber-500/40 hover:text-amber-300 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Segment
      </button>
    </div>
  );
}
