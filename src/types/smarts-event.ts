/**
 * Persisted SMARTS-compliant rain event record.
 *
 * Distinct from `DetectedRainEvent` in `src/lib/rain-event-detector.ts`,
 * which is computed in-memory from the OpenWeatherMap forecast and powers
 * the legacy dashboard banner. Smarts events are persisted to Supabase
 * (migration 009) and serve as the durable record of a qualifying storm
 * for the SMARTS Ad Hoc Monitoring Report.
 *
 * Created from either:
 *   - the NOAA forecast detector (`source: 'noaa'`)
 *   - the dashboard "Simulate rain forecast / starting" demo buttons
 *     (`source: 'simulated'`)
 *
 * Inspections link back via `inspections.trigger_event_id` (no FK in the
 * schema — same column is reused by the legacy detector flow).
 */

export type SmartsEventStatus = 'forecast' | 'active' | 'ended' | 'completed';

export type SmartsEventSource = 'noaa' | 'simulated';

export interface SmartsEvent {
  id: string;
  projectId: string;
  status: SmartsEventStatus;
  source: SmartsEventSource;
  /** ISO 8601 — when the forecast first detected (or simulated) this event. */
  forecastDetectedAt: string;
  /** ISO 8601 — when precipitation actually started. Null until confirmed. */
  startedAt?: string;
  /** ISO 8601 — when precipitation ended. Null while still active. */
  endedAt?: string;
  /** Total recorded precipitation across the event. Null until known. */
  precipitationInches?: number;
  /** QSP free-text annotations (e.g. NOAA bulletin reference). */
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
