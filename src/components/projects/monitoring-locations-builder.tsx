'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { DischargePointType } from '@/types/monitoring-location';

export interface MonitoringLocationDraft {
  id: string;
  name: string;
  drainageArea: string;
  dischargePointType: DischargePointType;
  isAts: boolean;
  isPassiveTreatment: boolean;
  description?: string;
  latitude?: number;
  longitude?: number;
}

const DISCHARGE_POINT_TYPES: DischargePointType[] = [
  'Effluent',
  'Infiltration-Groundwater',
  'Influent',
  'Internal',
  'Receiving Water',
];

interface Props {
  locations: MonitoringLocationDraft[];
  onChange: (next: MonitoringLocationDraft[]) => void;
  /** Used to seed lat/lng on new rows when known. */
  centerLat?: number;
  centerLng?: number;
}

export function MonitoringLocationsBuilder({
  locations,
  onChange,
  centerLat,
  centerLng,
}: Props) {
  const addLocation = () => {
    const idx = locations.length + 1;
    onChange([
      ...locations,
      {
        id: `mloc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `Monitoring Location ${idx}`,
        drainageArea: '',
        dischargePointType: 'Effluent',
        isAts: false,
        isPassiveTreatment: false,
        latitude: centerLat,
        longitude: centerLng,
      },
    ]);
  };

  const updateLocation = (idx: number, updates: Partial<MonitoringLocationDraft>) => {
    const next = [...locations];
    next[idx] = { ...next[idx], ...updates };
    onChange(next);
  };

  const removeLocation = (idx: number) => {
    onChange(locations.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          Predefined sampling points where pH and turbidity samples are
          collected during qualifying storms. At least one is required to use
          SMARTS event capture.
        </p>
        <button
          type="button"
          onClick={addLocation}
          className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Location
        </button>
      </div>

      {locations.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-elevated/50 p-6 text-center text-xs text-muted-foreground">
          No monitoring locations yet. Add at least one to enable SMARTS
          sampling on this site.
        </div>
      ) : (
        <ul className="space-y-3">
          {locations.map((loc, idx) => (
            <li
              key={loc.id}
              className="rounded-lg border border-border bg-elevated p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Location {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => removeLocation(idx)}
                  className="text-muted-foreground hover:text-red-400"
                  aria-label="Remove location"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    value={loc.name}
                    onChange={(e) => updateLocation(idx, { name: e.target.value })}
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm focus:border-amber-500/50 focus:outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Drainage Area *
                  </label>
                  <input
                    type="text"
                    value={loc.drainageArea}
                    placeholder='e.g. "DA-1, 4.2 ac"'
                    onChange={(e) => updateLocation(idx, { drainageArea: e.target.value })}
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm focus:border-amber-500/50 focus:outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Discharge Point Type *
                  </label>
                  <select
                    value={loc.dischargePointType}
                    onChange={(e) =>
                      updateLocation(idx, {
                        dischargePointType: e.target.value as DischargePointType,
                      })
                    }
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm focus:border-amber-500/50 focus:outline-none"
                  >
                    {DISCHARGE_POINT_TYPES.map((dpt) => (
                      <option key={dpt} value={dpt}>
                        {dpt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={loc.latitude ?? ''}
                    onChange={(e) =>
                      updateLocation(idx, {
                        latitude: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="0.000001"
                    value={loc.longitude ?? ''}
                    onChange={(e) =>
                      updateLocation(idx, {
                        longitude: e.target.value === '' ? undefined : Number(e.target.value),
                      })
                    }
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
                  />
                </div>

                <label className="col-span-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={loc.isAts}
                    onChange={(e) => updateLocation(idx, { isAts: e.target.checked })}
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  ATS (Active Treatment)
                </label>
                <label className="col-span-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={loc.isPassiveTreatment}
                    onChange={(e) =>
                      updateLocation(idx, { isPassiveTreatment: e.target.checked })
                    }
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  Passive Treatment
                </label>

                <div className="col-span-2">
                  <label className="block text-[11px] font-medium text-muted-foreground mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={loc.description ?? ''}
                    rows={2}
                    onChange={(e) =>
                      updateLocation(idx, { description: e.target.value || undefined })
                    }
                    className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm focus:border-amber-500/50 focus:outline-none"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
