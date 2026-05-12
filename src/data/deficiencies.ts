import { Deficiency } from '@/types/deficiency';

export const deficiencies: Deficiency[] = [
  {
    id: 'DEF-001',
    checkpointId: 'SC-3',
    detectedDate: '2026-03-28T14:23:00Z',
    description:
      'Sediment basin SC-3 outlet structure is partially blocked with debris, reducing discharge capacity by approximately 40%. Accumulated sediment has exceeded the 50% depth marker, requiring cleanout. The perforated decant holes on the lower section of the riser pipe are fully buried, and the emergency spillway is within 8 inches of being engaged.',
    cgpViolation: 'Section X.H.2.b \u2014 Sediment Basin Maintenance',
    correctiveAction:
      'Remove debris from outlet structure, perform sediment cleanout to restore basin to design capacity. Verify discharge rates meet design specifications. Install upstream debris rack to prevent future blockage. Document pre- and post-cleanout basin depth measurements.',
    deadline: '2026-03-31T14:23:00Z',
    status: 'open',
  },
  {
    id: 'DEF-002',
    checkpointId: 'MM-4',
    detectedDate: '2026-03-28T14:45:00Z',
    description:
      'Secondary concrete washout container (MM-4) near the west retaining wall is overflowing. High-pH wash water has pooled on the surrounding soil surface approximately 8-10 feet beyond the containment boundary. Alkaline staining on adjacent soil indicates this has occurred multiple times. The overflow creates a potential discharge pathway to storm drain inlet SD-2 located approximately 60 feet downslope.',
    cgpViolation: 'Section X.H.6.a \u2014 Concrete Washout Containment',
    correctiveAction:
      'Immediately pump out the washout container to restore capacity. Clean up pooled wash water from the surrounding ground surface using vacuum truck or absorbent material. Install a temporary containment berm (sandbags) around the container perimeter. Increase cleanout frequency to prevent future overflows. Evaluate whether a larger washout facility is needed for the ongoing west wall pours.',
    deadline: '2026-03-30T14:45:00Z',
    status: 'open',
  },
  {
    id: 'DEF-003',
    checkpointId: 'NS-2',
    detectedDate: '2026-03-28T15:10:00Z',
    description:
      'Dewatering discharge from the sanitary sewer trench excavation at NS-2 exceeded the numeric effluent limitation for turbidity. The most recent grab sample recorded 280 NTU, which exceeds the 250 NTU threshold established in the project SWPPP and CGP discharge requirements. The filter bag system appears clogged with fine-grained soils, reducing filtration effectiveness. Turbid standing water observed approximately 15 feet downstream of the filter bags.',
    cgpViolation: 'Section X.H.7.a \u2014 Non-Storm Water Discharge Limits',
    correctiveAction:
      'Immediately cease dewatering discharge until turbidity can be brought into compliance. Replace saturated filter bags with new units. Add a secondary treatment step such as a chitosan-enhanced flocculation system or route discharge through the Baker tank treatment train at NS-1. Increase sampling frequency to every 4 hours until three consecutive readings are below 250 NTU. Document all corrective actions and sampling results in the SWPPP amendment log.',
    deadline: '2026-03-30T15:10:00Z',
    status: 'open',
  },
];
