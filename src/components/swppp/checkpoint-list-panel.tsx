'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, Filter, ExternalLink } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/shared/status-badge';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useEffect } from 'react';
import { BMP_CATEGORY_LABELS, BMP_CATEGORY_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { ExtractedCheckpoint } from '@/types/swppp';

interface CheckpointListPanelProps {
  selectedCheckpointId: string | null;
  onSelect: (id: string) => void;
  extractedCheckpoints?: ExtractedCheckpoint[];
}

export function CheckpointListPanel({ selectedCheckpointId, onSelect, extractedCheckpoints }: CheckpointListPanelProps) {
  const [search, setSearch] = useState('');
  const storeCheckpoints = useCheckpointStore((s) => s.checkpoints);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);

  useEffect(() => {
    if (storeCheckpoints.length === 0) fetchCheckpoints();
  }, [storeCheckpoints.length, fetchCheckpoints]);

  const aiAnalyses: any[] = [];

  // Use extracted checkpoints if provided, otherwise fall back to static data
  const useExtracted = extractedCheckpoints && extractedCheckpoints.length > 0;

  const filteredStatic = storeCheckpoints.filter((cp) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return cp.id.toLowerCase().includes(q) || cp.name.toLowerCase().includes(q);
  });

  const filteredExtracted = useExtracted
    ? extractedCheckpoints.filter((cp) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return cp.id.toLowerCase().includes(q) || cp.name.toLowerCase().includes(q);
      })
    : [];

  const totalCount = useExtracted ? extractedCheckpoints.length : storeCheckpoints.length;
  const filteredCount = useExtracted ? filteredExtracted.length : filteredStatic.length;

  return (
    <div className="flex h-full flex-col">
      {/* Search bar */}
      <div className="border-b border-white/5 bg-[#141414] p-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search BMPs..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 bg-white/5 border-white/10 pl-8 text-xs placeholder:text-muted-foreground/50"
          />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {filteredCount} of {totalCount} BMPs
        </p>
      </div>

      {/* List */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-white/5">
          {useExtracted
            ? filteredExtracted.map((cp) => {
                const isSelected = selectedCheckpointId === cp.id;
                const bmpColor = BMP_CATEGORY_COLORS[cp.bmpType];

                return (
                  <button
                    key={cp.id}
                    onClick={() => onSelect(cp.id)}
                    className={cn(
                      'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5',
                      isSelected && 'bg-amber-500/10 hover:bg-amber-500/15'
                    )}
                  >
                    <div
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: bmpColor }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">{cp.id}</span>
                        <span className="rounded bg-white/5 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                          Pending
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-foreground">{cp.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className="text-[9px] uppercase tracking-wider"
                          style={{ color: bmpColor }}
                        >
                          {BMP_CATEGORY_LABELS[cp.bmpType]}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-muted-foreground/70">
                        {cp.zone} zone • {cp.cgpSection}
                      </p>
                    </div>
                  </button>
                );
              })
            : filteredStatic.map((cp) => {
                const analysis = aiAnalyses.find((a) => a.checkpointId === cp.id);
                const isSelected = selectedCheckpointId === cp.id;
                const bmpColor = BMP_CATEGORY_COLORS[cp.bmpType];

                return (
                  <button
                    key={cp.id}
                    onClick={() => onSelect(cp.id)}
                    className={cn(
                      'flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/5',
                      isSelected && 'bg-amber-500/10 hover:bg-amber-500/15'
                    )}
                  >
                    <div
                      className="mt-1 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: bmpColor }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">{cp.id}</span>
                        <StatusBadge status={cp.status} className="scale-90" />
                      </div>
                      <p className="mt-0.5 truncate text-xs text-foreground">{cp.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className="text-[9px] uppercase tracking-wider"
                          style={{ color: bmpColor }}
                        >
                          {BMP_CATEGORY_LABELS[cp.bmpType]}
                        </span>
                        {analysis && (
                          <span className="text-[9px] text-muted-foreground">
                            {analysis.confidence}% conf.
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between">
                        <p className="text-[10px] text-muted-foreground/70">
                          SWPPP p.{cp.swpppPage}
                        </p>
                        <Link
                          href={`/checkpoints/${cp.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-amber-500 hover:text-amber-400 transition-colors"
                        >
                          Detail
                          <ExternalLink className="h-2.5 w-2.5" />
                        </Link>
                      </div>
                    </div>
                  </button>
                );
              })}
        </div>
      </ScrollArea>
    </div>
  );
}
