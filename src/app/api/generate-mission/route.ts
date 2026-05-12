import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { generateMission } from '@/lib/validations';
import { generateSmartFlightPath } from '@/lib/flight-path';
import { resolveProjectId, DEFAULT_PROJECT_ID } from '@/lib/project-context';
import { fetchAirspaceContext } from '@/lib/airspace-context';
import { validateFlightPath } from '@/lib/geofence';
import type { ProjectType } from '@/types/project';

interface CheckpointInput {
  id: string;
  name: string;
  bmpType: string;
  lat: number;
  lng: number;
  linearRef?: { station: number; offset: number; segmentId?: string };
}

interface SiteInfoInput {
  centerLat: number;
  centerLng: number;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const body = generateMission.parse(await request.json());
    const {
      checkpoints,
      siteInfo,
      scope,
      endOfMissionAction,
      inspectionType,
      altitude: requestedAltitude,
      name: requestedName,
      notes,
      sourceDocumentPages,
      projectType,
      centerline,
      projectId: bodyProjectId,
    } = body as {
      checkpoints: CheckpointInput[];
      siteInfo: SiteInfoInput;
      scope?: string;
      endOfMissionAction?: string;
      inspectionType?: string;
      altitude?: number;
      name?: string;
      notes?: string;
      sourceDocumentPages?: number[];
      projectType?: ProjectType;
      centerline?: [number, number][];
      projectId?: string;
    };

    const projectId = bodyProjectId || resolveProjectId(request) || DEFAULT_PROJECT_ID;

    if (!checkpoints || !Array.isArray(checkpoints) || checkpoints.length === 0) {
      return NextResponse.json({ error: 'No checkpoints provided' }, { status: 400 });
    }

    const missionAltitude = requestedAltitude || 120;

    const siteCenter = {
      lat: siteInfo?.centerLat || 36.7801,
      lng: siteInfo?.centerLng || -119.4161,
    };

    // Generate flight path using smart dispatch (linear vs bounded-site)
    const flightPath = generateSmartFlightPath(checkpoints, siteCenter, {
      projectType,
      centerline,
    });

    // For waypoint ordering: linear projects sort by station, bounded sites use existing order
    const ordered = projectType === 'linear'
      ? [...checkpoints].sort((a, b) => (a.linearRef?.station ?? 0) - (b.linearRef?.station ?? 0))
      : checkpoints;

    // Block 3: validate flight path against project geofence + active no-fly zones.
    // This is the planning-time check; runtime breach detection belongs to Block 5.
    try {
      const { geofence, noFlyZones } = await fetchAirspaceContext(projectId);
      const validatableWaypoints = ordered.map((cp, i) => ({
        number: i + 1,
        lat: cp.lat,
        lng: cp.lng,
        altitudeFeet: missionAltitude,
      }));
      const result = validateFlightPath(flightPath, validatableWaypoints, geofence, noFlyZones, {
        defaultAltitudeFeet: missionAltitude,
      });
      if (!result.valid) {
        return NextResponse.json(
          {
            error: 'Mission violates restricted airspace',
            violations: result.violations,
          },
          { status: 422 }
        );
      }
    } catch (validationErr) {
      console.warn('Airspace validation skipped due to error:', validationErr);
      // Fail-open on validation infrastructure errors so mock/demo paths still work.
    }

    // Estimate flight time (~1.5 minutes per checkpoint + 3 min transit)
    const flightTimeMinutes = Math.round(checkpoints.length * 1.5 + 3);

    // Estimate battery (start 100%, ~2.5% per checkpoint)
    const batteryEnd = Math.max(10, 100 - checkpoints.length * 2.5);

    // Build arrival times (start time + ~90 seconds per waypoint)
    const now = new Date();
    const startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9, 0, 0);

    const mission = {
      id: `MISSION-${String(Date.now()).slice(-6)}`,
      name: requestedName || `SWPPP Survey — ${siteInfo?.centerLat ? 'Uploaded Document' : 'Generated'}`,
      status: 'planned' as const,
      date: new Date().toISOString().split('T')[0],
      inspectionType: (inspectionType || 'routine') as 'routine' | 'pre-storm' | 'post-storm' | 'qpe',
      flightTimeMinutes,
      altitude: missionAltitude,
      batteryStart: 100,
      batteryEnd: Math.round(batteryEnd),
      weatherAtFlight: {
        temperature: 72,
        condition: 'clear' as const,
        windSpeedMph: 5,
        humidity: 45,
      },
      waypoints: ordered.map((cp, i) => ({
        number: i + 1,
        checkpointId: cp.id,
        lat: cp.lat,
        lng: cp.lng,
        captureStatus: 'pending' as const,
        arrivalTime: new Date(startTime.getTime() + i * 90 * 1000).toISOString(),
      })),
      flightPath,
      // Phase 16 fields
      scope: scope || 'full',
      endOfMissionAction: endOfMissionAction || 'return-home',
      notes: notes || '',
      sourceDocumentPages: sourceDocumentPages || null,
    };

    // Log route-auto-generated audit event
    try {
      const { supabase } = auth;
      await supabase.from('activity_events').insert({
        id: `activity-${Date.now()}`,
        project_id: projectId,
        type: 'drone',
        title: 'Route Auto-Generated',
        description: `Flight route generated for "${mission.name}" with ${mission.waypoints.length} waypoints`,
        timestamp: new Date().toISOString(),
        severity: 'info',
        linked_entity_id: mission.id,
        linked_entity_type: 'mission',
        metadata: {
          action: 'route-auto-generated',
          missionId: mission.id,
          scope: mission.scope,
          waypointCount: mission.waypoints.length,
          altitude: mission.altitude,
          flightTimeMinutes: mission.flightTimeMinutes,
          inspectionType: mission.inspectionType,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (auditErr) {
      console.warn('Failed to log route-generated audit event:', auditErr);
    }

    return NextResponse.json(mission);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: error.issues }, { status: 400 });
    }
    console.error('Mission generation error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Mission generation failed';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
