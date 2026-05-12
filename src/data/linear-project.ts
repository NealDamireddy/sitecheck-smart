import { Project } from '@/types/project';

/**
 * Sample linear infrastructure project: a 5.2-mile natural gas pipeline
 * in the Central Valley, California.
 *
 * The corridor follows an existing utility easement from a compressor station
 * near Madera to a distribution point south of Fresno, roughly parallel to
 * SR-99. Construction involves open-trench installation with HDD (horizontal
 * directional drilling) at two waterway crossings.
 */
export const linearProject: Project = {
  id: 'valley-gas-pipeline',
  name: 'Central Valley Gas Pipeline — Phase 1',
  address: 'SR-99 Utility Corridor, Madera to Fresno, CA',
  permitNumber: 'CAS000047',
  wdid: '5B39C789012',
  riskLevel: 2,
  qsp: {
    name: 'Marcus Rivera',
    licenseNumber: 'QSP-6738',
    company: 'Valley Environmental Services',
    phone: '(559) 555-0287',
    email: 'mrivera@valleyenviro.com',
  },
  status: 'active',
  startDate: '2026-01-15',
  estimatedCompletion: '2027-06-01',
  acreage: 38.5,
  // Center of the corridor (midpoint)
  coordinates: { lat: 36.8450, lng: -119.7800 },
  // Bounding box enclosing the full corridor
  bounds: [
    [36.8050, -119.8100],
    [36.8850, -119.7500],
  ],
  projectType: 'linear',
  linearMileage: 5.2,
  corridor: {
    centerline: [
      // Northern terminus — compressor station near Madera
      [-119.7520, 36.8830],
      [-119.7545, 36.8790],
      [-119.7580, 36.8740],
      [-119.7620, 36.8690],
      [-119.7650, 36.8640],
      // Segment 1-2 boundary — Cottonwood Creek crossing
      [-119.7700, 36.8580],
      [-119.7730, 36.8530],
      [-119.7760, 36.8480],
      [-119.7790, 36.8430],
      // Segment 2-3 boundary — SR-145 crossing
      [-119.7820, 36.8380],
      [-119.7850, 36.8330],
      [-119.7870, 36.8280],
      [-119.7900, 36.8230],
      [-119.7930, 36.8180],
      // Segment 3-4 boundary — Dry Creek crossing
      [-119.7960, 36.8130],
      [-119.7990, 36.8080],
      [-119.8020, 36.8060],
      // Southern terminus — distribution point
      [-119.8050, 36.8050],
    ],
    corridorWidthFeet: 75,
    totalLength: 27456, // ~5.2 miles in feet
    linearUnit: 'feet',
  },
  segments: [
    {
      id: 'seg-north',
      name: 'North — Compressor to Cottonwood Creek',
      startStation: 0,
      endStation: 6864,
    },
    {
      id: 'seg-central',
      name: 'Central — Cottonwood Creek to SR-145',
      startStation: 6864,
      endStation: 13728,
    },
    {
      id: 'seg-south-upper',
      name: 'South Upper — SR-145 to Dry Creek',
      startStation: 13728,
      endStation: 20592,
    },
    {
      id: 'seg-south-lower',
      name: 'South Lower — Dry Creek to Distribution',
      startStation: 20592,
      endStation: 27456,
    },
  ],
  // ROW: 100-foot easement (50 ft each side of centerline)
  // Boundaries auto-generated from centerline + width when left/right are empty
  rowBoundaries: {
    left: [],
    right: [],
    easementDescription: 'Existing 100-ft utility easement granted by Madera County (Doc #2018-074521)',
    widthFeet: 100,
  },
  // Block 3 — Operating geofence. Hand-tuned envelope around the corridor
  // (~200 ft buffer beyond the 100-ft ROW) so the Phase 2 mock no-fly zones
  // (school, substation, airport buffer, wildlife area) sit *inside* the
  // fence and visibly demonstrate the rejection flow when a waypoint is
  // dragged onto one. Hard ceiling matches FAA Part 107 (400 ft AGL).
  geofence: {
    id: 'gf-valley-gas-pipeline',
    projectId: 'valley-gas-pipeline',
    name: 'Central Valley Gas Pipeline — Operating Envelope',
    source: 'manual',
    ceilingFeet: 400,
    floorFeet: 0,
    notes: 'FAA Part 107 ceiling. Buffered ~200 ft beyond the existing 100-ft easement.',
    polygon: [
      // North-east edge (right side of corridor, north → south)
      [-119.7470, 36.8860],
      [-119.7500, 36.8810],
      [-119.7530, 36.8760],
      [-119.7570, 36.8710],
      [-119.7600, 36.8660],
      [-119.7650, 36.8600],
      [-119.7680, 36.8550],
      [-119.7710, 36.8500],
      [-119.7720, 36.8450],
      [-119.7720, 36.8400],
      [-119.7720, 36.8350],
      [-119.7720, 36.8300],
      [-119.7720, 36.8250],
      [-119.7740, 36.8200],
      [-119.7770, 36.8150],
      [-119.7800, 36.8100],
      [-119.7850, 36.8030],
      [-119.7900, 36.7990],
      // South cap
      [-119.8000, 36.7990],
      [-119.8100, 36.8000],
      // South-west edge (left side of corridor, south → north)
      [-119.8200, 36.8050],
      [-119.8200, 36.8100],
      [-119.8150, 36.8150],
      [-119.8100, 36.8200],
      [-119.8050, 36.8260],
      [-119.8000, 36.8320],
      [-119.7960, 36.8390],
      [-119.7920, 36.8450],
      [-119.7890, 36.8510],
      [-119.7860, 36.8560],
      [-119.7820, 36.8610],
      [-119.7780, 36.8660],
      [-119.7740, 36.8710],
      [-119.7700, 36.8760],
      [-119.7660, 36.8810],
      [-119.7600, 36.8860],
      // North cap — close ring
      [-119.7470, 36.8860],
    ],
  },
};
