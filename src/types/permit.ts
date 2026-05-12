/**
 * Segment-level permits for linear infrastructure projects.
 *
 * A SegmentPermit represents a single environmental, encroachment, or
 * jurisdictional permit attached to a project, segment, or crossing.
 */

export type PermitStatus =
  | 'active'
  | 'expiring'
  | 'expired'
  | 'pending'
  | 'revoked';

/**
 * Common permit type identifiers (free-text in DB to support arbitrary
 * permit types, but these are the documented standard values).
 */
export type PermitType =
  | 'CWA-404'
  | 'CWA-401'
  | 'NPDES-CGP'
  | 'CDFW-1602'
  | 'Caltrans-Encroachment'
  | 'County-ROW'
  | 'BNSF-Crossing'
  | 'CPUC-General-Order-26-D'
  | 'PGE-Encroachment'
  | 'USA-Mark'
  | 'CWA-404-NWP12'
  | 'local-encroachment'
  | string;

export interface SegmentPermit {
  id: string;
  projectId: string;
  segmentId?: string;
  crossingId?: string;
  permitType: PermitType;
  permitNumber?: string;
  agency?: string;
  issuedDate?: string;
  expirationDate?: string;
  status: PermitStatus;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export const PERMIT_STATUS_LABELS: Record<PermitStatus, string> = {
  active: 'Active',
  expiring: 'Expiring',
  expired: 'Expired',
  pending: 'Pending',
  revoked: 'Revoked',
};

export const PERMIT_STATUS_COLORS: Record<
  PermitStatus,
  { bg: string; text: string; border: string }
> = {
  active: { bg: 'bg-green-500/10', text: 'text-green-300', border: 'border-green-500/30' },
  expiring: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/30' },
  expired: { bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/30' },
  pending: { bg: 'bg-gray-500/10', text: 'text-gray-300', border: 'border-gray-500/30' },
  revoked: { bg: 'bg-rose-500/10', text: 'text-rose-300', border: 'border-rose-500/30' },
};

/**
 * Compute a derived permit status from its expiration date.
 * If `status` is already 'revoked' or 'pending', that takes priority.
 */
export function deriveLivePermitStatus(permit: SegmentPermit, now = new Date()): PermitStatus {
  if (permit.status === 'revoked' || permit.status === 'pending') return permit.status;
  if (!permit.expirationDate) return permit.status;
  const exp = new Date(permit.expirationDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = (exp.getTime() - now.getTime()) / msPerDay;
  if (daysRemaining < 0) return 'expired';
  if (daysRemaining < 30) return 'expiring';
  return 'active';
}
