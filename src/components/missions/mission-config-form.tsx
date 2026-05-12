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
import { InspectionType, EndOfMissionAction } from '@/types/drone';
import { INSPECTION_TYPE_LABELS, END_OF_MISSION_LABELS } from '@/lib/constants';

export interface MissionConfig {
  name: string;
  inspectionType: InspectionType;
  altitude: number;
  endOfMissionAction: EndOfMissionAction;
  notes: string;
}

interface MissionConfigFormProps {
  config: MissionConfig;
  onChange: (config: MissionConfig) => void;
}

export function MissionConfigForm({ config, onChange }: MissionConfigFormProps) {
  return (
    <div className="space-y-5">
      {/* Mission Name */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Mission Name
        </label>
        <Input
          value={config.name}
          onChange={(e) => onChange({ ...config, name: e.target.value })}
          placeholder="e.g. Weekly routine — east sector"
          className="bg-background border-border"
        />
      </div>

      {/* Inspection Type */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Inspection Type
        </label>
        <Select
          value={config.inspectionType}
          onValueChange={(val) =>
            onChange({ ...config, inspectionType: val as InspectionType })
          }
        >
          <SelectTrigger className="w-full bg-background border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(INSPECTION_TYPE_LABELS) as [InspectionType, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Altitude */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Altitude
        </label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={config.altitude}
            onChange={(e) =>
              onChange({ ...config, altitude: Number(e.target.value) })
            }
            min={30}
            max={400}
            step={10}
            className="bg-background border-border"
          />
          <span className="shrink-0 text-sm text-muted-foreground">
            ft AGL
          </span>
        </div>
      </div>

      {/* End-of-Mission Action */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          End-of-Mission Action
        </label>
        <Select
          value={config.endOfMissionAction}
          onValueChange={(val) =>
            onChange({ ...config, endOfMissionAction: val as EndOfMissionAction })
          }
        >
          <SelectTrigger className="w-full bg-background border-border">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(END_OF_MISSION_LABELS) as [EndOfMissionAction, string][]).map(
              ([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              )
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">
          Notes
          <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
        </label>
        <Textarea
          value={config.notes}
          onChange={(e) => onChange({ ...config, notes: e.target.value })}
          placeholder="Add any notes for this mission..."
          rows={3}
          className="bg-background border-border"
        />
      </div>
    </div>
  );
}
