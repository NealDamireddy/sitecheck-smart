import type { MonitoringRecord } from "../types/monitoring-record.js";
import type { HaltedResult } from "../types/run-result.js";

export interface ReviewPackage {
  records: MonitoringRecord[];
  sampleScreenshots: string[];
  dataSummaryScreenshot: string;
  certificationScreenshot: string;
}

export interface OrchestratorFilledResult {
  status: "filled";
  records: MonitoringRecord[];
  filledAt: Date;
  reviewPackage: ReviewPackage;
}

export type RunResult = OrchestratorFilledResult | HaltedResult;
