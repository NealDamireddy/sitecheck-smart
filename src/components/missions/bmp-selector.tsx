'use client';

import { useEffect } from 'react';
import { Search, CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { BMPCategory } from '@/types/checkpoint';
import {
  BMP_CATEGORY_LABELS,
  BMP_CATEGORY_COLORS,
  STATUS_COLORS,
} from '@/lib/constants';

interface BmpSelectorProps {
  selectedIds: Set<string>;
  onToggle: (checkpointId: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

const BMP_TYPE_FILTERS: Array<{ value: BMPCategory | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'erosion-control', label: 'Erosion' },
  { value: 'sediment-control', label: 'Sediment' },
  { value: 'tracking-control', label: 'Tracking' },
  { value: 'wind-erosion', label: 'Wind' },
  { value: 'materials-management', label: 'Materials' },
  { value: 'non-storm-water', label: 'Non-Storm' },
];

export function BmpSelector({
  selectedIds,
  onToggle,
  onSelectAll,
  onDeselectAll,
}: BmpSelectorProps) {
  const filters = useCheckpointStore((s) => s.filters);
  const setFilter = useCheckpointStore((s) => s.setFilter);
  const filteredCheckpoints = useCheckpointStore((s) => s.filteredCheckpoints);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);
  const checkpoints = useCheckpointStore((s) => s.checkpoints);

  useEffect(() => {
    if (checkpoints.length === 0) fetchCheckpoints();
  }, [checkpoints.length, fetchCheckpoints]);

  const visibleCheckpoints = filteredCheckpoints();

  return (
    <div className="flex flex-col gap-3">
      {/* Top bar: count + bulk actions */}
      <div className="flex items-center justify-between">
        <Badge
          variant="secondary"
          className="bg-blue-500/10 text-blue-400 border-blue-500/20"
        >
          {selectedIds.size} selected
        </Badge>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={onSelectAll}
          >
            Select All
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground"
            onClick={onDeselectAll}
          >
            Deselect All
          </Button>
        </div>
      </div>

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search checkpoints..."
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          className="h-8 pl-8 text-sm bg-surface border-border"
        />
      </div>

      {/* BMP type filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {BMP_TYPE_FILTERS.map(({ value, label }) => {
          const isActive = filters.bmpType === value;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setFilter('bmpType', value)}
              className={cn(
                'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors border',
                isActive
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : 'bg-surface text-muted-foreground border-border hover:text-foreground hover:border-foreground/20'
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Checkpoint list */}
      <ScrollArea className="max-h-[400px]">
        <div className="flex flex-col gap-1">
          {visibleCheckpoints.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No checkpoints match filters
            </p>
          )}
          {visibleCheckpoints.map((cp) => {
            const isSelected = selectedIds.has(cp.id);
            return (
              <button
                key={cp.id}
                type="button"
                onClick={() => onToggle(cp.id)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors w-full',
                  'hover:bg-white/5',
                  isSelected
                    ? 'bg-blue-500/5 border border-blue-500/20'
                    : 'border border-transparent'
                )}
              >
                {/* Checkbox indicator */}
                {isSelected ? (
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-blue-500" />
                ) : (
                  <Circle className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
                )}

                {/* Name */}
                <span
                  className={cn(
                    'flex-1 truncate text-sm',
                    isSelected ? 'text-foreground font-medium' : 'text-foreground'
                  )}
                >
                  {cp.name}
                </span>

                {/* BMP type badge */}
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-5 border-border"
                  style={{ color: BMP_CATEGORY_COLORS[cp.bmpType] }}
                >
                  {BMP_CATEGORY_LABELS[cp.bmpType]}
                </Badge>

                {/* Status dot */}
                <span
                  className="h-2 w-2 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[cp.status] }}
                  title={cp.status}
                />

                {/* Zone */}
                <span className="text-[10px] text-muted-foreground capitalize w-10 text-right flex-shrink-0">
                  {cp.zone}
                </span>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
