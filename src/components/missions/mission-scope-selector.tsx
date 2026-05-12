'use client';

import {
  Globe,
  CheckSquare,
  AlertTriangle,
  XCircle,
  RotateCcw,
  MapPin,
  Ruler,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MissionScope } from '@/types/drone';
import { MISSION_SCOPE_LABELS } from '@/lib/constants';
import { useProjectStore } from '@/stores/project-store';

interface MissionScopeSelectorProps {
  selected: MissionScope;
  onSelect: (scope: MissionScope) => void;
}

interface ScopeOption {
  scope: MissionScope;
  icon: LucideIcon;
  description: string;
}

const BASE_SCOPE_OPTIONS: ScopeOption[] = [
  {
    scope: 'full',
    icon: Globe,
    description: 'Inspect all BMPs on site',
  },
  {
    scope: 'selected-bmps',
    icon: CheckSquare,
    description: 'Choose specific BMPs to inspect',
  },
  {
    scope: 'priority',
    icon: AlertTriangle,
    description: 'Focus on high-priority BMPs only',
  },
  {
    scope: 'deficient',
    icon: XCircle,
    description: 'Re-inspect deficient BMPs',
  },
  {
    scope: 'reinspection',
    icon: RotateCcw,
    description: 'Fly BMPs from previous mission outcomes',
  },
  {
    scope: 'ad-hoc',
    icon: MapPin,
    description: 'Custom route — add points manually',
  },
];

const SEGMENT_SCOPE_OPTION: ScopeOption = {
  scope: 'segment',
  icon: Ruler,
  description: 'Select corridor segments to inspect',
};

export function MissionScopeSelector({ selected, onSelect }: MissionScopeSelectorProps) {
  const project = useProjectStore((s) => s.currentProject());
  const isLinear = project?.projectType === 'linear';

  const scopeOptions = isLinear
    ? [SEGMENT_SCOPE_OPTION, ...BASE_SCOPE_OPTIONS]
    : BASE_SCOPE_OPTIONS;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {scopeOptions.map(({ scope, icon: Icon, description }) => {
        const isSelected = selected === scope;

        return (
          <button
            key={scope}
            type="button"
            onClick={() => onSelect(scope)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors',
              'bg-surface hover:bg-white/5',
              isSelected
                ? 'border-blue-500 ring-2 ring-blue-500/30'
                : 'border-border'
            )}
          >
            <Icon
              className={cn(
                'h-5 w-5',
                isSelected ? 'text-blue-500' : 'text-muted-foreground'
              )}
            />
            <div>
              <p
                className={cn(
                  'text-sm font-medium',
                  isSelected ? 'text-blue-500' : 'text-foreground'
                )}
              >
                {MISSION_SCOPE_LABELS[scope]}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
