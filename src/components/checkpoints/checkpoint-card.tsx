'use client';

import Link from 'next/link';
import { Camera } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { BMP_CATEGORY_LABELS, BMP_CATEGORY_COLORS } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/format';
import { Checkpoint } from '@/types/checkpoint';
import { cn } from '@/lib/utils';
import { useAppMode } from '@/hooks/use-app-mode';

interface CheckpointCardProps {
  checkpoint: Checkpoint;
  index: number;
}

const priorityColors: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-green-500',
};

export function CheckpointCard({ checkpoint, index }: CheckpointCardProps) {
  const { isApp } = useAppMode();
  const bmpColor = BMP_CATEGORY_COLORS[checkpoint.bmpType];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileHover={{ scale: 1.02 }}
    >
      <Link href={`/checkpoints/${checkpoint.id}`} className="block">
        <Card className="group cursor-pointer border-border bg-surface hover:bg-surface-elevated transition-colors overflow-hidden">
          {/* BMP colored top bar */}
          <div className="h-0.5" style={{ backgroundColor: bmpColor }} />

          <CardHeader className={cn('pb-0', isApp && 'px-3 pt-3')}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs text-muted-foreground shrink-0">
                  {checkpoint.id}
                </span>
                <CardTitle className={cn('truncate text-sm', isApp && 'text-xs')}>{checkpoint.name}</CardTitle>
              </div>
              <StatusBadge status={checkpoint.status} />
            </div>
          </CardHeader>

          <CardContent className={cn('space-y-3', isApp && 'px-3 pb-3 space-y-2')}>
            {/* Meta row: BMP type, zone, priority */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{
                  color: bmpColor,
                  backgroundColor: `${bmpColor}15`,
                }}
              >
                {BMP_CATEGORY_LABELS[checkpoint.bmpType]}
              </span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                {checkpoint.stationLabel ?? checkpoint.zone ?? '—'}
              </span>
              <div className="flex items-center gap-1 ml-auto">
                <div
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    priorityColors[checkpoint.priority]
                  )}
                />
                <span className="text-[10px] text-muted-foreground capitalize">
                  {checkpoint.priority}
                </span>
              </div>
            </div>

            {/* Drone image placeholder */}
            {!isApp && (
              <div className="relative aspect-video rounded-md bg-background/50 border border-border flex items-center justify-center overflow-hidden">
                <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                  <Camera className="h-6 w-6 opacity-40" />
                  <span className="text-[10px] uppercase tracking-wider opacity-60">
                    Drone Image
                  </span>
                </div>
              </div>
            )}

            {/* Last inspection */}
            <div className={cn('flex items-center justify-between text-xs text-muted-foreground', isApp && 'text-[10px]')}>
              <span>Last inspection</span>
              <span className="font-medium text-foreground/70">
                {formatRelativeTime(checkpoint.lastInspectionDate)}
              </span>
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
