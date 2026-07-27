/**
 * Planning logic for replacing a sample's parameter_results set.
 *
 * The samples POST route must never destroy recorded readings before
 * their replacements are safely written (SEC-06). The plan separates the
 * write into three phases the route applies in a fixed, loss-proof order:
 *
 *   1. updates    — existing rows for parameters present in the incoming
 *                   set are updated in place (old data replaced atomically
 *                   per row by Postgres).
 *   2. inserts    — parameters with no existing row are inserted.
 *   3. deleteIds  — existing rows whose parameter is absent from the
 *                   incoming set are deleted LAST, after updates and
 *                   inserts succeeded.
 *
 * Failure at any phase must abort the request loudly. Worst cases by
 * phase: (1) old row intact, (2) partial new rows visible, (3) a stale
 * extra parameter row remains. None of them silently lose data.
 */

export interface ExistingParameterRow {
  id: string;
  parameter: string;
}

export interface IncomingParameterResult {
  parameter: string;
  qualifier: string;
  result: number | null;
  units: string;
  analytical_method: string;
  mdl: number | null;
  rl: number | null;
  analyzed_by: string;
}

export interface ParameterReplacePlan {
  /** Row id → new column values, for parameters that already exist. */
  updates: { id: string; values: IncomingParameterResult }[];
  /** New rows to insert, for parameters with no existing row. */
  inserts: IncomingParameterResult[];
  /** Existing row ids to delete, for parameters no longer present. */
  deleteIds: string[];
}

export function planParameterReplace(
  existing: ExistingParameterRow[],
  incoming: IncomingParameterResult[]
): ParameterReplacePlan {
  const existingByParameter = new Map(existing.map((row) => [row.parameter, row]));
  const incomingParameters = new Set(incoming.map((pr) => pr.parameter));

  const updates: ParameterReplacePlan['updates'] = [];
  const inserts: IncomingParameterResult[] = [];
  for (const pr of incoming) {
    const match = existingByParameter.get(pr.parameter);
    if (match) {
      updates.push({ id: match.id, values: pr });
    } else {
      inserts.push(pr);
    }
  }

  const deleteIds = existing
    .filter((row) => !incomingParameters.has(row.parameter))
    .map((row) => row.id);

  return { updates, inserts, deleteIds };
}
