/**
 * Block 6 — Server-side PDF rendering for compliance reports.
 *
 * This module is server-only. It uses `@react-pdf/renderer` (which is
 * built on top of a custom renderer, not React DOM) to lay out the
 * 7+ markdown-ish sections produced by `/api/reports/generate` into a
 * portrait-oriented inspection PDF that a regulator would recognize.
 *
 * Layout:
 *   - Header band with project name, WDID, permit number, generated date
 *   - QSP block (name, license, company)
 *   - One Section block per `ReportSection` — title bar + body text
 *     with very lightweight markdown handling (`**bold**`, `---` rules,
 *     leading-`-` bullets)
 *   - Footer with page numbering and "CGP 2022 Compliance Report"
 *
 * The PDF is rendered at request time and streamed back as a binary
 * `application/pdf` response by `POST /api/inspections/[id]/pdf`.
 */

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  type DocumentProps,
} from '@react-pdf/renderer';
import type { ReactElement } from 'react';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────
export interface PdfReportSection {
  id: string;
  title: string;
  content: string;
  type?: 'text' | 'table' | 'signature';
}

export interface PdfProjectInfo {
  name: string;
  address?: string | null;
  wdid?: string | null;
  permitNumber?: string | null;
  qspName?: string | null;
  qspLicenseNumber?: string | null;
  qspCompany?: string | null;
}

export interface PdfReportInput {
  reportId: string;
  generatedAt: string;
  signedBy?: string | null;
  signedDate?: string | null;
  project: PdfProjectInfo;
  sections: PdfReportSection[];
}

// ─────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────
// Stick to built-in fonts so we don't ship a TTF in the bundle.
Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 36,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#1f2937',
  },
  headerBand: {
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 18,
    borderRadius: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#fbbf24',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 9,
    color: '#cbd5e1',
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#cbd5e1',
  },
  metaCell: {
    width: '50%',
    paddingVertical: 2,
  },
  metaLabel: {
    fontSize: 8,
    color: '#64748b',
    fontFamily: 'Helvetica-Bold',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaValue: {
    fontSize: 10,
    color: '#0f172a',
  },
  sectionWrapper: {
    marginBottom: 16,
  },
  sectionTitleBar: {
    backgroundColor: '#fef3c7',
    borderLeftWidth: 3,
    borderLeftColor: '#f59e0b',
    paddingHorizontal: 8,
    paddingVertical: 5,
    marginBottom: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#92400e',
  },
  sectionBody: {
    paddingHorizontal: 4,
  },
  paragraph: {
    fontSize: 10,
    lineHeight: 1.45,
    marginBottom: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 2,
    paddingLeft: 6,
  },
  bulletDot: {
    width: 8,
    fontSize: 10,
  },
  bulletText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.4,
  },
  hr: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#cbd5e1',
    marginVertical: 4,
  },
  signatureBlock: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 36,
    right: 36,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: '#94a3b8',
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
    paddingTop: 6,
  },
});

// ─────────────────────────────────────────────
// Lightweight markdown renderer
// ─────────────────────────────────────────────
// Renders the simple markdown subset we know /api/reports/generate
// produces: `**bold**`, leading `-` bullets, and `---` horizontal rules.
function renderRichLine(line: string, key: string): ReactElement {
  // Handle **bold** segments by splitting on the marker.
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text key={key} style={styles.paragraph}>
      {parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <Text key={idx} style={{ fontFamily: 'Helvetica-Bold' }}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        return part;
      })}
    </Text>
  );
}

function renderSectionBody(content: string): ReactElement[] {
  const lines = content.split('\n');
  const out: ReactElement[] = [];
  lines.forEach((rawLine, i) => {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      out.push(<View key={`sp-${i}`} style={{ height: 4 }} />);
      return;
    }
    if (line.trim() === '---') {
      out.push(<View key={`hr-${i}`} style={styles.hr} />);
      return;
    }
    if (line.trim().startsWith('- ')) {
      const bulletContent = line.trim().slice(2);
      // Bold parsing inside the bullet text
      const parts = bulletContent.split(/(\*\*[^*]+\*\*)/g);
      out.push(
        <View key={`b-${i}`} style={styles.bulletRow}>
          <Text style={styles.bulletDot}>•</Text>
          <Text style={styles.bulletText}>
            {parts.map((part, idx) => {
              if (part.startsWith('**') && part.endsWith('**')) {
                return (
                  <Text key={idx} style={{ fontFamily: 'Helvetica-Bold' }}>
                    {part.slice(2, -2)}
                  </Text>
                );
              }
              return part;
            })}
          </Text>
        </View>
      );
      return;
    }
    out.push(renderRichLine(line, `p-${i}`));
  });
  return out;
}

// ─────────────────────────────────────────────
// Document
// ─────────────────────────────────────────────
export function InspectionReportPdf(
  input: PdfReportInput
): ReactElement<DocumentProps> {
  const { reportId, generatedAt, signedBy, signedDate, project, sections } = input;
  const generatedDateStr = new Date(generatedAt).toLocaleString();

  return (
    <Document
      title={`CGP Compliance Report — ${project.name}`}
      author={project.qspName ?? 'SiteCheck'}
      subject="CGP 2022 Inspection Report"
      keywords="CGP, SWPPP, inspection, compliance"
    >
      <Page size="LETTER" style={styles.page} wrap>
        {/* Header band */}
        <View style={styles.headerBand}>
          <Text style={styles.headerTitle}>CGP 2022 Compliance Report</Text>
          <Text style={styles.headerSubtitle}>{project.name}</Text>
          <Text style={styles.headerSubtitle}>
            Generated {generatedDateStr} · Report ID {reportId}
          </Text>
        </View>

        {/* Meta block */}
        <View style={styles.metaRow}>
          {project.address ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Address</Text>
              <Text style={styles.metaValue}>{project.address}</Text>
            </View>
          ) : null}
          {project.wdid ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>WDID</Text>
              <Text style={styles.metaValue}>{project.wdid}</Text>
            </View>
          ) : null}
          {project.permitNumber ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>Permit Number</Text>
              <Text style={styles.metaValue}>{project.permitNumber}</Text>
            </View>
          ) : null}
          {project.qspName ? (
            <View style={styles.metaCell}>
              <Text style={styles.metaLabel}>QSP</Text>
              <Text style={styles.metaValue}>
                {project.qspName}
                {project.qspLicenseNumber ? ` · ${project.qspLicenseNumber}` : ''}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Sections */}
        {sections.map((section) => (
          <View key={section.id} style={styles.sectionWrapper} wrap={false}>
            <View style={styles.sectionTitleBar}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <View style={styles.sectionBody}>{renderSectionBody(section.content)}</View>
          </View>
        ))}

        {/* Signature block (only when signed) */}
        {signedBy ? (
          <View style={styles.signatureBlock}>
            <Text style={styles.paragraph}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>Signed By:</Text> {signedBy}
            </Text>
            {signedDate ? (
              <Text style={styles.paragraph}>
                <Text style={{ fontFamily: 'Helvetica-Bold' }}>Signed On:</Text>{' '}
                {new Date(signedDate).toLocaleString()}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Footer with page numbers */}
        <View style={styles.footer} fixed>
          <Text>SiteCheck · CGP 2022 Compliance Report</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
