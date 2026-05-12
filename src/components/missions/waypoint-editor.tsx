'use client';

import { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WaypointSettingsPanel } from './waypoint-settings-panel';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { BMP_CATEGORY_COLORS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import type { Waypoint } from '@/types/drone';

interface WaypointEditorProps {
  waypoints: Waypoint[];
  selectedWaypoint: number | null;
  onSelectWaypoint: (num: number | null) => void;
  onToggle: (waypointNumber: number) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onUpdateWaypoint: (waypointNumber: number, updates: Partial<Waypoint>) => void;
}

export function WaypointEditor({
  waypoints,
  selectedWaypoint,
  onSelectWaypoint,
  onToggle,
  onReorder,
  onUpdateWaypoint,
}: WaypointEditorProps) {
  const [expandedNumber, setExpandedNumber] = useState<number | null>(null);
  const checkpoints = useCheckpointStore((s) => s.checkpoints);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);

  useEffect(() => {
    if (checkpoints.length === 0) fetchCheckpoints();
  }, [checkpoints.length, fetchCheckpoints]);

  // Build checkpoint lookup map
  const checkpointMap = new Map(checkpoints.map((c) => [c.id, c]));

  function handleRowClick(wp: Waypoint) {
    if (selectedWaypoint === wp.number) {
      onSelectWaypoint(null);
    } else {
      onSelectWaypoint(wp.number);
    }
  }

  function handleExpandToggle(e: React.MouseEvent, num: number) {
    e.stopPropagation();
    setExpandedNumber(expandedNumber === num ? null : num);
  }

  return (
    <div className="flex flex-col border border-border rounded-lg overflow-hidden bg-surface">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <span className="text-xs font-medium text-foreground">
          Waypoints
        </span>
        <Badge
          variant="secondary"
          className="h-5 px-1.5 text-[10px] bg-blue-500/10 text-blue-400"
        >
          {waypoints.filter((w) => w.enabled !== false).length} / {waypoints.length} active
        </Badge>
      </div>

      {/* Waypoint list */}
      <ScrollArea className="h-[400px]">
        <div className="divide-y divide-border">
          {waypoints.map((wp, idx) => {
            const checkpoint = checkpointMap.get(wp.checkpointId);
            const color = checkpoint
              ? BMP_CATEGORY_COLORS[checkpoint.bmpType]
              : '#6B7280';
            const isSelected = selectedWaypoint === wp.number;
            const isExpanded = expandedNumber === wp.number;
            const isDisabled = wp.enabled === false;

            return (
              <div
                key={wp.number}
                className={cn(
                  'transition-colors',
                  isSelected && 'border-l-2 border-l-blue-500 bg-blue-500/5',
                  isDisabled && 'opacity-50'
                )}
              >
                {/* Main row */}
                <div
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
                  onClick={() => handleRowClick(wp)}
                >
                  {/* Expand chevron */}
                  <button
                    onClick={(e) => handleExpandToggle(e, wp.number)}
                    className="flex-shrink-0 p-0.5 rounded hover:bg-muted"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    )}
                  </button>

                  {/* Number badge */}
                  <div
                    className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold text-white"
                    style={{ backgroundColor: color }}
                  >
                    {wp.number}
                  </div>

                  {/* Name + BMP info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {checkpoint?.name ?? `Waypoint ${wp.number}`}
                    </p>
                    {checkpoint && (
                      <p className="text-[10px] text-muted-foreground truncate">
                        {checkpoint.bmpType.replace(/-/g, ' ')}
                      </p>
                    )}
                  </div>

                  {/* Reorder buttons */}
                  <div className="flex-shrink-0 flex items-center gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={idx === 0 || isDisabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorder(idx, idx - 1);
                      }}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      disabled={idx === waypoints.length - 1 || isDisabled}
                      onClick={(e) => {
                        e.stopPropagation();
                        onReorder(idx, idx + 1);
                      }}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Enable/Disable toggle */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggle(wp.number);
                    }}
                  >
                    {isDisabled ? (
                      <EyeOff className="h-3 w-3 text-muted-foreground" />
                    ) : (
                      <Eye className="h-3 w-3 text-blue-400" />
                    )}
                  </Button>
                </div>

                {/* Expanded settings */}
                {isExpanded && (
                  <div className="px-3 pb-3 pl-10">
                    <WaypointSettingsPanel
                      waypoint={wp}
                      onUpdate={(updates) => onUpdateWaypoint(wp.number, updates)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
