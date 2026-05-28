'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Camera, CheckCircle2, XCircle, CircleHelp, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/status-badge';
import { BMP_CATEGORY_LABELS, BMP_CATEGORY_COLORS } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/format';
import { Checkpoint, CheckpointStatus } from '@/types/checkpoint';
import { useCheckpointStore } from '@/stores/checkpoint-store';
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
  const updateCheckpoint = useCheckpointStore((s) => s.updateCheckpoint);
  const [updating, setUpdating] = useState<CheckpointStatus | null>(null);

  async function handleStatusClick(
    e: React.MouseEvent,
    next: CheckpointStatus,
  ) {
    // The whole card is a <Link> to the detail page, so quick-action
    // clicks must not bubble or they'll navigate away mid-update.
    e.preventDefault();
    e.stopPropagation();
    if (checkpoint.status === next || updating) return;
    setUpdating(next);
    try {
      await updateCheckpoint(checkpoint.id, {
        status: next,
        lastInspectionDate: new Date().toISOString(),
      });
    } finally {
      setUpdating(null);
    }
  }

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

            {/* Quick status actions — mark a BMP without opening the
                detail page. Buttons stop propagation so the parent
                <Link> doesn't navigate when the QSP just wants to log
                a status. */}
            <div className="flex items-center gap-1.5 pt-1">
              <QuickStatusButton
                label="Compliant"
                icon={<CheckCircle2 className="h-3 w-3" />}
                active={checkpoint.status === 'compliant'}
                loading={updating === 'compliant'}
                disabled={updating !== null}
                onClick={(e) => handleStatusClick(e, 'compliant')}
                tone="green"
              />
              <QuickStatusButton
                label="Deficient"
                icon={<XCircle className="h-3 w-3" />}
                active={checkpoint.status === 'deficient'}
                loading={updating === 'deficient'}
                disabled={updating !== null}
                onClick={(e) => handleStatusClick(e, 'deficient')}
                tone="red"
              />
              <QuickStatusButton
                label="Review"
                icon={<CircleHelp className="h-3 w-3" />}
                active={checkpoint.status === 'needs-review'}
                loading={updating === 'needs-review'}
                disabled={updating !== null}
                onClick={(e) => handleStatusClick(e, 'needs-review')}
                tone="purple"
              />
            </div>
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}

const TONE_CLASSES: Record<
  'green' | 'red' | 'purple',
  { active: string; idle: string }
> = {
  green: {
    active: 'border-green-500/40 bg-green-500/15 text-green-300',
    idle: 'border-green-500/20 bg-green-500/5 text-green-300/80 hover:bg-green-500/15 hover:text-green-300',
  },
  red: {
    active: 'border-red-500/40 bg-red-500/15 text-red-300',
    idle: 'border-red-500/20 bg-red-500/5 text-red-300/80 hover:bg-red-500/15 hover:text-red-300',
  },
  purple: {
    active: 'border-purple-500/40 bg-purple-500/15 text-purple-300',
    idle: 'border-purple-500/20 bg-purple-500/5 text-purple-300/80 hover:bg-purple-500/15 hover:text-purple-300',
  },
};

function QuickStatusButton({
  label,
  icon,
  active,
  loading,
  disabled,
  onClick,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  active: boolean;
  loading: boolean;
  disabled: boolean;
  onClick: (e: React.MouseEvent) => void;
  tone: 'green' | 'red' | 'purple';
}) {
  const classes = TONE_CLASSES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || active}
      title={active ? `Already ${label.toLowerCase()}` : `Mark ${label.toLowerCase()}`}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-1 rounded-md border px-1.5 py-1 text-[10px] font-medium uppercase tracking-wider transition-colors disabled:cursor-default disabled:opacity-90',
        active ? classes.active : classes.idle,
      )}
    >
      {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
      {label}
    </button>
  );
}
