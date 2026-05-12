import type { DroneProvider, DroneCapabilities, DroneTelemetry } from '@/types/drone';
import { createTelemetrySimulator, type TelemetrySimulator } from './telemetry-simulator';

// Block 4: bundled placeholder photos for the stub provider. The set covers
// the five major BMP categories so the per-photo Claude vision pass returns a
// believable analysis even without a real drone camera.
const DEMO_PHOTOS = [
  '/demo-photos/sediment-control/photo-1.jpg',
  '/demo-photos/sediment-control/photo-2.jpg',
  '/demo-photos/erosion-control/photo-1.jpg',
  '/demo-photos/erosion-control/photo-2.jpg',
  '/demo-photos/storm-drain/photo-1.jpg',
  '/demo-photos/stabilization/photo-1.jpg',
  '/demo-photos/housekeeping/photo-1.jpg',
];

function getDemoPhotoUrl(waypointNumber: number): string {
  return DEMO_PHOTOS[Math.abs(waypointNumber) % DEMO_PHOTOS.length];
}

/**
 * Stub drone hardware provider.
 *
 * All methods log the action and resolve immediately.
 * Replace the internals with real drone SDK integration
 * (DJI MSDK, MAVLink, etc.) when connecting to actual hardware.
 */
function createStubProvider(): DroneProvider {
  let connected = true; // Simulated connection state
  let activeSim: TelemetrySimulator | null = null;

  const log = (action: string, ...args: unknown[]) => {
    console.log(`[DroneProvider] ${action}`, ...args);
  };

  return {
    async startMission(missionId: string) {
      log('startMission', missionId);
      // TODO: Send start command to drone hardware
    },

    async pauseMission(missionId: string) {
      log('pauseMission', missionId);
      // TODO: Send pause/hover command to drone hardware
    },

    async resumeMission(missionId: string) {
      log('resumeMission', missionId);
      // TODO: Send resume command to drone hardware
    },

    async stopMission(missionId: string) {
      log('stopMission', missionId);
      // TODO: Send stop/land command to drone hardware
    },

    async returnHome(missionId: string) {
      log('returnHome', missionId);
      // TODO: Send return-to-home command to drone hardware
    },

    async emergencyHold(missionId: string) {
      log('emergencyHold', missionId);
      // TODO: Send emergency position-hold command to drone hardware
    },

    async manualTakeover(missionId: string) {
      log('manualTakeover', missionId);
      // TODO: Switch drone to manual RC control mode
    },

    async resumeFromManual(missionId: string) {
      log('resumeFromManual', missionId);
      // TODO: Switch drone back to autonomous mission mode
    },

    async captureImage(missionId: string, waypointNumber: number): Promise<string | null> {
      log('captureImage', missionId, `waypoint #${waypointNumber}`);
      // Block 4: stub provider returns a deterministic local placeholder URL
      // from the bundled `/public/demo-photos` set. The capture-controls flow
      // fetches this URL into a Blob and POSTs it to the real upload endpoint
      // (`/api/missions/[id]/waypoints/[number]/photos`), which re-hosts it
      // to Supabase Storage so the demo and production flows share one path.
      return getDemoPhotoUrl(waypointNumber);
    },

    isConnected(): boolean {
      return connected;
    },

    getCapabilities(): DroneCapabilities {
      // Stub capabilities — all advanced features disabled
      // Enable as hardware integration is added
      return {
        supportsVideo: false,
        supportsBurst: false,
        supportsGimbal: false,
        supportsZoom: false,
        supportsManualControl: false,
        maxAltitude: 400, // feet AGL
        minAltitude: 30,  // feet AGL
      };
    },

    // --- Mission Control: telemetry subscription ---

    subscribeTelemetry(
      missionId: string,
      flightPath: [number, number][],
      mission: { altitude: number; batteryStart: number; batteryEnd: number },
      onUpdate: (telemetry: DroneTelemetry) => void
    ): () => void {
      log('subscribeTelemetry', missionId);
      // Stop any existing simulator
      if (activeSim) {
        activeSim.stop();
      }
      activeSim = createTelemetrySimulator(
        {
          flightPath,
          altitude: mission.altitude,
          batteryStart: mission.batteryStart,
          batteryEnd: mission.batteryEnd,
        },
        onUpdate,
        // Block 4: fire-and-forget persistence — POST every emitted sample to
        // /api/missions/[id]/telemetry/sample so the actual flight track is
        // recorded for replay. Failures are swallowed so the live UI keeps
        // running off the in-memory ring buffer if the network is down.
        (sample) => {
          if (typeof window === 'undefined') return; // SSR safety
          fetch(`/api/missions/${missionId}/telemetry/sample`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sample),
            keepalive: true,
          }).catch(() => {
            /* swallow — never break the live UI */
          });
        }
      );
      activeSim.start();
      return () => {
        if (activeSim) {
          activeSim.stop();
          activeSim = null;
        }
      };
    },

    // --- Mission Control: manual override actions ---

    async reposition(missionId: string, offsetLat: number, offsetLng: number) {
      log('reposition', missionId, { offsetLat, offsetLng });
      // TODO: Send small position adjustment command to drone hardware
    },

    async hoverLonger(missionId: string, additionalSeconds: number) {
      log('hoverLonger', missionId, `+${additionalSeconds}s`);
      // TODO: Extend hover timer at current waypoint
    },

    async retakePhoto(missionId: string, waypointNumber: number): Promise<string | null> {
      log('retakePhoto', missionId, `waypoint #${waypointNumber}`);
      // TODO: Trigger camera re-capture on drone hardware
      return null;
    },

    async adjustCameraAngle(missionId: string, pitchDeg: number) {
      log('adjustCameraAngle', missionId, `pitch ${pitchDeg}°`);
      // TODO: Adjust gimbal pitch on drone hardware
    },
  };
}

// Singleton instance
let provider: DroneProvider | null = null;

/**
 * Get the drone provider instance.
 * Uses a singleton so all components share the same connection state.
 */
export function getDroneProvider(): DroneProvider {
  if (!provider) {
    provider = createStubProvider();
  }
  return provider;
}
