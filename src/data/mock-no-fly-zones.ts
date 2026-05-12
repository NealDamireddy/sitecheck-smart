import type { NoFlyZone } from '@/types/nofly-zone';

/**
 * Mock no-fly zones for the Central Valley Gas Pipeline demo project.
 * Used as the API fallback when Supabase is unavailable or returns 0 rows.
 *
 * Each polygon is a small closed ring near the corridor so that the
 * mission validation flow can be visibly demonstrated:
 *   - Lincoln Elementary sits just east of the corridor near the central segment
 *   - PG&E substation sits just west of the central segment
 *   - The wildlife area sits at the southern end (near Dry Creek)
 *   - The airport buffer is a larger zone covering the entire southern end
 */
export const mockNoFlyZones: NoFlyZone[] = [
  {
    id: 'nfz-fresno-yosemite',
    projectId: 'valley-gas-pipeline',
    name: 'Fresno Yosemite Intl 5 mi buffer',
    category: 'airport',
    polygon: [
      [-119.8200, 36.8000],
      [-119.7900, 36.8000],
      [-119.7900, 36.8200],
      [-119.8200, 36.8200],
      [-119.8200, 36.8000],
    ],
    floorFeet: 0,
    ceilingFeet: 400,
    description: 'FAA Class C airspace buffer around Fresno Yosemite International Airport.',
    source: 'FAA',
    active: true,
  },
  {
    id: 'nfz-lincoln-elementary',
    projectId: 'valley-gas-pipeline',
    name: 'Lincoln Elementary 500 ft buffer',
    category: 'school',
    polygon: [
      [-119.7780, 36.8480],
      [-119.7740, 36.8480],
      [-119.7740, 36.8510],
      [-119.7780, 36.8510],
      [-119.7780, 36.8480],
    ],
    description: 'Mandatory 500ft no-fly buffer around Lincoln Elementary School during school hours.',
    source: 'manual',
    active: true,
  },
  {
    id: 'nfz-pge-substation',
    projectId: 'valley-gas-pipeline',
    name: 'PG&E Madera Substation',
    category: 'critical-infra',
    polygon: [
      [-119.7820, 36.8300],
      [-119.7790, 36.8300],
      [-119.7790, 36.8330],
      [-119.7820, 36.8330],
      [-119.7820, 36.8300],
    ],
    description: 'Critical electrical infrastructure — coordinate with PG&E security before any flights.',
    source: 'manual',
    active: true,
  },
  {
    id: 'nfz-kings-river-wildlife',
    projectId: 'valley-gas-pipeline',
    name: 'Kings River Wildlife Area',
    category: 'wildlife',
    polygon: [
      [-119.8060, 36.8030],
      [-119.7990, 36.8030],
      [-119.7990, 36.8090],
      [-119.8060, 36.8090],
      [-119.8060, 36.8030],
    ],
    floorFeet: 0,
    ceilingFeet: 200,
    description: 'Sensitive wildlife habitat — minimum 200ft AGL outside of nesting season.',
    source: 'CDFW',
    active: true,
  },
];
