'use client';

import { useState } from 'react';
import { Plane, Loader2, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useSwpppStore } from '@/stores/swppp-store';
import { useDroneStore } from '@/stores/drone-store';
import { useProjectStore } from '@/stores/project-store';
import type { PathViolation } from '@/lib/geofence';

export function GenerateMissionButton() {
  const { extractedCheckpoints, siteInfo, generatedMission, setGeneratedMission, selectedPages } = useSwpppStore();
  const { addMission } = useDroneStore();
  const project = useProjectStore((s) => s.currentProject());
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [violations, setViolations] = useState<PathViolation[]>([]);

  async function handleGenerate() {
    if (extractedCheckpoints.length === 0) return;
    setIsGenerating(true);
    setError(null);
    setViolations([]);

    try {
      const response = await fetch('/api/generate-mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkpoints: extractedCheckpoints,
          siteInfo: siteInfo ? { centerLat: siteInfo.centerLat, centerLng: siteInfo.centerLng } : undefined,
          sourceDocumentPages: selectedPages,
          projectId: project?.id,
          projectType: project?.projectType,
          centerline: project?.corridor?.centerline,
        }),
      });

      if (response.status === 422) {
        const payload = (await response.json()) as { error?: string; violations?: PathViolation[] };
        setViolations(payload.violations ?? []);
        throw new Error(payload.error || 'Mission violates restricted airspace');
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Mission generation failed');
      }

      const mission = await response.json();
      setGeneratedMission(mission);
      addMission(mission);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }

  if (generatedMission) {
    return (
      <Card className="border-0 bg-green-500/5 ring-1 ring-green-500/20">
        <CardContent className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-green-500/10">
              <Plane className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-green-500">Mission Generated</p>
              <p className="text-xs text-muted-foreground">
                {generatedMission.waypoints.length} waypoints • {generatedMission.flightTimeMinutes} min flight time
              </p>
            </div>
          </div>
          <Link href={`/missions/${generatedMission.id}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="h-3.5 w-3.5" />
              View Mission
            </Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 bg-[#141414] ring-1 ring-white/5">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500/10">
              <Plane className="h-5 w-5 text-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                {extractedCheckpoints.length} checkpoints extracted
              </p>
              <p className="text-xs text-muted-foreground">
                Generate an optimized drone flight path
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {error && violations.length === 0 && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            <Button onClick={handleGenerate} disabled={isGenerating}>
              {isGenerating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plane className="h-4 w-4" />
              )}
              {isGenerating ? 'Generating...' : 'Generate Drone Mission'}
            </Button>
          </div>
        </div>

        {violations.length > 0 && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 space-y-2">
            <p className="text-xs font-semibold text-red-300 uppercase tracking-wider">
              Airspace Violations ({violations.length})
            </p>
            <ul className="space-y-1.5">
              {violations.map((v, i) => (
                <li key={i} className="text-[11px] text-red-200">
                  {v.waypointNumber !== undefined && (
                    <span className="font-mono mr-1">WP{v.waypointNumber}:</span>
                  )}
                  {v.zoneName ? <span className="font-medium">{v.zoneName} — </span> : null}
                  {v.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
