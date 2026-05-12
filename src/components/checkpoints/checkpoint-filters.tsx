'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useProjectStore } from '@/stores/project-store';
import { BMP_CATEGORY_LABELS, BMP_CATEGORY_COLORS, STATUS_COLORS } from '@/lib/constants';
import { BMPCategory, CheckpointStatus, Zone } from '@/types/checkpoint';
import { cn } from '@/lib/utils';
import { useAppMode } from '@/hooks/use-app-mode';

const statuses: { value: CheckpointStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'compliant', label: 'Compliant' },
  { value: 'deficient', label: 'Deficient' },
  { value: 'needs-review', label: 'Needs Review' },
];

const bmpTypes: { value: BMPCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All BMPs' },
  ...Object.entries(BMP_CATEGORY_LABELS).map(([value, label]) => ({
    value: value as BMPCategory,
    label,
  })),
];

const zones: { value: Zone | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'north', label: 'North' },
  { value: 'south', label: 'South' },
  { value: 'east', label: 'East' },
  { value: 'west', label: 'West' },
  { value: 'central', label: 'Central' },
];

export function CheckpointFilters() {
  const { isApp } = useAppMode();
  const { filters, setFilter, resetFilters } = useCheckpointStore();
  const project = useProjectStore((s) => s.currentProject());
  const isLinear = project?.projectType === 'linear';
  const segments = project?.segments ?? [];

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.bmpType !== 'all' ||
    filters.zone !== 'all' ||
    filters.segment !== 'all' ||
    filters.search !== '';

  return (
    <div className="flex flex-col gap-3">
      {/* Row 1: Search + Status + Zone + Reset */}
      <div className={cn('flex flex-wrap items-center gap-3', isApp && 'overflow-x-auto flex-nowrap gap-2')}>
        {/* Search */}
        <div className={cn('relative w-64', isApp && 'w-full')}>
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search checkpoints..."
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="pl-8 bg-surface border-border"
          />
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-1.5">
          {statuses.map((s) => {
            const isActive = filters.status === s.value;
            const color = s.value !== 'all' ? STATUS_COLORS[s.value] : undefined;
            return (
              <button
                key={s.value}
                onClick={() => setFilter('status', s.value)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-all border',
                  isApp && 'text-[10px] px-2 py-0.5',
                  isActive && color
                    ? 'text-white border-transparent'
                    : isActive
                      ? 'bg-foreground/10 text-foreground border-foreground/20'
                      : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
                )}
                style={
                  isActive && color
                    ? { backgroundColor: `${color}20`, color: color, borderColor: `${color}40` }
                    : undefined
                }
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Zone or Segment pills */}
        <div className="h-4 w-px bg-border" />
        {isLinear ? (
          <div className="flex items-center gap-1.5">
            {[{ value: 'all' as const, label: 'All Segments' }, ...segments.map((s) => ({ value: s.id, label: s.name }))].map((seg) => {
              const isActive = filters.segment === seg.value;
              return (
                <button
                  key={seg.value}
                  onClick={() => setFilter('segment', seg.value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-all border whitespace-nowrap',
                    isApp && 'text-[10px] px-2 py-0.5',
                    isActive
                      ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                      : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
                  )}
                >
                  {seg.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-1.5">
            {zones.map((z) => {
              const isActive = filters.zone === z.value;
              return (
                <button
                  key={z.value}
                  onClick={() => setFilter('zone', z.value)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-all border',
                    isApp && 'text-[10px] px-2 py-0.5',
                    isActive
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                      : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
                  )}
                >
                  {z.label}
                </button>
              );
            })}
          </div>
        )}

        {/* Reset */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="xs"
            onClick={resetFilters}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="mr-1 h-3 w-3" />
            Reset
          </Button>
        )}
      </div>

      {/* Row 2: BMP Type pills (horizontal scroll) */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
        {bmpTypes.map((b) => {
          const isActive = filters.bmpType === b.value;
          const color = b.value !== 'all' ? BMP_CATEGORY_COLORS[b.value] : undefined;
          return (
            <button
              key={b.value}
              onClick={() => setFilter('bmpType', b.value)}
              className={cn(
                'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-all border whitespace-nowrap',
                isApp && 'text-[10px] px-2 py-0.5',
                isActive && color
                  ? 'border-transparent'
                  : isActive
                    ? 'bg-foreground/10 text-foreground border-foreground/20'
                    : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
              )}
              style={
                isActive && color
                  ? { backgroundColor: `${color}20`, color: color, borderColor: `${color}40` }
                  : undefined
              }
            >
              {b.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
