'use client';

import { useState, useEffect } from 'react';
import type { Project, ProjectSegment } from '@/types/project';
import { formatStation, parseStation, isStationInRange } from '@/lib/format';

export interface InspectionScope {
  /** 'full' = whole corridor, 'segment' = single segment, 'range' = arbitrary station range */
  mode: 'full' | 'segment' | 'range';
  segmentId?: string;
  stationStart?: number;
  stationEnd?: number;
}

interface InspectionScopePickerProps {
  project: Project;
  value: InspectionScope;
  onChange: (scope: InspectionScope) => void;
}

export function InspectionScopePicker({ project, value, onChange }: InspectionScopePickerProps) {
  const [startInput, setStartInput] = useState('');
  const [endInput, setEndInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value.stationStart != null) setStartInput(formatStation(value.stationStart));
    if (value.stationEnd != null) setEndInput(formatStation(value.stationEnd));
  }, [value.stationStart, value.stationEnd]);

  if (project.projectType !== 'linear' || !project.corridor) {
    return null;
  }

  const segments: ProjectSegment[] = project.segments ?? [];

  const setMode = (mode: InspectionScope['mode']) => {
    onChange({ mode });
    setError(null);
  };

  const handleSegmentChange = (segmentId: string) => {
    const seg = segments.find((s) => s.id === segmentId);
    if (!seg) return;
    onChange({
      mode: 'segment',
      segmentId,
      stationStart: seg.startStation,
      stationEnd: seg.endStation,
    });
  };

  const parseInput = (raw: string): number | null => {
    if (!raw.trim()) return null;
    if (/^STA\s/i.test(raw)) {
      try {
        return parseStation(raw);
      } catch {
        return null;
      }
    }
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  };

  const handleRangeChange = (start: string, end: string) => {
    setStartInput(start);
    setEndInput(end);
    const s = parseInput(start);
    const e = parseInput(end);
    if (s == null || e == null) {
      setError(null);
      return;
    }
    if (!project.corridor) return;
    if (!isStationInRange(s, project.corridor) || !isStationInRange(e, project.corridor)) {
      setError(`Stations must be between 0 and ${formatStation(project.corridor.totalLength)}`);
      return;
    }
    if (s >= e) {
      setError('Start station must be before end station');
      return;
    }
    setError(null);
    onChange({ mode: 'range', stationStart: s, stationEnd: e });
  };

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-muted-foreground mb-2">
          Inspection Scope
        </label>
        <div className="grid grid-cols-3 gap-2">
          {(['full', 'segment', 'range'] as const).map((mode) => {
            const selected = value.mode === mode;
            const label = mode === 'full' ? 'Full Corridor' : mode === 'segment' ? 'Segment' : 'Station Range';
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setMode(mode)}
                className={`rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                  selected
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                    : 'border-border bg-elevated text-muted-foreground hover:border-amber-500/30'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {value.mode === 'segment' && (
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Choose segment
          </label>
          <select
            value={value.segmentId ?? ''}
            onChange={(e) => handleSegmentChange(e.target.value)}
            className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
          >
            <option value="">— Select a segment —</option>
            {segments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({formatStation(s.startStation)} – {formatStation(s.endStation)})
              </option>
            ))}
          </select>
        </div>
      )}

      {value.mode === 'range' && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              From station
            </label>
            <input
              type="text"
              value={startInput}
              onChange={(e) => handleRangeChange(e.target.value, endInput)}
              placeholder="STA 0+00"
              className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              To station
            </label>
            <input
              type="text"
              value={endInput}
              onChange={(e) => handleRangeChange(startInput, e.target.value)}
              placeholder={`STA ${Math.floor(project.corridor.totalLength / 100)}+${(project.corridor.totalLength % 100).toString().padStart(2, '0')}`}
              className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-red-300">{error}</p>
      )}
    </div>
  );
}
