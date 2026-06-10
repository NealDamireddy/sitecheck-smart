export const SMARTS_DATETIME_FORMAT = "MM/DD/YYYY HH:MM" as const;

export function formatForSmarts(d: Date): string {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) {
    throw new Error("formatForSmarts: invalid Date");
  }
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  const yyyy = String(d.getUTCFullYear()).padStart(4, "0");
  const hh = pad2(d.getUTCHours());
  const min = pad2(d.getUTCMinutes());
  return `${mm}/${dd}/${yyyy} ${hh}:${min}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
