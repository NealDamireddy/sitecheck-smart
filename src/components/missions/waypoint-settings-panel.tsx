'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CAPTURE_MODE_LABELS } from '@/lib/constants';
import type { Waypoint, CaptureMode } from '@/types/drone';

interface WaypointSettingsPanelProps {
  waypoint: Waypoint;
  onUpdate: (updates: Partial<Waypoint>) => void;
}

export function WaypointSettingsPanel({ waypoint, onUpdate }: WaypointSettingsPanelProps) {
  return (
    <div className="space-y-3 pt-2 pb-1">
      {/* Altitude Override */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Altitude Override (ft)
        </label>
        <Input
          type="number"
          min={30}
          max={400}
          step={10}
          placeholder="Mission default"
          value={waypoint.altitudeOverride ?? ''}
          onChange={(e) =>
            onUpdate({
              altitudeOverride: e.target.value ? Number(e.target.value) : undefined,
            })
          }
          className="h-7 text-xs bg-background border-border"
        />
      </div>

      {/* Hover Time */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Hover Time (sec)
        </label>
        <Input
          type="number"
          min={3}
          max={60}
          step={1}
          value={waypoint.hoverTimeSeconds ?? 10}
          onChange={(e) =>
            onUpdate({
              hoverTimeSeconds: Number(e.target.value) || 10,
            })
          }
          className="h-7 text-xs bg-background border-border"
        />
      </div>

      {/* Capture Mode */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Capture Mode
        </label>
        <Select
          value={waypoint.captureMode ?? 'auto'}
          onValueChange={(val) => onUpdate({ captureMode: val as CaptureMode })}
        >
          <SelectTrigger className="h-7 text-xs bg-background border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CAPTURE_MODE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key} className="text-xs">
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Operator Notes */}
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Operator Notes
        </label>
        <Textarea
          rows={2}
          placeholder="Add notes for this waypoint..."
          value={waypoint.operatorNotes ?? ''}
          onChange={(e) => onUpdate({ operatorNotes: e.target.value })}
          className="text-xs bg-background border-border resize-none"
        />
      </div>
    </div>
  );
}
