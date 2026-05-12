'use client';

import { useState, useEffect } from 'react';
import { useCrossingsStore } from '@/stores/crossings-store';
import {
  CROSSING_TYPE_LABELS,
  CROSSING_STATUS_LABELS,
} from '@/types/crossing';
import type { Crossing, CrossingType, CrossingStatus } from '@/types/crossing';
import type { ProjectSegment } from '@/types/project';
import { formatStation, parseStation } from '@/lib/format';

interface CrossingFormProps {
  crossing: Crossing | null;
  projectId: string;
  segments: ProjectSegment[];
  onClose: () => void;
}

const COMMON_PERMIT_TYPES = [
  'CWA-404',
  'CWA-401',
  'CDFW-1602',
  'Caltrans-Encroachment',
  'County-ROW',
  'BNSF-Crossing',
  'CPUC-General-Order-26-D',
  'PGE-Encroachment',
  'USA-Mark',
  'NPDES-CGP',
  'CWA-404-NWP12',
];

export function CrossingForm({ crossing, projectId, segments, onClose }: CrossingFormProps) {
  const createCrossing = useCrossingsStore((s) => s.createCrossing);
  const updateCrossing = useCrossingsStore((s) => s.updateCrossing);
  const deleteCrossing = useCrossingsStore((s) => s.deleteCrossing);

  const [name, setName] = useState('');
  const [crossingType, setCrossingType] = useState<CrossingType>('stream');
  const [segmentId, setSegmentId] = useState<string>('');
  const [stationInput, setStationInput] = useState('');
  const [stationFeet, setStationFeet] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [permits, setPermits] = useState<string[]>([]);
  const [status, setStatus] = useState<CrossingStatus>('pending');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (crossing) {
      setName(crossing.name);
      setCrossingType(crossing.crossingType);
      setSegmentId(crossing.segmentId ?? '');
      setStationFeet(crossing.stationNumber ?? null);
      setStationInput(
        crossing.stationLabel ??
          (crossing.stationNumber != null ? formatStation(crossing.stationNumber) : '')
      );
      setDescription(crossing.description ?? '');
      setPermits(crossing.permitsRequired);
      setStatus(crossing.status);
    }
  }, [crossing]);

  const handleStationChange = (value: string) => {
    setStationInput(value);
    // Try to parse — accept either raw number or "STA X+XX" format
    if (!value.trim()) {
      setStationFeet(null);
      return;
    }
    if (/^STA\s/i.test(value)) {
      try {
        setStationFeet(parseStation(value));
      } catch {
        setStationFeet(null);
      }
    } else {
      const num = Number(value);
      if (Number.isFinite(num)) setStationFeet(num);
      else setStationFeet(null);
    }
  };

  const togglePermit = (p: string) => {
    setPermits((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  };

  const handleSubmit = async () => {
    if (!name.trim() || !crossingType) {
      setError('Name and type are required');
      return;
    }
    setSubmitting(true);
    setError(null);

    const payload: Partial<Crossing> = {
      projectId,
      name: name.trim(),
      crossingType,
      segmentId: segmentId || undefined,
      stationNumber: stationFeet ?? undefined,
      stationLabel: stationFeet != null ? formatStation(stationFeet) : undefined,
      description: description.trim() || undefined,
      permitsRequired: permits,
      status,
    };

    try {
      if (crossing) {
        await updateCrossing(crossing.id, payload);
      } else {
        await createCrossing(payload);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save crossing');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!crossing) return;
    if (!confirm(`Delete crossing "${crossing.name}"? This cannot be undone.`)) return;
    setSubmitting(true);
    await deleteCrossing(crossing.id, projectId);
    setSubmitting(false);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg border border-border bg-surface shadow-2xl"
      >
        <div className="border-b border-border px-5 py-4">
          <h3 className="font-heading text-base font-semibold">
            {crossing ? 'Edit Crossing' : 'New Crossing'}
          </h3>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Cottonwood Creek HDD"
              className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Type *</label>
              <select
                value={crossingType}
                onChange={(e) => setCrossingType(e.target.value as CrossingType)}
                className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
              >
                {(Object.keys(CROSSING_TYPE_LABELS) as CrossingType[]).map((t) => (
                  <option key={t} value={t}>
                    {CROSSING_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as CrossingStatus)}
                className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
              >
                {(Object.keys(CROSSING_STATUS_LABELS) as CrossingStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {CROSSING_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">Segment</label>
              <select
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value)}
                className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
              >
                <option value="">— Unassigned —</option>
                {segments.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Station {stationFeet != null && <span className="text-amber-400">({formatStation(stationFeet)})</span>}
              </label>
              <input
                type="text"
                value={stationInput}
                onChange={(e) => handleStationChange(e.target.value)}
                placeholder="6864 or STA 68+64"
                className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none resize-none"
              placeholder="Construction method, special requirements, agency contacts…"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-2">
              Permits Required
            </label>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_PERMIT_TYPES.map((p) => {
                const selected = permits.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => togglePermit(p)}
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium border transition-colors ${
                      selected
                        ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                        : 'border-border bg-elevated text-muted-foreground hover:border-amber-500/30'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-border px-5 py-4 flex items-center justify-between">
          {crossing ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={submitting}
              className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-300 hover:bg-red-500/20 transition-colors disabled:opacity-50"
            >
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-surface transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-md border border-amber-500/40 bg-amber-500 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-400 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving…' : crossing ? 'Save Changes' : 'Create Crossing'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
