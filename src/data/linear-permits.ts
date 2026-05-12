import type { SegmentPermit } from '@/types/permit';

/**
 * Mock segment permits for the Central Valley Gas Pipeline demo project.
 * Includes one expiring-soon permit so the dashboard alert is visible.
 */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export const linearPermits: SegmentPermit[] = [
  {
    id: 'permit-cgp-master',
    projectId: 'valley-gas-pipeline',
    permitType: 'NPDES-CGP',
    permitNumber: 'CAS000047',
    agency: 'California State Water Board',
    issuedDate: '2025-12-01',
    expirationDate: daysFromNow(540),
    status: 'active',
    notes: 'Master CGP coverage for the entire pipeline corridor.',
  },
  {
    id: 'permit-cottonwood-404',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-north',
    crossingId: 'crossing-cottonwood-creek',
    permitType: 'CWA-404',
    permitNumber: 'SPK-2025-00874',
    agency: 'USACE Sacramento District',
    issuedDate: '2025-11-15',
    expirationDate: daysFromNow(280),
    status: 'active',
    notes: 'Nationwide Permit 12 verification for Cottonwood Creek HDD.',
  },
  {
    id: 'permit-cottonwood-401',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-north',
    crossingId: 'crossing-cottonwood-creek',
    permitType: 'CWA-401',
    permitNumber: 'CRV5-2025-0042',
    agency: 'Central Valley RWQCB',
    issuedDate: '2025-11-22',
    expirationDate: daysFromNow(15),
    status: 'expiring',
    notes: 'Water quality certification — RENEWAL REQUIRED within 15 days.',
  },
  {
    id: 'permit-sr145-encroachment',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-central',
    crossingId: 'crossing-sr145',
    permitType: 'Caltrans-Encroachment',
    permitNumber: 'EP-06-25-N-0312',
    agency: 'Caltrans District 6',
    issuedDate: '2025-12-10',
    expirationDate: daysFromNow(180),
    status: 'active',
    notes: 'Jack-and-bore encroachment under SR-145.',
  },
  {
    id: 'permit-bnsf',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-south-lower',
    crossingId: 'crossing-bnsf-rail',
    permitType: 'BNSF-Crossing',
    permitNumber: 'BNSF-XING-2026-118',
    agency: 'BNSF Railway',
    issuedDate: '2025-10-30',
    expirationDate: daysFromNow(365),
    status: 'active',
    notes: 'Pipeline crossing agreement w/ flagger requirement.',
  },
  {
    id: 'permit-dry-creek-404',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-south-upper',
    crossingId: 'crossing-dry-creek',
    permitType: 'CWA-404',
    permitNumber: 'SPK-2025-00875',
    agency: 'USACE Sacramento District',
    issuedDate: '2025-11-15',
    expirationDate: daysFromNow(280),
    status: 'active',
    notes: 'NWP-12 for Dry Creek HDD.',
  },
];
