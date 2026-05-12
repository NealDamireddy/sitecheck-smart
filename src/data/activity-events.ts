import { ActivityEvent } from '@/types/activity';

export const activityEvents: ActivityEvent[] = [
  {
    id: 'EVT-001',
    type: 'document',
    title: 'SWPPP Amendment Uploaded',
    description:
      'SWPPP Amendment #4 uploaded and approved. Updates include revised sediment basin capacity calculations for the southwest outfall and addition of secondary concrete washout facility near the west retaining wall.',
    timestamp: '2026-03-27T09:30:00Z',
    severity: 'info',
    linkedEntityId: 'riverside-phase2',
    linkedEntityType: 'project',
  },
  {
    id: 'EVT-002',
    type: 'inspection',
    title: 'Routine Inspection Scheduled',
    description:
      'Weekly routine BMP inspection scheduled for March 28. All 34 checkpoints queued for drone survey and AI analysis.',
    timestamp: '2026-03-27T10:15:00Z',
    severity: 'info',
    linkedEntityId: 'INS-005',
    linkedEntityType: 'inspection',
  },
  {
    id: 'EVT-003',
    type: 'weather',
    title: 'Storm System Advisory',
    description:
      'National Weather Service has issued an advisory for a Pacific storm system expected to reach the Central Valley by April 1. Estimated rainfall accumulation of 0.5 to 1.0 inches over 48 hours. Pre-storm inspection recommended.',
    timestamp: '2026-03-27T14:00:00Z',
    severity: 'warning',
  },
  {
    id: 'EVT-004',
    type: 'drone',
    title: 'Drone Mission Initiated',
    description:
      'Alpha Survey \u2014 Full Site mission launched. DJI Matrice 350 RTK departed from launch point at north equipment yard. 34 waypoints programmed for full-site BMP coverage.',
    timestamp: '2026-03-28T08:45:00Z',
    severity: 'info',
    linkedEntityId: 'MISSION-001',
    linkedEntityType: 'mission',
  },
  {
    id: 'EVT-005',
    type: 'drone',
    title: 'Drone Mission Completed',
    description:
      'Alpha Survey \u2014 Full Site completed successfully. All 34 waypoints captured. Total flight time: 42 minutes. Battery consumption: 78% to 24%. AI analysis pipeline initiated.',
    timestamp: '2026-03-28T09:27:00Z',
    severity: 'info',
    linkedEntityId: 'MISSION-001',
    linkedEntityType: 'mission',
  },
  {
    id: 'EVT-006',
    type: 'deficiency',
    title: 'Deficiency Detected \u2014 SC-3',
    description:
      'AI analysis flagged sediment basin SC-3 at the southwest outfall. Outlet structure partially blocked with debris, and accumulated sediment has exceeded the 50% depth marker. Corrective action required within 72 hours.',
    timestamp: '2026-03-28T10:02:00Z',
    severity: 'critical',
    linkedEntityId: 'SC-3',
    linkedEntityType: 'checkpoint',
  },
  {
    id: 'EVT-007',
    type: 'deficiency',
    title: 'Deficiency Detected \u2014 MM-4',
    description:
      'AI analysis identified concrete washout MM-4 (secondary) near the west retaining wall is overflowing. Wash water has pooled outside the containment area. Immediate containment and cleanout required.',
    timestamp: '2026-03-28T10:08:00Z',
    severity: 'critical',
    linkedEntityId: 'MM-4',
    linkedEntityType: 'checkpoint',
  },
  {
    id: 'EVT-008',
    type: 'deficiency',
    title: 'Deficiency Detected \u2014 NS-2',
    description:
      'Dewatering discharge at NS-2 (utility trench) exceeded turbidity limits. Last sampling recorded 280 NTU, which is above the 250 NTU threshold. Filter bag system requires replacement or supplemental treatment.',
    timestamp: '2026-03-28T10:15:00Z',
    severity: 'critical',
    linkedEntityId: 'NS-2',
    linkedEntityType: 'checkpoint',
  },
  {
    id: 'EVT-009',
    type: 'inspection',
    title: 'AI Analysis Complete',
    description:
      'Full-site AI analysis completed for all 34 checkpoints. Results: 28 compliant, 3 deficient, 3 needs review. Overall site compliance score: 82%. Three corrective action items generated.',
    timestamp: '2026-03-28T10:30:00Z',
    severity: 'info',
    linkedEntityId: 'INS-005',
    linkedEntityType: 'inspection',
  },
  {
    id: 'EVT-010',
    type: 'alert',
    title: 'Corrective Action Deadline Set',
    description:
      'Corrective action deadlines assigned: SC-3 sediment basin cleanout due by March 31, MM-4 concrete washout containment due by March 30, NS-2 dewatering turbidity correction due by March 30.',
    timestamp: '2026-03-28T11:00:00Z',
    severity: 'warning',
  },
  {
    id: 'EVT-011',
    type: 'weather',
    title: 'QPE Forecast Warning',
    description:
      'Updated NWS forecast shows a qualifying precipitation event (QPE) likely on April 2 with an estimated 0.62 inches of rainfall. Post-storm inspection will be required within 24 hours of cessation of storm event per CGP requirements.',
    timestamp: '2026-03-28T15:30:00Z',
    severity: 'warning',
  },
  {
    id: 'EVT-012',
    type: 'alert',
    title: 'Pre-Storm Preparation Reminder',
    description:
      'Storm system arriving in 3 days. Recommended actions: verify all BMPs are functional, address open deficiencies before rainfall, confirm sediment basin capacity, check inlet protections, and secure material storage areas.',
    timestamp: '2026-03-29T07:00:00Z',
    severity: 'warning',
  },
  {
    id: 'EVT-013',
    type: 'inspection',
    title: 'Compliance Report Generated',
    description:
      'CGP compliance report auto-generated for the March 28 inspection. Report includes AI analysis summaries for all 34 BMPs, 3 deficiency corrective actions, and QSP certification block. Pending QSP signature.',
    timestamp: '2026-03-29T08:00:00Z',
    severity: 'info',
    linkedEntityId: 'INS-005',
    linkedEntityType: 'inspection',
  },
  {
    id: 'EVT-014',
    type: 'document',
    title: 'Rain Gauge Calibration Logged',
    description:
      'On-site rain gauge (Onset HOBO RG3-M) calibration verified. Tipping bucket mechanism confirmed accurate at 0.01-inch resolution. Calibration certificate uploaded to project documents.',
    timestamp: '2026-03-29T08:30:00Z',
    severity: 'info',
    linkedEntityId: 'riverside-phase2',
    linkedEntityType: 'project',
  },
];
