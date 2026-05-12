'use client';

import {
  CheckCircle2,
  XCircle,
  Wrench,
  EyeOff,
  Ban,
  AlertTriangle,
  ClipboardCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WAYPOINT_OUTCOME_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { WaypointOutcome } from '@/types/drone';

interface OutcomeTagBarProps {
  currentOutcome: WaypointOutcome;
  onTag: (outcome: WaypointOutcome) => void;
  disabled?: boolean;
  compact?: boolean;
}

const TAGGABLE_OUTCOMES: {
  outcome: WaypointOutcome;
  icon: typeof CheckCircle2;
  color: string;
}[] = [
  { outcome: 'compliant', icon: CheckCircle2, color: 'text-green-400 hover:bg-green-500/10' },
  { outcome: 'deficient', icon: XCircle, color: 'text-red-400 hover:bg-red-500/10' },
  { outcome: 'needs-maintenance', icon: Wrench, color: 'text-orange-400 hover:bg-orange-500/10' },
  { outcome: 'not-visible', icon: EyeOff, color: 'text-purple-400 hover:bg-purple-500/10' },
  { outcome: 'blocked', icon: Ban, color: 'text-rose-400 hover:bg-rose-500/10' },
  { outcome: 'unsafe', icon: AlertTriangle, color: 'text-red-500 hover:bg-red-500/10' },
  { outcome: 'ground-follow-up', icon: ClipboardCheck, color: 'text-yellow-400 hover:bg-yellow-500/10' },
];

export function OutcomeTagBar({ currentOutcome, onTag, disabled, compact }: OutcomeTagBarProps) {
  return (
    <div className={cn('flex flex-wrap gap-1', compact && 'gap-0.5')}>
      {TAGGABLE_OUTCOMES.map(({ outcome, icon: Icon, color }) => {
        const isActive = currentOutcome === outcome;
        return (
          <Button
            key={outcome}
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            className={cn(
              'h-6 gap-1 px-1.5 text-[10px]',
              color,
              isActive && 'ring-1 ring-current bg-current/10'
            )}
            onClick={() => onTag(outcome)}
            title={WAYPOINT_OUTCOME_LABELS[outcome]}
          >
            <Icon className="h-3 w-3" />
            {!compact && (
              <span className="hidden sm:inline">
                {WAYPOINT_OUTCOME_LABELS[outcome]}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
