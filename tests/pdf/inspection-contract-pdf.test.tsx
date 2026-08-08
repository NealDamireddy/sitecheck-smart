import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import { createRequire } from 'node:module';
import { buildInspectionReportContract } from '@/lib/cgp/inspection-report-data';
import { InspectionContractPdf } from '@/lib/pdf/inspection-contract-pdf';
import { NO_BMP_EXCEPTIONS_MESSAGE } from '@/lib/cgp/checklist-expansion';
import {
  inspectionReportResults,
  inspectionReportSnapshot,
} from '../support/inspection-report-fixture';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  buffer: Buffer
) => Promise<{ numpages: number; text: string }>;

async function render(exceptionItemId: string | null = 'gh-wm-6') {
  const contract = buildInspectionReportContract({
    inspection: inspectionReportSnapshot(
      exceptionItemId
        ? {}
        : { checklist_compliant_count: 22, checklist_deficient_count: 0 }
    ),
    checklistResults: inspectionReportResults(exceptionItemId),
  });
  const buffer = await renderToBuffer(InspectionContractPdf({ contract }));
  return { contract, buffer, parsed: await pdfParse(buffer) };
}

describe('contract-driven inspection PDF', () => {
  it('renders a five-page regulator-facing report with all contract sections', async () => {
    const { contract, buffer, parsed } = await render();

    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(parsed.numpages).toBe(5);
    expect(parsed.text).toContain('BMP Inspection Report');
    expect(parsed.text).toContain('Part 1: General Information');
    expect(parsed.text).toContain('Part 2: BMP Observations');
    expect(parsed.text).toContain('Part 3: Descriptions of BMP deficiencies');
    expect(parsed.text).toContain('QSP Certification');
    expect(parsed.text).toContain('General Site Pictures / Evidence');
    expect(parsed.text).toContain('4003 Equus Ct - 2 01C402404');
    expect(parsed.text).toContain('Historical QSP');
    expect(parsed.text).toContain('QSP-12345');
    expect(parsed.text).toContain('Concrete washout containment was deficient.');
    expect(parsed.text).toContain('Repair start due: 03/12/2026, 11:30 AM');
    expect(parsed.text).toContain(contract.sourceSubmissionSha256.slice(0, 12));
  });

  it('renders all 22 immutable checklist prompts', async () => {
    const { contract, parsed } = await render();
    const items = contract.part2.categories.flatMap((category) => category.items);
    const normalizedPdfText = parsed.text.replace(/\s+/g, ' ');

    expect(items).toHaveLength(22);
    for (const item of items) {
      const normalizedPrompt = item.prompt.replace(/\s+/g, ' ');
      expect(normalizedPdfText).toContain(normalizedPrompt);
    }
  });

  it('uses the required no-exceptions language for an all-compliant report', async () => {
    const { parsed } = await render(null);

    expect(parsed.text).toContain(NO_BMP_EXCEPTIONS_MESSAGE);
    expect(parsed.text).not.toContain('Concrete washout containment was deficient.');
  });
});
