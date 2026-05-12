'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { ShieldAlert, Plus, Power, Trash2 } from 'lucide-react';
import { PageTransition } from '@/components/shared/page-transition';
import { useProjectStore } from '@/stores/project-store';
import { useNoFlyZonesStore } from '@/stores/nofly-zones-store';
import {
  NOFLY_CATEGORY_LABELS,
  NOFLY_CATEGORY_COLORS,
  type NoFlyZone,
  type NoFlyZoneCategory,
} from '@/types/nofly-zone';
import { cn } from '@/lib/utils';

const EMPTY_ZONES: NoFlyZone[] = [];

const SiteOverviewMap = dynamic(
  () =>
    import('@/components/dashboard/site-overview-map').then((m) => ({
      default: m.SiteOverviewMap,
    })),
  {
    ssr: false,
    loading: () => <div className="h-80 animate-pulse rounded-lg bg-muted" />,
  }
);

const CATEGORY_OPTIONS: NoFlyZoneCategory[] = [
  'airport',
  'school',
  'critical-infra',
  'wildlife',
  'private',
  'temporary',
];

export default function NoFlyZonesPage() {
  const router = useRouter();
  const project = useProjectStore((s) => s.currentProject());
  const projectId = useProjectStore((s) => s.currentProjectId);

  // Stable-ref selector pattern (avoids React error #185).
  const zonesForProject = useNoFlyZonesStore((s) => s.zonesByProject[projectId]);
  const zones = zonesForProject ?? EMPTY_ZONES;
  const loading = useNoFlyZonesStore((s) => s.loading);
  const error = useNoFlyZonesStore((s) => s.error);
  const fetchZones = useNoFlyZonesStore((s) => s.fetchZones);
  const createZone = useNoFlyZonesStore((s) => s.createZone);
  const toggleActive = useNoFlyZonesStore((s) => s.toggleActive);
  const deleteZone = useNoFlyZonesStore((s) => s.deleteZone);

  const [showForm, setShowForm] = useState(false);

  // Linear-only — bounded-site projects do not get this page.
  useEffect(() => {
    if (project && project.projectType !== 'linear') {
      router.replace('/dashboard');
    }
  }, [project, router]);

  useEffect(() => {
    if (project?.projectType === 'linear' && projectId) {
      fetchZones(projectId, { includeInactive: true });
    }
  }, [project?.projectType, projectId, fetchZones]);

  const categoryCounts = useMemo(() => {
    const counts: Record<NoFlyZoneCategory, number> = {
      airport: 0,
      school: 0,
      'critical-infra': 0,
      wildlife: 0,
      private: 0,
      temporary: 0,
    };
    for (const z of zones) {
      if (z.active) counts[z.category]++;
    }
    return counts;
  }, [zones]);

  const grouped = useMemo(() => {
    const byCategory: Record<string, NoFlyZone[]> = {};
    for (const z of zones) {
      if (!byCategory[z.category]) byCategory[z.category] = [];
      byCategory[z.category].push(z);
    }
    return byCategory;
  }, [zones]);

  if (!project || project.projectType !== 'linear') {
    return null;
  }

  return (
    <PageTransition>
      <div className="space-y-6 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-red-400" />
              No-Fly Zones
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Restricted airspace polygons enforced at mission planning time for the {project.name} corridor.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add No-Fly Zone
          </button>
        </div>

        {/* Category summary */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {CATEGORY_OPTIONS.map((cat) => {
            const color = NOFLY_CATEGORY_COLORS[cat];
            return (
              <div
                key={cat}
                className="rounded-lg border border-border bg-surface p-3"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {NOFLY_CATEGORY_LABELS[cat]}
                </p>
                <p className="mt-1 text-2xl font-bold" style={{ color }}>
                  {categoryCounts[cat]}
                </p>
              </div>
            );
          })}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SiteOverviewMap />
          </div>
          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            <div className="border-b border-border px-4 py-3">
              <h3 className="font-heading text-sm font-semibold tracking-wide">
                Configured Zones
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {zones.length} total · {zones.filter((z) => z.active).length} active
              </p>
            </div>

            <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
              {loading && (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Loading zones…
                </div>
              )}

              {!loading && zones.length === 0 && (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No no-fly zones configured for this corridor.
                </div>
              )}

              {CATEGORY_OPTIONS.map((cat) => {
                const list = grouped[cat] ?? [];
                if (list.length === 0) return null;
                const color = NOFLY_CATEGORY_COLORS[cat];
                return (
                  <div key={cat}>
                    <div className="bg-elevated px-4 py-2 sticky top-0 z-10 flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {NOFLY_CATEGORY_LABELS[cat]}
                      </p>
                    </div>
                    {list.map((z) => (
                      <ZoneRow
                        key={z.id}
                        zone={z}
                        onToggle={() => toggleActive(z.id, projectId)}
                        onDelete={() => {
                          if (
                            confirm(`Delete no-fly zone "${z.name}"? This cannot be undone.`)
                          ) {
                            deleteZone(z.id, projectId);
                          }
                        }}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {showForm && (
          <NoFlyZoneForm
            projectId={projectId}
            onClose={() => setShowForm(false)}
            onCreate={async (input) => {
              await createZone(input);
              setShowForm(false);
            }}
          />
        )}
      </div>
    </PageTransition>
  );
}

function ZoneRow({
  zone,
  onToggle,
  onDelete,
}: {
  zone: NoFlyZone;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        'px-4 py-3 flex items-start gap-3 transition-opacity',
        !zone.active && 'opacity-50'
      )}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{zone.name}</p>
        {zone.description && (
          <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
            {zone.description}
          </p>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground font-mono">
          {typeof zone.floorFeet === 'number' && (
            <span>floor {zone.floorFeet} ft</span>
          )}
          {typeof zone.ceilingFeet === 'number' && (
            <span>ceiling {zone.ceilingFeet} ft</span>
          )}
          {zone.source && <span>src: {zone.source}</span>}
          <span>{zone.polygon.length - 1} vertices</span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={onToggle}
          title={zone.active ? 'Deactivate' : 'Activate'}
          className={cn(
            'rounded p-1 transition-colors',
            zone.active
              ? 'text-emerald-400 hover:bg-emerald-500/10'
              : 'text-muted-foreground hover:bg-elevated'
          )}
        >
          <Power className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete zone"
          className="rounded p-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface NoFlyZoneFormProps {
  projectId: string;
  onClose: () => void;
  onCreate: (input: Omit<NoFlyZone, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
}

function NoFlyZoneForm({ projectId, onClose, onCreate }: NoFlyZoneFormProps) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState<NoFlyZoneCategory>('critical-infra');
  const [description, setDescription] = useState('');
  const [floorFeet, setFloorFeet] = useState('');
  const [ceilingFeet, setCeilingFeet] = useState('');
  const [polygonText, setPolygonText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setParseError(null);

    let polygon: [number, number][];
    try {
      const parsed = JSON.parse(polygonText);
      if (
        !Array.isArray(parsed) ||
        parsed.length < 3 ||
        !parsed.every(
          (p) =>
            Array.isArray(p) &&
            p.length === 2 &&
            typeof p[0] === 'number' &&
            typeof p[1] === 'number'
        )
      ) {
        throw new Error('Polygon must be an array of at least 3 [lng, lat] pairs.');
      }
      polygon = parsed as [number, number][];
      // Auto-close ring
      const first = polygon[0];
      const last = polygon[polygon.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        polygon = [...polygon, first];
      }
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Polygon JSON could not be parsed.'
      );
      return;
    }

    setSubmitting(true);
    try {
      await onCreate({
        projectId,
        name: name.trim(),
        category,
        polygon,
        floorFeet: floorFeet ? Number(floorFeet) : undefined,
        ceilingFeet: ceilingFeet ? Number(ceilingFeet) : undefined,
        description: description.trim() || undefined,
        source: 'manual',
        active: true,
      });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to create zone');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-border bg-[#1C1C1C] p-5 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-heading text-lg font-semibold tracking-wide">
          Add No-Fly Zone
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Define a restricted polygon. Drone missions touching this zone will be rejected.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Lincoln Elementary 500 ft buffer"
              className="mt-1 w-full rounded border border-border bg-[#0A0A0A] px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as NoFlyZoneCategory)}
              className="mt-1 w-full rounded border border-border bg-[#0A0A0A] px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {NOFLY_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Floor (ft AGL)
              </label>
              <input
                type="number"
                value={floorFeet}
                onChange={(e) => setFloorFeet(e.target.value)}
                placeholder="0"
                className="mt-1 w-full rounded border border-border bg-[#0A0A0A] px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Ceiling (ft AGL)
              </label>
              <input
                type="number"
                value={ceilingFeet}
                onChange={(e) => setCeilingFeet(e.target.value)}
                placeholder="∞"
                className="mt-1 w-full rounded border border-border bg-[#0A0A0A] px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Why this area is restricted"
              className="mt-1 w-full rounded border border-border bg-[#0A0A0A] px-3 py-2 text-sm focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Polygon ([lng, lat] vertices, JSON)
            </label>
            <textarea
              required
              value={polygonText}
              onChange={(e) => setPolygonText(e.target.value)}
              rows={5}
              placeholder='[[-119.78, 36.78], [-119.77, 36.78], [-119.77, 36.79], [-119.78, 36.79]]'
              className="mt-1 w-full rounded border border-border bg-[#0A0A0A] px-3 py-2 text-xs font-mono focus:border-amber-500 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Minimum 3 vertices. Ring is auto-closed if needed.
            </p>
          </div>

          {parseError && (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-[11px] text-red-300">
              {parseError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-elevated transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Creating…' : 'Create Zone'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
