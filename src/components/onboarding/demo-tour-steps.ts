import type { LucideIcon } from 'lucide-react';
import {
  Sparkles,
  FileText,
  CheckCircle,
  Plane,
  ShieldAlert,
  CloudRain,
  FileBarChart,
} from 'lucide-react';

export interface DemoTourStepDef {
  id: string;
  title: string;
  description: string;
  /** Route the tour navigates to when this step becomes active. */
  targetRoute: string;
  icon: LucideIcon;
  accentColor: string;
  highlights: string[];
}

/**
 * 7-step guided tour for VCs / unauthenticated demo users.
 *
 * Each step navigates to a real route in the app and highlights pre-seeded
 * static demo data (`src/data/*.ts`). The deficient checkpoint `SC-3` is
 * picked because it has the most visually striking AI analysis + active
 * deficiency with a live countdown timer.
 */
export const demoTourSteps: DemoTourStepDef[] = [
  {
    id: 'welcome',
    title: 'Welcome to the live demo',
    description:
      "You're inside the real app with a sample construction site pre-loaded. Take this quick tour or close it and explore on your own.",
    targetRoute: '/dashboard',
    icon: Sparkles,
    accentColor: 'text-amber-500',
    highlights: [
      '34 BMP checkpoints across a 4.2-acre site',
      '3 active deficiencies with live 72-hour countdown timers',
      'Real-time activity feed + interactive site map',
    ],
  },
  {
    id: 'swppp',
    title: 'AI extracts your SWPPP',
    description:
      'Drop a Stormwater Pollution Prevention Plan PDF and Claude extracts every BMP, permit, and contact automatically — no more manual data entry.',
    targetRoute: '/swppp',
    icon: FileText,
    accentColor: 'text-violet-500',
    highlights: [
      'Page-level PDF viewer with confidence scores',
      'AI-extracted BMPs flow straight into mission planning',
      'Cross-references CGP sections automatically',
    ],
  },
  {
    id: 'checkpoints',
    title: '34 BMP checkpoints, geofenced',
    description:
      'Every Best Management Practice on the site is monitored, geofenced, and tied to a CGP section. Filter by status, zone, or BMP type.',
    targetRoute: '/checkpoints',
    icon: CheckCircle,
    accentColor: 'text-green-500',
    highlights: [
      'Sediment, erosion, tracking, wind, materials, and non-stormwater BMPs',
      'Status pills surface deficient BMPs in one click',
      'Each checkpoint links to AI analysis + deficiency history',
    ],
  },
  {
    id: 'mission',
    title: 'Drone mission replay',
    description:
      'Watch a completed inspection flight replay sample-by-sample. The drone hits each waypoint, captures a photo, and Claude analyzes every shot for compliance.',
    targetRoute: '/missions/MISSION-001',
    icon: Plane,
    accentColor: 'text-blue-400',
    highlights: [
      'Animated flight track over the planned route',
      '34 waypoints captured + AI-reviewed in 42 minutes',
      'Deviation overlay flags samples >30 ft off-path',
    ],
  },
  {
    id: 'deficiency',
    title: 'AI deficiency analysis',
    description:
      'When the drone catches a problem, Claude writes the finding, cites the CGP section, and starts a 72-hour corrective-action countdown — automatically.',
    targetRoute: '/checkpoints/SC-3',
    icon: ShieldAlert,
    accentColor: 'text-red-400',
    highlights: [
      'AI rationale with confidence score (88% on this one)',
      'Live countdown to the regulatory deadline',
      'Suggested corrective actions ready for QSP sign-off',
    ],
  },
  {
    id: 'weather',
    title: 'Weather-triggered inspections',
    description:
      'A 0.5"+ rain event auto-creates a draft post-storm inspection with a 48-hour CGP deadline. The system schedules the work; you just fly it.',
    targetRoute: '/weather',
    icon: CloudRain,
    accentColor: 'text-cyan-400',
    highlights: [
      '7-day forecast with QPE rain events highlighted',
      'Auto-drafts a post-storm inspection at the 0.5" threshold',
      'Color-tiered banner counts down to the 48-hour CGP cutoff',
    ],
  },
  {
    id: 'reports',
    title: 'Auto-generated compliance reports',
    description:
      'Every inspection rolls up into a CGP-compliant report — drone evidence, AI findings, QSP decisions, corrective actions, signature block — ready to hand a regulator.',
    targetRoute: '/reports',
    icon: FileBarChart,
    accentColor: 'text-orange-500',
    highlights: [
      '7-section report auto-populated from mission data',
      'Editable sections + digital signature block',
      'PDF export ready for regulatory submission',
    ],
  },
];
