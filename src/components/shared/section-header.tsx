'use client';

import { cn } from '@/lib/utils';
import { useAppMode } from '@/hooks/use-app-mode';

interface SectionHeaderProps {
  title: string;
  description?: string;
  className?: string;
  action?: React.ReactNode;
}

export function SectionHeader({ title, description, className, action }: SectionHeaderProps) {
  const { isApp } = useAppMode();

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="min-w-0">
        <h2 className={cn(
          'font-heading font-semibold tracking-wide text-foreground',
          isApp ? 'text-base' : 'text-xl'
        )}>
          {title}
        </h2>
        {description && !isApp && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
