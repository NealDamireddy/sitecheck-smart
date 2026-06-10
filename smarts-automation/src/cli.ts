import { resolve } from "node:path";
import { parseMonitoringCsv } from "./csv/parse-monitoring-csv.js";
import { validateForCgp } from "./validation/cgp-validation.js";
import {
  SMARTS_DATETIME_FORMAT,
} from "./validation/smarts-datetime.js";
import type { ValidatedMonitoringRecord } from "./types/monitoring-record.js";
import type {
  ValidationError,
  ValidationWarning,
} from "./types/index.js";

async function main(argv: string[]): Promise<number> {
  const csvArg = argv[2];
  if (!csvArg) {
    console.error("usage: smarts-automation <path-to-csv>");
    return 2;
  }

  const csvPath = resolve(process.cwd(), csvArg);
  console.log(`smarts-automation: parsing ${csvPath}`);

  const parsed = await parseMonitoringCsv(csvPath);
  if (!parsed.ok) {
    printErrors("CSV parse failed", parsed.errors);
    return 1;
  }

  const validated = validateForCgp(parsed.records);
  if (!validated.ok) {
    printErrors("CGP validation failed", validated.errors);
    return 1;
  }

  printSummary(validated.records);
  printWarnings(validated.warnings);
  return 0;
}

function printSummary(records: ValidatedMonitoringRecord[]): void {
  console.log(`Parsed ${records.length} record(s).`);
  console.log(`SMARTS datetime format: ${SMARTS_DATETIME_FORMAT}`);
  console.log("");
  console.log("Summary:");
  for (const [i, r] of records.entries()) {
    console.log(
      `  #${i + 1}  loc=${r.monitoringLocationId} (${r.monitoringLocationName})  ` +
        `at=${r.sampleDateTimeFormatted}  ` +
        `pH=${formatNum(r.phValue)}  turbidity=${formatNum(r.turbidityNtu)} NTU  ` +
        `method=${r.analyticalMethod ?? "-"}  lab=${r.labName ?? "-"}  ` +
        `qualifier=${r.qualifierCode ?? "-"}  discharge=${r.dischargePoint}`,
    );
  }

  const stats = aggregate(records);
  console.log("");
  console.log("Aggregate:");
  console.log(`  records: ${stats.count}`);
  console.log(`  unique locations: ${stats.uniqueLocations}`);
  console.log(`  date range: ${stats.minDate ?? "-"} -> ${stats.maxDate ?? "-"}`);
  console.log(
    `  pH samples: ${stats.phCount} (missing ${stats.phMissing})  ` +
      `turbidity samples: ${stats.turbidityCount} (missing ${stats.turbidityMissing})`,
  );
}

function printWarnings(warnings: ValidationWarning[]): void {
  if (warnings.length === 0) {
    console.log("");
    console.log("No NAL exceedances detected.");
    return;
  }
  console.log("");
  console.log(`Warnings (${warnings.length}):`);
  for (const w of warnings) {
    const recordNum = w.recordIndex + 1;
    if (w.code === "NAL_EXCEEDANCE_PH_LOW" || w.code === "NAL_EXCEEDANCE_PH_HIGH") {
      const limit = w.code === "NAL_EXCEEDANCE_PH_LOW" ? "min 6.0" : "max 9.0";
      console.log(
        `  ! NAL exceedance: Record #${recordNum} ${w.field} (${limit}) - ${w.message}`,
      );
    } else if (w.code === "NAL_EXCEEDANCE_TURBIDITY") {
      console.log(
        `  ! NAL exceedance: Record #${recordNum} turbidity (limit 250 NTU) - ${w.message}`,
      );
    } else {
      console.log(`  ! ${w.message}`);
    }
  }
}

function printErrors(label: string, errors: ValidationError[]): void {
  console.error(`${label} (${errors.length} error(s)):`);
  for (const err of errors) {
    const where = err.recordIndex < 0 ? "header" : `row ${err.recordIndex + 1}`;
    console.error(`  - [${where}] ${err.field}: ${err.message}`);
  }
}

function formatNum(n: number | null): string {
  return n === null ? "-" : String(n);
}

interface Aggregate {
  count: number;
  uniqueLocations: number;
  minDate: string | null;
  maxDate: string | null;
  phCount: number;
  phMissing: number;
  turbidityCount: number;
  turbidityMissing: number;
}

function aggregate(records: ValidatedMonitoringRecord[]): Aggregate {
  const locs = new Set<string>();
  let phCount = 0;
  let phMissing = 0;
  let tCount = 0;
  let tMissing = 0;
  let min: number | null = null;
  let max: number | null = null;

  for (const r of records) {
    locs.add(r.monitoringLocationId);
    if (r.phValue === null) phMissing++;
    else phCount++;
    if (r.turbidityNtu === null) tMissing++;
    else tCount++;

    const t = r.sampleDateTime.getTime();
    if (min === null || t < min) min = t;
    if (max === null || t > max) max = t;
  }

  return {
    count: records.length,
    uniqueLocations: locs.size,
    minDate: min === null ? null : new Date(min).toISOString(),
    maxDate: max === null ? null : new Date(max).toISOString(),
    phCount,
    phMissing,
    turbidityCount: tCount,
    turbidityMissing: tMissing,
  };
}

main(process.argv).then(
  (code) => {
    process.exit(code);
  },
  (err: unknown) => {
    console.error("smarts-automation: fatal error");
    console.error(err);
    process.exit(1);
  },
);
