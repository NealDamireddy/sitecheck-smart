export interface MonitoringRecord {
  monitoringLocationId: string;
  monitoringLocationName: string;
  sampleDateTime: Date;
  phValue: number | null;
  turbidityNtu: number | null;
  analyticalMethod: string | null;
  labName: string | null;
  qualifierCode: string | null;
  dischargePoint: string;
  // Event Information (Construction Ad Hoc report). Optional so existing CSVs and
  // record literals without these columns keep parsing/compiling; populated from
  // the event_* CSV columns when present. Strings in the exact format SMARTS
  // expects in the Event Information form.
  eventStartDate?: string; // MM/DD/YYYY
  eventStartTime?: string; // HH:MM
  eventEndDate?: string; // MM/DD/YYYY
  eventEndTime?: string; // HH:MM
  precipitationInches?: string;
  // Qualified SWPPP Practitioner — required text field on the Raw Data sample form.
  qspName?: string;
  // Per-parameter Analytical Method labels matching the SMARTS Raw Data table
  // dropdown options (e.g. "E150.2", "A4500HB" for pH; "E180.1", "A2130B" for
  // turbidity). `analyticalMethod` above is kept as a single-method legacy field;
  // the table fill uses these specific fields first.
  phAnalyticalMethod?: string;
  turbidityAnalyticalMethod?: string;
  // Method Detection Limit / Reporting Limit per parameter. Required by SMARTS
  // only when the sample is lab-analyzed; left undefined when not applicable.
  // Stored as strings so callers can pass through whatever the lab reported
  // without forcing numeric coercion (the input has maxlength=10).
  mdlPh?: string;
  rlPh?: string;
  mdlTurbidity?: string;
  rlTurbidity?: string;
}

export interface ValidatedMonitoringRecord extends MonitoringRecord {
  sampleDateTimeFormatted: string;
}

export type MonitoringRecordField = keyof MonitoringRecord;
