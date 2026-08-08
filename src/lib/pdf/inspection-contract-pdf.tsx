import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  type DocumentProps,
} from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import type { InspectionReportContract } from '@/lib/cgp/inspection-report-contract';

const SITE_TIMEZONE = 'America/Los_Angeles';

Font.registerHyphenationCallback((word) => [word]);

const styles = StyleSheet.create({
  page: {
    paddingTop: 28,
    paddingBottom: 48,
    paddingHorizontal: 30,
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: '#111827',
  },
  coverHeader: {
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#111827',
    paddingVertical: 10,
  },
  brand: {
    color: '#0369a1',
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    letterSpacing: 0.5,
  },
  reportTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    marginTop: 5,
  },
  sectionTitle: {
    backgroundColor: '#a3a3a3',
    borderWidth: 1,
    borderColor: '#111827',
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  subsectionTitle: {
    backgroundColor: '#d4d4d4',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#111827',
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    borderLeftWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#111827',
    paddingHorizontal: 7,
    paddingVertical: 3,
    lineHeight: 1.2,
  },
  cellRight: {
    borderRightWidth: 1,
  },
  label: {
    fontFamily: 'Helvetica-Bold',
  },
  note: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#111827',
    paddingHorizontal: 7,
    paddingVertical: 6,
    lineHeight: 1.35,
    minHeight: 24,
  },
  tableHeader: {
    backgroundColor: '#f5f5f5',
    fontFamily: 'Helvetica-Bold',
  },
  category: {
    backgroundColor: '#a3a3a3',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#111827',
    fontFamily: 'Helvetica-Bold',
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  answerNo: {
    color: '#b91c1c',
    fontFamily: 'Helvetica-Bold',
  },
  deficiencyMeta: {
    fontSize: 7.5,
    color: '#374151',
    marginTop: 4,
    lineHeight: 1.25,
  },
  certification: {
    borderWidth: 1,
    borderColor: '#111827',
    padding: 9,
    marginTop: 14,
  },
  certificationHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    marginBottom: 5,
  },
  certificationText: {
    fontSize: 7.5,
    lineHeight: 1.35,
  },
  signatureRow: {
    flexDirection: 'row',
    marginTop: 10,
  },
  signatureCell: {
    width: '50%',
    borderTopWidth: 0.75,
    borderColor: '#111827',
    paddingTop: 4,
    marginRight: 12,
  },
  signatureName: {
    fontFamily: 'Helvetica-Oblique',
    fontSize: 11,
    marginBottom: 2,
  },
  evidenceBox: {
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#111827',
    padding: 10,
  },
  evidenceItem: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#d1d5db',
    paddingBottom: 7,
    marginBottom: 7,
  },
  evidenceUrl: {
    fontSize: 7,
    color: '#1d4ed8',
    marginTop: 3,
  },
  muted: {
    color: '#6b7280',
  },
  footer: {
    position: 'absolute',
    bottom: 20,
    left: 30,
    right: 30,
    borderTopWidth: 0.5,
    borderTopColor: '#9ca3af',
    paddingTop: 5,
    flexDirection: 'row',
    justifyContent: 'space-between',
    color: '#6b7280',
    fontSize: 7,
  },
});

function inspectionTypeLabel(value: InspectionReportContract['inspectionType']) {
  switch (value) {
    case 'routine':
      return 'Weekly';
    case 'pre-storm':
      return 'Pre-Precipitation';
    case 'post-storm':
      return 'Post-Precipitation';
    case 'qpe':
      return 'Daily Precipitation';
  }
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(value));
}

function formatDate(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SITE_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function valueOrNA(value: string | number | null): string {
  return value === null || value === '' ? 'N/A' : String(value);
}

function yesNo(value: boolean): string {
  return value ? 'Yes' : 'No';
}

function Footer({ contract }: { contract: InspectionReportContract }) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        SiteCheck | Inspection {contract.inspectionId} | Snapshot{' '}
        {contract.sourceSubmissionSha256.slice(0, 12)}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) =>
          `Page ${pageNumber} of ${totalPages}`
        }
      />
    </View>
  );
}

