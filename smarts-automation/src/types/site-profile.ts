// Splits the SMARTS monitoring data into the per-WDID CONSTANTS captured once
// during onboarding (SiteProfile) and the per-submission VARIABLES measured each
// inspection (InspectionEvent + InspectionEntry). composeMonitoringRecords()
// folds them back into the MonitoringRecord[] shape the existing parser,
// CGP validator, and runFill already consume — so nothing downstream changes.

/** One monitoring point on a site. Constant once the site is set up in SMARTS. */
export interface SiteMonitoringLocation {
  /** Stable id carried on each record (the app uses the DB row id). */
  id: string;
  /** MUST match the SMARTS Monitoring Location dropdown option text exactly. */
  name: string;
  /** Discharge point label for this location. */
  dischargePoint: string;
}

/**
 * Per-WDID constants captured ONCE during onboarding. Everything here is the
 * same across every inspection submission for the site; only the measured
 * values (InspectionEntry) change run to run.
 */
export interface SiteProfile {
  wdid: string;
  /**
   * Facility/Site Name EXACTLY as shown on the first line of the SMARTS
   * "Ad Hoc Reports - Outstanding" Facility column — feeds the duplicate-draft
   * guard (see find-existing-draft.ts).
   */
  siteName: string;
  /** Qualified SWPPP Practitioner name typed on every Raw Data sample form. */
  qspName: string;
  monitoringLocations: SiteMonitoringLocation[];
  /** Analytical Method option text for pH (e.g. "A4500HB", "E150.2", "pH_Field"). */
  phAnalyticalMethod: string;
  /** Analytical Method option text for turbidity (e.g. "E180.1", "A2130B"). */
  turbidityAnalyticalMethod: string;
  /**
   * Lab analysis constants. When labName is set the bot picks "Lab" on the
   * Analyzed By dropdown and writes MDL/RL; otherwise "Self" and MDL/RL are
   * omitted. Left undefined for self-analyzed sites.
   */
  labName?: string;
  mdlPh?: string;
  rlPh?: string;
  mdlTurbidity?: string;
  rlTurbidity?: string;
  /**
   * Event Type template. Defaults to "Precipitation Event" (the only type the
   * bot fills today) when composing.
   */
  eventType?: string;
}

/**
 * The rain event being reported. One per submission; its window is stamped onto
 * every composed record (SMARTS repeats Event Information across the report).
 */
export interface InspectionEvent {
  eventStartDate: string; // MM/DD/YYYY
  eventStartTime: string; // HH:MM
  eventEndDate: string; // MM/DD/YYYY
  eventEndTime: string; // HH:MM
  precipitationInches?: string;
}

/** A single monitoring-location sample's measured values for the event. */
export interface InspectionEntry {
  /** References SiteProfile.monitoringLocations[].id. */
  monitoringLocationId: string;
  sampleDateTime: Date;
  phValue: number | null;
  turbidityNtu: number | null;
  qualifierCode?: string | null;
}
