'use client';

import { AlertTriangle, BookOpen, Calendar, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CountdownTimer } from '@/components/checkpoints/countdown-timer';
import { Deficiency } from '@/types/deficiency';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

interface DeficiencyPanelProps {
  deficiency: Deficiency;
}

const deficiencyStatusConfig: Record<
  Deficiency['status'],
  { label: string; className: string }
> = {
  open: {
    label: 'Open',
    className: 'bg-red-500/10 text-red-500 border-red-500/20',
  },
  'in-progress': {
    label: 'In Progress',
    className: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  },
  resolved: {
    label: 'Resolved',
    className: 'bg-green-500/10 text-green-500 border-green-500/20',
  },
};

export function DeficiencyPanel({ deficiency }: DeficiencyPanelProps) {
  const statusConfig = deficiencyStatusConfig[deficiency.status];

  return (
    <Card className="border-red-500/20 bg-red-500/[0.03]">
      <CardContent className="space-y-5 pt-4">
        {/* Header: ID + Status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="font-mono text-sm font-medium text-red-500">
              {deficiency.id}
            </span>
          </div>
          <Badge variant="outline" className={statusConfig.className}>
            {statusConfig.label}
          </Badge>
        </div>

        {/* Description */}
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
            Description
          </h4>
          <p className="text-sm text-foreground/90 leading-relaxed">
            {deficiency.description}
          </p>
        </div>

        {/* CGP Violation */}
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start gap-2">
            <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-red-500 mb-1">
                CGP Violation
              </h4>
              <p className="text-sm text-foreground/80">{deficiency.cgpViolation}</p>
            </div>
          </div>
        </div>

        {/* Corrective Action */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Wrench className="h-3.5 w-3.5 text-amber-500" />
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Corrective Action Required
            </h4>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">
            {deficiency.correctiveAction}
          </p>
        </div>

        {/* Deadline with Countdown */}
        <div>
          <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
            Correction Deadline
          </h4>
          <CountdownTimer deadline={deficiency.deadline} />
        </div>

        {/* Detected date */}
        <div className="flex items-center gap-2 pt-2 border-t border-border text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Detected {formatDate(deficiency.detectedDate)}</span>
        </div>

        {/* Resolved info */}
        {deficiency.status === 'resolved' && deficiency.resolvedDate && (
          <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
            <p className="text-xs font-medium text-green-500 mb-1">
              Resolved {formatDate(deficiency.resolvedDate)}
            </p>
            {deficiency.resolvedNotes && (
              <p className="text-sm text-foreground/80">{deficiency.resolvedNotes}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
