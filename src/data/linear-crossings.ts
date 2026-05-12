import type { Crossing } from '@/types/crossing';

/**
 * Mock crossings for the Central Valley Gas Pipeline demo project.
 * Stations are in feet along the corridor centerline (matching project_segments.start_station).
 *
 * Coordinates are placed roughly along the pipeline centerline defined in
 * `linear-project.ts`.
 */
export const linearCrossings: Crossing[] = [
  {
    id: 'crossing-cottonwood-creek',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-north',
    crossingType: 'stream',
    name: 'Cottonwood Creek HDD',
    stationNumber: 6864,
    stationLabel: 'STA 68+64',
    location: [-119.7700, 36.8580],
    description:
      'Horizontal directional drill (HDD) under Cottonwood Creek. 320-ft bore, ' +
      'minimum 25 ft cover below streambed. SWPPP requires entry/exit pit containment, ' +
      'fluid loss monitoring, and turbidity sampling 100 ft downstream.',
    permitsRequired: ['CWA-404', 'CWA-401', 'CDFW-1602'],
    status: 'approved',
  },
  {
    id: 'crossing-sr145',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-central',
    crossingType: 'road',
    name: 'SR-145 Highway Bore',
    stationNumber: 13728,
    stationLabel: 'STA 137+28',
    location: [-119.7820, 36.8380],
    description:
      'Jack-and-bore under State Route 145. Caltrans encroachment permit required. ' +
      'Casing pipe extends 10 ft beyond ROW on each side.',
    permitsRequired: ['Caltrans-Encroachment', 'County-ROW'],
    status: 'in-progress',
  },
  {
    id: 'crossing-existing-gas',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-central',
    crossingType: 'utility',
    name: 'PG&E 36" Gas Line Crossing',
    stationNumber: 16500,
    stationLabel: 'STA 165+00',
    location: [-119.7870, 36.8280],
    description:
      'Crossing existing PG&E 36-inch transmission line. PG&E standby required during excavation. ' +
      'Hand-dig within 24 inches of existing pipeline.',
    permitsRequired: ['PGE-Encroachment', 'USA-Mark'],
    status: 'pending',
  },
  {
    id: 'crossing-dry-creek',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-south-upper',
    crossingType: 'stream',
    name: 'Dry Creek HDD',
    stationNumber: 20592,
    stationLabel: 'STA 205+92',
    location: [-119.7960, 36.8130],
    description:
      'Second HDD crossing — Dry Creek (ephemeral). 220-ft bore. ' +
      'Stream is dry during construction window but riparian buffer protections apply.',
    permitsRequired: ['CWA-404', 'CDFW-1602'],
    status: 'approved',
  },
  {
    id: 'crossing-bnsf-rail',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-south-lower',
    crossingType: 'railroad',
    name: 'BNSF Rail Bore',
    stationNumber: 23800,
    stationLabel: 'STA 238+00',
    location: [-119.8000, 36.8090],
    description:
      'Bore under BNSF mainline track. BNSF flagger required. ' +
      '60-ft casing centered on track. No rail traffic interruption permitted.',
    permitsRequired: ['BNSF-Crossing', 'CPUC-General-Order-26-D'],
    status: 'flagged',
  },
  {
    id: 'crossing-distribution-wetland',
    projectId: 'valley-gas-pipeline',
    segmentId: 'seg-south-lower',
    crossingType: 'wetland',
    name: 'Distribution Approach Wetland',
    stationNumber: 26500,
    stationLabel: 'STA 265+00',
    location: [-119.8030, 36.8060],
    description:
      'Seasonal wetland adjacent to distribution point. Construction confined to dry season. ' +
      'Timber mats required for equipment access. USACE Nationwide Permit 12 applies.',
    permitsRequired: ['CWA-404-NWP12', 'CWA-401'],
    status: 'pending',
  },
];
