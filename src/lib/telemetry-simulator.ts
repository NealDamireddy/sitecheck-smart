import type { DroneTelemetry } from '@/types/drone';

/**
 * Mock telemetry simulator.
 *
 * Walks a mission's flight path at ~1 Hz, emitting synthetic DroneTelemetry.
 * Replace with a real telemetry stream (MAVLink, DJI MSDK, etc.) when
 * connecting to actual hardware.
 */

interface SimulatorConfig {
  flightPath: [number, number][];       // [lng, lat][]
  altitude: number;                     // feet AGL (mission default)
  batteryStart: number;                 // 0-100
  batteryEnd: number;                   // 0-100
}

export interface TelemetrySimulator {
  start: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  getCurrentProgress: () => number;     // 0-1
}

function computeHeading(from: [number, number], to: [number, number]): number {
  const dLng = to[0] - from[0];
  const dLat = to[1] - from[1];
  const rad = Math.atan2(dLng, dLat);
  return ((rad * 180) / Math.PI + 360) % 360;
}

function haversineDistanceFeet(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 20902231; // Earth radius in feet
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function createTelemetrySimulator(
  config: SimulatorConfig,
  onUpdate: (telemetry: DroneTelemetry) => void,
  /**
   * Block 4: optional fire-and-forget persistence callback. Invoked once per
   * emit, after `onUpdate`. Failures inside `onPersist` must NOT break the
   * live UI — callers should swallow errors at the call site.
   */
  onPersist?: (telemetry: DroneTelemetry) => void
): TelemetrySimulator {
  const { flightPath, altitude, batteryStart, batteryEnd } = config;
  let pathIndex = 0;
  let paused = false;
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function emit() {
    const totalPoints = flightPath.length;
    if (pathIndex >= totalPoints) {
      stop();
      return;
    }

    const current = flightPath[pathIndex];
    const prev = pathIndex > 0 ? flightPath[pathIndex - 1] : current;
    const progress = totalPoints > 1 ? pathIndex / (totalPoints - 1) : 0;

    // Heading from previous to current point
    const heading = pathIndex > 0 ? computeHeading(prev, current) : 0;

    // Ground speed: distance covered in ~1 second, converted to mph
    const distFeet = pathIndex > 0
      ? haversineDistanceFeet(prev[1], prev[0], current[1], current[0])
      : 0;
    const speedMph = distFeet * 0.000189394 * 3600; // ft/s → mph (1 tick = 1s)

    // Battery drains linearly
    const battery = batteryStart + (batteryEnd - batteryStart) * progress;

    // Slight altitude variation (±2 ft noise)
    const altNoise = (Math.random() - 0.5) * 4;

    // GPS satellites: 8-14
    const gpsSats = 8 + Math.floor(Math.random() * 7);

    // Signal strength: 80-100%, occasional dip
    const signalBase = 80 + Math.random() * 20;
    const signalDip = Math.random() < 0.05 ? -15 : 0;
    const signal = Math.max(50, Math.min(100, signalBase + signalDip));

    const telemetry: DroneTelemetry = {
      lat: current[1],
      lng: current[0],
      altitudeFeet: Math.round(altitude + altNoise),
      speedMph: Math.round(speedMph * 10) / 10,
      headingDeg: Math.round(heading),
      batteryPercent: Math.round(battery),
      signalStrengthPercent: Math.round(signal),
      gpsSatellites: gpsSats,
      timestamp: new Date().toISOString(),
    };

    onUpdate(telemetry);

    // Block 4: fire-and-forget persistence hook
    if (onPersist) {
      try {
        onPersist(telemetry);
      } catch {
        // Persistence failures must never break the live UI
      }
    }

    if (!paused) {
      pathIndex++;
    }
  }

  function start() {
    pathIndex = 0;
    paused = false;
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(emit, 1000);
    emit(); // emit first frame immediately
  }

  function pause() {
    paused = true;
  }

  function resume() {
    paused = false;
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  function getCurrentProgress(): number {
    const total = flightPath.length;
    if (total <= 1) return 0;
    return pathIndex / (total - 1);
  }

  return { start, pause, resume, stop, getCurrentProgress };
}
