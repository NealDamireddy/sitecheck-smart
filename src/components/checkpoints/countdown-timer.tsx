'use client';

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { formatCountdown } from '@/lib/format';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  deadline: string;
}

export function CountdownTimer({ deadline }: CountdownTimerProps) {
  const [countdown, setCountdown] = useState(() => formatCountdown(deadline));

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(formatCountdown(deadline));
    }, 1000);

    return () => clearInterval(timer);
  }, [deadline]);

  if (countdown.expired) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="destructive" className="animate-pulse-red px-3 py-1 text-sm font-bold">
          EXPIRED
        </Badge>
      </div>
    );
  }

  const totalHours = countdown.hours;
  const isUrgent = totalHours < 24;
  const isWarning = totalHours < 48 && !isUrgent;

  const pad = (n: number) => n.toString().padStart(2, '0');

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-4 py-2',
        isUrgent
          ? 'border-red-500/30 bg-red-500/5 animate-pulse-red'
          : isWarning
            ? 'border-amber-500/30 bg-amber-500/5'
            : 'border-border bg-surface'
      )}
    >
      <span
        className={cn(
          'font-mono text-2xl font-bold tracking-wider',
          isUrgent
            ? 'text-red-500'
            : isWarning
              ? 'text-amber-500'
              : 'text-foreground'
        )}
      >
        {pad(countdown.hours)}
        <span className="opacity-50">:</span>
        {pad(countdown.minutes)}
        <span className="opacity-50">:</span>
        {pad(countdown.seconds)}
      </span>
      <span
        className={cn(
          'ml-2 text-xs uppercase tracking-wider',
          isUrgent
            ? 'text-red-500/70'
            : isWarning
              ? 'text-amber-500/70'
              : 'text-muted-foreground'
        )}
      >
        remaining
      </span>
    </div>
  );
}