function PairRow({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
}: {
  leftLabel: string;
  leftValue: string;
  rightLabel?: string;
  rightValue?: string;
}) {
  const paired = rightLabel !== undefined;
  return (
    <View style={styles.row} wrap={false}>
      <Text style={[styles.cell, styles.label, { width: '29%' }]}>{leftLabel}</Text>
      <Text
        style={[
          styles.cell,
          !paired ? styles.cellRight : {},
          { width: paired ? '21%' : '71%' },
        ]}
      >
        {leftValue}
      </Text>
      {paired ? (
        <>
          <Text style={[styles.cell, styles.label, { width: '29%' }]}>
            {rightLabel}
          </Text>
          <Text style={[styles.cell, styles.cellRight, { width: '21%' }]}>
            {rightValue}
          </Text>
        </>
      ) : null}
    </View>
  );
}

function Part2Page({
  contract,
  categories,
  continuation = false,
}: {
  contract: InspectionReportContract;
  categories: InspectionReportContract['part2']['categories'];
  continuation?: boolean;
}) {
  return (
    <Page size="A4" style={styles.page} wrap>
      <Text style={styles.sectionTitle}>
        Part 2: BMP Observations{continuation ? ' (continued)' : ''}
      </Text>
      <View style={styles.row} wrap={false}>
        <Text style={[styles.cell, styles.tableHeader, { width: '66%' }]}>
          Minimum BMPs for Risk Level 2 Sites
        </Text>
        <Text style={[styles.cell, styles.tableHeader, { width: '17%' }]}>
          Adequately designed, implemented and effective?
        </Text>
        <Text
          style={[
            styles.cell,
            styles.cellRight,
            styles.tableHeader,
            { width: '17%' },
          ]}
        >
          Action Implemented Date
        </Text>
      </View>
      {categories.map((category) => (
        <View key={category.number}>
          <Text style={styles.category} wrap={false}>
            {category.number} - {category.title}
          </Text>
          {category.items.map((item) => (
            <View key={item.id} style={styles.row} wrap={false}>
              <Text style={[styles.cell, { width: '66%' }]}>
                {item.number}. {item.prompt}
              </Text>
              <Text
                style={[
                  styles.cell,
                  item.answer === 'no' ? styles.answerNo : {},
                  { width: '17%' },
                ]}
              >
                {item.answer === 'yes' ? 'Yes' : 'No'}
              </Text>
              <Text
                style={[
                  styles.cell,
                  styles.cellRight,
                  item.answer === 'no' ? styles.answerNo : {},
                  { width: '17%' },
                ]}
              >
                {item.exception?.actionImplementedAt
                  ? formatDate(item.exception.actionImplementedAt)
                  : '-'}
              </Text>
            </View>
          ))}
        </View>
      ))}
      <Footer contract={contract} />
    </Page>
  );
}

