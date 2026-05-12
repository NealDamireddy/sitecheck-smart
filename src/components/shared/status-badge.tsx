import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CheckpointStatus } from '@/types/checkpoint';

const statusConfig: Record<CheckpointStatus, { label: string; className: string }> = {
  compliant: {
    label: 'Compliant',
    className: 'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20',
  },
  deficient: {
    label: 'Deficient',
    className: 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20',
  },
  'needs-review': {
    label: 'Needs Review',
    className: 'bg-purple-500/10 text-purple-500 border-purple-500/20 hover:bg-purple-500/20',
  },
};

interface StatusBadgeProps {
  status: CheckpointStatus;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant="outline" className={cn(config.className, className)}>
      {config.label}
    </Badge>
  );
}
