import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { renderToFile } from '@react-pdf/renderer';
import { buildInspectionReportContract } from '../src/lib/cgp/inspection-report-data';
import { InspectionContractPdf } from '../src/lib/pdf/inspection-contract-pdf';
import {
  inspectionReportResults,
  inspectionReportSnapshot,
} from '../tests/support/inspection-report-fixture';

async function main() {
  const output = resolve(
    process.argv[2] ?? 'output/pdf/phase-5c-sample-inspection-report.pdf'
  );
  await mkdir(dirname(output), { recursive: true });
  const contract = buildInspectionReportContract({
    inspection: inspectionReportSnapshot(),
    checklistResults: inspectionReportResults(),
  });
  await renderToFile(InspectionContractPdf({ contract }), output);
  process.stdout.write(`${output}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
