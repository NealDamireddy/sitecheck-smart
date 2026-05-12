'use client';

import { useState, useCallback, useMemo } from 'react';
import { FileText, CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { cn } from '@/lib/utils';

interface DocumentPageSelectorProps {
  selectedPages: number[] | null;
  onSelectionChange: (pages: number[] | null) => void;
}

export function DocumentPageSelector({
  selectedPages,
  onSelectionChange,
}: DocumentPageSelectorProps) {
  const checkpoints = useCheckpointStore((s) => s.checkpoints);

  // Group checkpoints by swpppPage
  const pageGroups = useMemo(() => {
    const groups = new Map<number, { page: number; checkpointNames: string[]; count: number }>();
    checkpoints.forEach((cp) => {
      if (!cp.swpppPage) return;
      if (!groups.has(cp.swpppPage)) {
        groups.set(cp.swpppPage, { page: cp.swpppPage, checkpointNames: [], count: 0 });
      }
      const group = groups.get(cp.swpppPage)!;
      group.checkpointNames.push(cp.name);
      group.count++;
    });
    return Array.from(groups.values()).sort((a, b) => a.page - b.page);
  }, [checkpoints]);

  const allPages = useMemo(() => pageGroups.map((g) => g.page), [pageGroups]);
  const isAllSelected = selectedPages === null || (selectedPages && selectedPages.length === allPages.length);

  const handleTogglePage = useCallback(
    (page: number) => {
      const current = selectedPages ?? allPages;
      const isSelected = current.includes(page);
      const next = isSelected
        ? current.filter((p) => p !== page)
        : [...current, page].sort((a, b) => a - b);
      onSelectionChange(next.length === allPages.length ? null : next);
    },
    [selectedPages, allPages, onSelectionChange]
  );

  const handleSelectAll = useCallback(() => {
    onSelectionChange(null);
  }, [onSelectionChange]);

  const handleDeselectAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  if (pageGroups.length === 0) return null;

  const selectedCount = selectedPages ? selectedPages.length : allPages.length;
  const totalCheckpoints = selectedPages
    ? pageGroups
        .filter((g) => selectedPages.includes(g.page))
        .reduce((sum, g) => sum + g.count, 0)
    : checkpoints.filter((c) => c.swpppPage).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Document Pages</span>
          <Badge
            variant="secondary"
            className="h-4 px-1.5 text-[10px] bg-blue-500/10 text-blue-400"
          >
            {selectedCount} pages · {totalCheckpoints} BMPs
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1.5"
            onClick={handleSelectAll}
          >
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] px-1.5"
            onClick={handleDeselectAll}
          >
            None
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[180px]">
        <div className="space-y-1">
          {pageGroups.map(({ page, checkpointNames, count }) => {
            const current = selectedPages ?? allPages;
            const isSelected = current.includes(page);

            return (
              <button
                key={page}
                onClick={() => handleTogglePage(page)}
                className={cn(
                  'w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                  isSelected
                    ? 'bg-blue-500/10 hover:bg-blue-500/15'
                    : 'bg-muted/30 hover:bg-muted/50 opacity-60'
                )}
              >
                {isSelected ? (
                  <CheckSquare className="h-3.5 w-3.5 text-blue-400 mt-0.5 flex-shrink-0" />
                ) : (
                  <Square className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-foreground">
                      Page {page}
                    </span>
                    <Badge
                      variant="secondary"
                      className="h-3.5 px-1 text-[9px] bg-muted text-muted-foreground"
                    >
                      {count} BMP{count !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {checkpointNames.slice(0, 3).join(', ')}
                    {checkpointNames.length > 3 && ` +${checkpointNames.length - 3} more`}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
