'use client';

import type {
  Part1Data,
  Part1Group,
  Part2Data,
  Part3Data,
} from '@/lib/cgp/report-data';
import type { ReportSectionData } from '@/types/report';

/**
 * Renders the three table-formatted sections (Part 1, Part 2, Part 3)
 * that mirror the regulator-submitted QSP inspection report. Each
 * dispatch goes to a small purpose-built sub-component so the markup
 * stays close to the visual structure of the template PDF.
 */
export function ReportTableSection({
  title,
  data,
}: {
  title: string;
  data: ReportSectionData;
}) {
  return (
    <div className="mb-6">
      <SectionBanner title={title} />
      {data.kind === 'part1' && <Part1Table data={data.payload} />}
      {data.kind === 'part2' && <Part2Table data={data.payload} />}
      {data.kind === 'part3' && <Part3Table data={data.payload} />}
    </div>
  );
}

function SectionBanner({ title }: { title: string }) {
  return (
    <div className="border border-neutral-400 bg-neutral-300 px-3 py-2">
      <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
    </div>
  );
}

function GroupBanner({ title }: { title: string }) {
  return (
    <tr>
      <td
        colSpan={4}
        className="border border-neutral-400 bg-neutral-300 px-3 py-1.5 text-[11px] font-bold text-neutral-900"
      >
        {title}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────
// Part 1 — General Information (key/value)
// ─────────────────────────────────────────────
function Part1Table({ data }: { data: Part1Data }) {
  return (
    <table className="w-full border-collapse text-[11px] text-neutral-800">
      <tbody>
        <tr>
          <td className="w-1/4 border border-neutral-400 bg-white px-3 py-1.5 font-bold">
            Date
          </td>
          <td className="border border-neutral-400 bg-white px-3 py-1.5" colSpan={3}>
            {data.date}
          </td>
        </tr>
        <tr>
          <td className="w-1/4 border border-neutral-400 bg-white px-3 py-1.5 font-bold">
            Inspection Type
          </td>
          <td className="border border-neutral-400 bg-white px-3 py-1.5" colSpan={3}>
            {data.inspectionType}
          </td>
        </tr>
        {data.groups.map((group) => (
          <Part1GroupRows key={group.heading} group={group} />
        ))}
      </tbody>
    </table>
  );
}

function Part1GroupRows({ group }: { group: Part1Group }) {
  return (
    <>
      <GroupBanner title={group.heading} />
      {group.rows.map((row, idx) => {
        if (row.kind === 'note') {
          return (
            <tr key={idx}>
              <td
                colSpan={4}
                className="border border-neutral-400 bg-white px-3 py-1.5"
              >
                <span className="font-bold">{row.label}</span>{' '}
                <span>{row.value}</span>
              </td>
            </tr>
          );
        }
        const [a, b] = row.cells;
        return (
          <tr key={idx}>
            <td className="w-1/4 border border-neutral-400 bg-white px-3 py-1.5 font-bold">
              {a.label}
            </td>
            <td className="w-1/4 border border-neutral-400 bg-white px-3 py-1.5">
              {a.value || ' '}
            </td>
            {b ? (
              <>
                <td className="w-1/4 border border-neutral-400 bg-white px-3 py-1.5 font-bold">
                  {b.label}
                </td>
                <td className="w-1/4 border border-neutral-400 bg-white px-3 py-1.5">
                  {b.value || ' '}
                </td>
              </>
            ) : (
              <td className="border border-neutral-400 bg-white px-3 py-1.5" colSpan={2}>
                {' '}
              </td>
            )}
          </tr>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────
// Part 2 — BMP Observations (3-column checklist)
// ─────────────────────────────────────────────
function Part2Table({ data }: { data: Part2Data }) {
  return (
    <table className="w-full border-collapse text-[11px] text-neutral-800">
      <thead>
        <tr>
          <th className="w-1/2 border border-neutral-400 bg-white px-3 py-1.5 text-left font-bold">
            Minimum BMPs for Risk Level {data.riskLevel} Sites
          </th>
          <th className="w-1/4 border border-neutral-400 bg-white px-3 py-1.5 text-left font-bold">
            Adequately designed, implemented and effective?
          </th>
          <th className="w-1/4 border border-neutral-400 bg-white px-3 py-1.5 text-left font-bold">
            Action Implemented Date
          </th>
        </tr>
      </thead>
      <tbody>
        {data.categories.map((cat) => (
          <Part2CategoryRows key={cat.number} category={cat} />
        ))}
      </tbody>
    </table>
  );
}

function Part2CategoryRows({ category }: { category: Part2Data['categories'][number] }) {
  return (
    <>
      <tr>
        <td
          colSpan={3}
          className="border border-neutral-400 bg-neutral-300 px-3 py-1.5 text-[11px] font-bold text-neutral-900"
        >
          {category.number} - {category.title}
        </td>
      </tr>
      {category.questions.map((q) => {
        const isNo = q.answer === 'No';
        return (
          <tr key={q.id}>
            <td className="border border-neutral-400 bg-white px-3 py-1.5">
              {q.number} — {q.prompt}
            </td>
            <td
              className={`border border-neutral-400 bg-white px-3 py-1.5 ${
                isNo ? 'text-red-600 font-semibold' : ''
              }`}
            >
              {q.answer}
            </td>
            <td
              className={`border border-neutral-400 bg-white px-3 py-1.5 ${
                isNo ? 'text-red-600' : ''
              }`}
            >
              {q.actionDate}
            </td>
          </tr>
        );
      })}
    </>
  );
}

// ─────────────────────────────────────────────
// Part 3 — Deficiencies (2-column)
// ─────────────────────────────────────────────
function Part3Table({ data }: { data: Part3Data }) {
  if (data.rows.length === 0) {
    return (
      <div className="border border-neutral-400 border-t-0 bg-white px-3 py-3 text-[11px] text-neutral-600">
        No active deficiencies identified during this inspection.
      </div>
    );
  }
  return (
    <table className="w-full border-collapse text-[11px] text-neutral-800">
      <thead>
        <tr>
          <th className="w-1/2 border border-neutral-400 bg-white px-3 py-1.5 text-left font-bold">
            Deficiency
          </th>
          <th className="w-1/2 border border-neutral-400 bg-white px-3 py-1.5 text-left font-bold">
            Recommendations
            <span className="ml-2 font-normal text-neutral-600">
              Note – Repairs must begin within 72 hours of identification and
              complete repairs as soon as possible.
            </span>
          </th>
        </tr>
      </thead>
      <tbody>
        {data.rows.map((row, idx) => (
          <tr key={idx}>
            <td className="border border-neutral-400 bg-white px-3 py-1.5 align-top text-red-700">
              {row.deficiency}
            </td>
            <td className="border border-neutral-400 bg-white px-3 py-1.5 align-top text-red-700">
              {row.recommendation}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
