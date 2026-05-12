'use client';

import { useState, useCallback } from 'react';
import { Tag } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { OutcomeTagBar } from './outcome-tag-bar';
import { WAYPOINT_OUTCOME_LABELS, WAYPOINT_OUTCOME_COLORS } from '@/lib/constants';
import type { WaypointOutcome } from '@/types/drone';

interface WaypointOutcomeTagProps {
  missionId: string;
  waypointNumber: number;
  currentOutcome: WaypointOutcome;
  onOutcomeChanged?: (waypointNumber: number, outcome: WaypointOutcome) => void;
}

export function WaypointOutcomeTag({
  missionId,
  waypointNumber,
  currentOutcome,
  onOutcomeChanged,
}: WaypointOutcomeTagProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleTag = useCallback(
    async (outcome: WaypointOutcome) => {
      setSaving(true);
      try {
        // Persist to API
        await fetch(`/api/missions/${missionId}/waypoints/${waypointNumber}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ captureStatus: outcome }),
        });

        // Log audit event
        await fetch('/api/activity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'drone',
            title: `Waypoint #${waypointNumber} tagged`,
            description: `Waypoint #${waypointNumber} tagged as "${WAYPOINT_OUTCOME_LABELS[outcome]}"`,
            severity: ['deficient', 'unsafe', 'blocked'].includes(outcome) ? 'warning' : 'info',
            linkedEntityId: missionId,
            linkedEntityType: 'mission',
            metadata: {
              action: 'waypoint-tagged',
              missionId,
              waypointNumber,
              previousStatus: currentOutcome,
              newStatus: outcome,
              timestamp: new Date().toISOString(),
            },
          }),
        }).catch(() => {});

        onOutcomeChanged?.(waypointNumber, outcome);
        setShowPicker(false);
      } catch (err) {
        console.error('Failed to tag waypoint:', err);
      } finally {
        setSaving(false);
      }
    },
    [missionId, waypointNumber, currentOutcome, onOutcomeChanged]
  );

  const outcomeColors = WAYPOINT_OUTCOME_COLORS[currentOutcome];
  const isPending = currentOutcome === 'pending' || currentOutcome === 'captured';

  return (
    <div className="relative">
      {showPicker ? (
        <div className="space-y-1">
          <OutcomeTagBar
            currentOutcome={currentOutcome}
            onTag={handleTag}
            disabled={saving}
            compact
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-5 text-[10px] text-muted-foreground"
            onClick={() => setShowPicker(false)}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Badge
            variant="outline"
            className={`text-[10px] ${outcomeColors} border-current/20 cursor-default`}
          >
            {WAYPOINT_OUTCOME_LABELS[currentOutcome]}
          </Badge>
          {isPending && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => setShowPicker(true)}
              title="Tag outcome"
            >
              <Tag className="h-3 w-3 text-muted-foreground" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