function ContractDocument({
  contract,
}: {
  contract: InspectionReportContract;
}): ReactElement<DocumentProps> {
  const observations = contract.part1.siteObservations;
  const qpe = contract.part1.qpe;
  const evidence = contract.part3.deficiencies.flatMap((deficiency) =>
    deficiency.photoUrls.map((url) => ({
      checklistItemId: deficiency.checklistItemId,
      description: deficiency.description,
      location: deficiency.location,
      url,
    }))
  );
  const weatherParts = [
    contract.part1.weather.condition,
    contract.part1.weather.temperatureF === null
      ? null
      : `${contract.part1.weather.temperatureF} F`,
    contract.part1.weather.windSpeedMph === null
      ? null
      : `wind ${contract.part1.weather.windSpeedMph} mph`,
    contract.part1.weather.humidityPercent === null
      ? null
      : `humidity ${contract.part1.weather.humidityPercent}%`,
  ].filter(Boolean);

  return (
    <Document
      title={`BMP Inspection Report - ${contract.part1.site.name}`}
      author={contract.part1.qsp.name}
      subject={`California CGP ${contract.permitOrder} inspection`}
      keywords={`SiteCheck, SWPPP, CGP, ${contract.inspectionId}`}
    >
      <Page size="A4" style={styles.page} wrap>
        <View style={styles.coverHeader}>
          <Text style={styles.brand}>SiteCheck</Text>
          <Text style={styles.reportTitle}>BMP Inspection Report</Text>
        </View>
        <PairRow
          leftLabel="Date"
          leftValue={formatDateTime(contract.part1.observedAt)}
        />
        <PairRow
          leftLabel="Inspection Type"
          leftValue={inspectionTypeLabel(contract.inspectionType)}
        />

        <Text style={styles.sectionTitle}>Part 1: General Information</Text>
        <Text style={styles.subsectionTitle}>Site Information</Text>
        <PairRow
          leftLabel="Construction Site Name & WDID No."
          leftValue={`${contract.part1.site.name} - ${contract.part1.site.wdid}`}
        />
        <PairRow
          leftLabel="Project Risk Level"
          leftValue={String(contract.part1.site.riskLevel)}
          rightLabel="Photos Taken"
          rightValue={yesNo(contract.part1.photosTaken)}
        />
        <PairRow
          leftLabel="Construction Stage"
          leftValue={contract.part1.constructionStage}
          rightLabel="Current Weather"
          rightValue={weatherParts.join(', ') || 'N/A'}
        />

        <Text style={styles.subsectionTitle}>Weather</Text>
        <PairRow
          leftLabel="Estimated QPE Beginning"
          leftValue={qpe.start ? formatDateTime(qpe.start) : 'N/A'}
          rightLabel="Estimated QPE Duration"
          rightValue={
            qpe.durationHours === null ? 'N/A' : `${qpe.durationHours} hours`
          }
        />
        <PairRow
          leftLabel="End Date of QPE"
          leftValue={qpe.end ? formatDateTime(qpe.end) : 'N/A'}
          rightLabel="Rain Gauge reading (inches)"
          rightValue={valueOrNA(qpe.rainGaugeInches)}
        />

        <Text style={styles.subsectionTitle}>
          Exemption Documentation (explanation required if inspection could not be conducted)
        </Text>
        <Text style={styles.note}>
          {contract.part1.exemptionDocumentation ?? 'None'}
        </Text>

        <Text style={styles.subsectionTitle}>Site Observations</Text>
        <PairRow
          leftLabel="Presence of Precipitation?"
          leftValue={yesNo(observations.precipitation)}
          rightLabel="Presence of Discolorations?"
          rightValue={yesNo(observations.discolorations)}
        />
        <PairRow
          leftLabel="Presence of Odors?"
          leftValue={yesNo(observations.odors)}
          rightLabel="Presence of Turbidity?"
          rightValue={yesNo(observations.turbidity)}
        />
        <PairRow
          leftLabel="Presence of Sheen?"
          leftValue={yesNo(observations.sheen)}
          rightLabel="Presence of Floating Material?"
          rightValue={yesNo(observations.floatingMaterial)}
        />
        <PairRow
          leftLabel="Presence of Suspended Material?"
          leftValue={yesNo(observations.suspendedMaterial)}
        />
        <PairRow
          leftLabel="Comments on presence"
          leftValue={observations.comments ?? ''}
        />

        <Text style={styles.subsectionTitle}>Inspector Information</Text>
        <PairRow
          leftLabel="Inspector Name"
          leftValue={contract.part1.qsp.name}
          rightLabel="Inspector Title"
          rightValue={contract.part1.qsp.title}
        />
        <PairRow
          leftLabel="QSP License Number"
          leftValue={contract.part1.qsp.licenseNumber}
          rightLabel="Company"
          rightValue={contract.part1.qsp.company ?? 'N/A'}
        />
        <PairRow
          leftLabel="Signature"
          leftValue={contract.certification.confirmedBy.name}
          rightLabel="Date"
          rightValue={formatDate(contract.certification.confirmedAt)}
        />
        <Footer contract={contract} />
      </Page>

      <Part2Page contract={contract} categories={contract.part2.categories.slice(0, 3)} />
      <Part2Page
        contract={contract}
        categories={contract.part2.categories.slice(3)}
        continuation
      />

      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.sectionTitle}>
          Part 3: Descriptions of BMP deficiencies
        </Text>
        <View style={styles.row} wrap={false}>
          <Text style={[styles.cell, styles.tableHeader, { width: '43%' }]}>
            Deficiency
          </Text>
          <Text
            style={[
              styles.cell,
              styles.cellRight,
              styles.tableHeader,
              { width: '57%' },
            ]}
          >
            Recommendations - Repairs must begin within 72 hours of identification and be completed as soon as possible.
          </Text>
        </View>
        {contract.part3.deficiencies.length === 0 ? (
          <Text style={styles.note}>{contract.part3.noExceptionsStatement}</Text>
        ) : (
          contract.part3.deficiencies.map((deficiency) => (
            <View key={deficiency.checklistItemId} style={styles.row} wrap={false}>
              <View style={[styles.cell, { width: '43%' }]}>
                <Text>{deficiency.description}</Text>
                <Text style={styles.deficiencyMeta}>
                  Item {deficiency.categoryNumber}.{deficiency.itemNumber}: {deficiency.prompt}
                </Text>
                {deficiency.location ? (
                  <Text style={styles.deficiencyMeta}>
                    Location: {deficiency.location}
                  </Text>
                ) : null}
              </View>
              <View style={[styles.cell, styles.cellRight, { width: '57%' }]}>
                <Text>{deficiency.recommendation}</Text>
                <Text style={styles.deficiencyMeta}>
                  Identified: {formatDateTime(deficiency.identifiedAt)}
                </Text>
                <Text style={styles.deficiencyMeta}>
                  Repair start due: {formatDateTime(deficiency.repairStartDueAt)}
                </Text>
                <Text style={styles.deficiencyMeta}>
                  Action implemented:{' '}
                  {deficiency.actionImplementedAt
                    ? formatDateTime(deficiency.actionImplementedAt)
                    : 'Not recorded'}
                </Text>
              </View>
            </View>
          ))
        )}

        <View style={styles.certification} wrap={false}>
          <Text style={styles.certificationHeading}>QSP Certification</Text>
          <Text style={styles.certificationText}>
            {contract.certification.statement}
          </Text>
          <View style={styles.signatureRow}>
            <View style={styles.signatureCell}>
              <Text style={styles.signatureName}>
                {contract.certification.confirmedBy.name}
              </Text>
              <Text>
                QSP {contract.certification.confirmedBy.licenseNumber}
              </Text>
            </View>
            <View style={[styles.signatureCell, { marginRight: 0 }]}>
              <Text>{formatDateTime(contract.certification.confirmedAt)}</Text>
              <Text>Electronic attestation timestamp</Text>
            </View>
          </View>
        </View>
        <Footer contract={contract} />
      </Page>

      <Page size="A4" style={styles.page} wrap>
        <Text style={styles.sectionTitle}>General Site Pictures / Evidence</Text>
        <View style={styles.evidenceBox}>
          {evidence.length > 0 ? (
            evidence.map((item, index) => (
              <View key={`${item.checklistItemId}-${index}`} style={styles.evidenceItem}>
                <Text style={styles.label}>
                  Checklist item {item.checklistItemId}
                </Text>
                <Text>{item.description}</Text>
                {item.location ? <Text>Location: {item.location}</Text> : null}
                <Text style={styles.evidenceUrl}>Evidence reference: {item.url}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.muted}>
              {contract.part1.photosTaken
                ? 'Photos were recorded during the inspection, but no immutable photo attachment references were stored with this submission.'
                : 'No site photos were recorded for this inspection.'}
            </Text>
          )}
          <Text style={[styles.muted, { marginTop: 6, fontSize: 7.5 }]}>
            SiteCheck does not fetch or embed arbitrary external photo URLs during PDF generation. Evidence references above are reproduced exactly from the submitted inspection snapshot.
          </Text>
        </View>
        <Footer contract={contract} />
      </Page>
    </Document>
  );
}

export function InspectionContractPdf(input: {
  contract: InspectionReportContract;
}): ReactElement<DocumentProps> {
  return <ContractDocument contract={input.contract} />;
}
