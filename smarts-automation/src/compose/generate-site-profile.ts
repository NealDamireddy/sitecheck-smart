// Seedable generator of random-but-VALID SiteProfiles (and matching inspection
// data) for exercising the compose path on sites other than the single real
// one available for live testing. Every value is drawn from the live SMARTS
// option sets / CGP-valid ranges so composed records pass validateForCgp and
// the bot's dropdown fills would not hallucinate. Deterministic: the same
// (wdid, seed) always yields the same profile.

import type {
  InspectionEntry,
  InspectionEvent,
  SiteProfile,
} from "../types/site-profile.js";

// Verbatim from the live SMARTS Raw Data Analytical Method dropdowns.
const PH_METHODS = ["A4500HB", "E150.2", "pH_Field", "pH_Paper"] as const;
const TURBIDITY_METHODS = ["E180.1", "A2130B"] as const;

const LOCATION_NAMES = [
  "City DI Northeast",
  "County Pipe Outfall Southeast",
  "North Detention Basin",
  "West Channel Outfall",
  "South Catch Basin",
  "East Swale Discharge",
  "Central Drainage Inlet",
] as const;

const DISCHARGE_POINTS = [
  "Storm Drain Inlet",
  "Pipe Outfall",
  "Sheet Flow",
  "Engineered Channel",
] as const;

const QSP_NAMES = [
  "Jordan Reyes",
  "Casey Morgan",
  "Sam Avery",
  "Taylor Quinn",
  "Riley Banks",
] as const;

const LAB_NAMES = ["Acme Labs", "Pacific Environmental", "WestCoast Analytical"] as const;

export interface GenerateSiteProfileOptions {
  /** Explicit PRNG seed. Defaults to a hash of the wdid (stable per site). */
  seed?: number;
  /** How many monitoring locations to generate (default 2). */
  locationCount?: number;
  /** Whether the site is lab-analyzed (adds labName + MDL/RL). Default true. */
  lab?: boolean;
}

export function generateSiteProfile(
  wdid: string,
  options: GenerateSiteProfileOptions = {},
): SiteProfile {
  const seed = options.seed ?? hashSeed(wdid);
  const rand = mulberry32(seed);

  const locationCount = clamp(
    options.locationCount ?? 2,
    1,
    LOCATION_NAMES.length,
  );
  const lab = options.lab ?? true;

  const names = sample(rand, LOCATION_NAMES, locationCount);
  const monitoringLocations = names.map((name, i) => ({
    id: `ML-${String(i + 1).padStart(3, "0")}`,
    name,
    dischargePoint: pick(rand, DISCHARGE_POINTS),
  }));

  const profile: SiteProfile = {
    wdid,
    siteName: `${pick(rand, names).split(" ")[0]} Site ${randInt(rand, 100, 999)}`,
    qspName: pick(rand, QSP_NAMES),
    monitoringLocations,
    phAnalyticalMethod: pick(rand, PH_METHODS),
    turbidityAnalyticalMethod: pick(rand, TURBIDITY_METHODS),
    eventType: "Precipitation Event",
  };

  if (lab) {
    profile.labName = pick(rand, LAB_NAMES);
    profile.mdlPh = "0.1";
    profile.rlPh = "0.1";
    profile.mdlTurbidity = "0.1";
    profile.rlTurbidity = "1";
  }

  return profile;
}

export interface GenerateInspectionOptions {
  seed?: number;
  /** Base date for the event window (default 2026-05-27). */
  baseDate?: Date;
}

/**
 * Generate one CGP-valid InspectionEvent + an InspectionEntry per profile
 * location: pH in [6.0, 9.0], turbidity in [1, 200] NTU, sample times inside
 * the event window. Deterministic given (profile.wdid, seed).
 */
export function generateInspection(
  profile: SiteProfile,
  options: GenerateInspectionOptions = {},
): { event: InspectionEvent; entries: InspectionEntry[] } {
  const seed = options.seed ?? hashSeed(profile.wdid) + 1;
  const rand = mulberry32(seed);

  const base = options.baseDate ?? new Date(Date.UTC(2026, 4, 27, 0, 0, 0));
  const start = new Date(base.getTime());
  const end = new Date(base.getTime() + 2 * 24 * 60 * 60 * 1000);

  const event: InspectionEvent = {
    eventStartDate: mmddyyyy(start),
    eventStartTime: "08:00",
    eventEndDate: mmddyyyy(end),
    eventEndTime: "16:00",
    precipitationInches: (randInt(rand, 5, 30) / 10).toFixed(1),
  };

  const entries: InspectionEntry[] = profile.monitoringLocations.map((loc) => {
    // Sample sometime inside the window (start day .. end day).
    const offsetMin = randInt(rand, 0, 2 * 24 * 60);
    const sampleDateTime = new Date(start.getTime() + offsetMin * 60 * 1000);
    return {
      monitoringLocationId: loc.id,
      sampleDateTime,
      phValue: round1(6.0 + rand() * 3.0),
      turbidityNtu: round1(1 + rand() * 199),
      qualifierCode: null,
    };
  });

  return { event, entries };
}

// ── PRNG + helpers (no external deps) ──────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(rand: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function sample<T>(rand: () => number, arr: readonly T[], count: number): T[] {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rand() * pool.length);
    out.push(pool.splice(idx, 1)[0]!);
  }
  return out;
}

function randInt(rand: () => number, min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function mmddyyyy(d: Date): string {
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const yyyy = String(d.getUTCFullYear());
  return `${mm}/${dd}/${yyyy}`;
}
