/**
 * Per-entity, per-field conflict-resolution policies.
 *
 * ⚠️  STUB — populated incrementally by the sync-queue PR.
 *
 * The offline foundations slice does not yet replay queued writes, so
 * nothing reads this map at runtime today. It exists so future PRs
 * can land per-entity field classification without touching the
 * service worker or the client read paths.
 *
 * The agreed policy (per the offline-first spec):
 *   • numeric fields  → server timestamps win on conflict
 *   • narrative text  → last-write-wins per field
 *   • photo blobs     → queued upload always proceeds
 *
 * Add an entity by extending the union below and filling in the
 * matching record. Do NOT silently extend with `any` — the explicit
 * union is what makes `policyFor()` exhaustive at the call site.
 */

export type ConflictPolicy = 'server-numeric-wins' | 'last-write-wins' | 'always-replay';

export type OfflineEntity =
  | 'inspection'
  | 'sample'
  | 'parameter_result'
  | 'photo'
  | 'checkpoint'
  | 'deficiency';

export type FieldPolicies<T extends string> = Record<T, ConflictPolicy>;

/**
 * Field-level policy maps. Every column the client may send through
 * the sync queue must appear here so the replay path can pick the
 * right resolution rule. Server-only columns (id, created_at,
 * updated_at) are intentionally absent.
 */
export const FIELD_POLICIES: {
  inspection: FieldPolicies<'notes' | 'qsp_signature' | 'narrative'>;
  sample: FieldPolicies<'sample_datetime' | 'qsp_name'>;
  parameter_result: FieldPolicies<
    'result' | 'mdl' | 'rl' | 'qualifier' | 'units' | 'analytical_method'
  >;
  photo: FieldPolicies<'blob' | 'caption'>;
  checkpoint: FieldPolicies<'status' | 'narrative'>;
  deficiency: FieldPolicies<'severity_score' | 'description' | 'corrective_action'>;
} = {
  inspection: {
    notes: 'last-write-wins',
    qsp_signature: 'last-write-wins',
    narrative: 'last-write-wins',
  },
  sample: {
    sample_datetime: 'server-numeric-wins',
    qsp_name: 'last-write-wins',
  },
  parameter_result: {
    result: 'server-numeric-wins',
    mdl: 'server-numeric-wins',
    rl: 'server-numeric-wins',
    qualifier: 'last-write-wins',
    units: 'last-write-wins',
    analytical_method: 'last-write-wins',
  },
  photo: {
    blob: 'always-replay',
    caption: 'last-write-wins',
  },
  checkpoint: {
    status: 'last-write-wins',
    narrative: 'last-write-wins',
  },
  deficiency: {
    severity_score: 'server-numeric-wins',
    description: 'last-write-wins',
    corrective_action: 'last-write-wins',
  },
};

export function policyFor(entity: OfflineEntity, field: string): ConflictPolicy | undefined {
  const map = (FIELD_POLICIES as Record<string, Record<string, ConflictPolicy>>)[entity];
  return map?.[field];
}
