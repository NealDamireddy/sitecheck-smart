import type { LucideIcon } from 'lucide-react';
import {
  Monitor,
  FolderKanban,
  Home,
  FileText,
  Plane,
  CheckCircle,
  ClipboardCheck,
  CloudRain,
  FileBarChart,
  Rocket,
  Waypoints,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';

export const ONBOARDING_VERSION = 5;

export interface OnboardingStepDef {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accentColor: string;
  highlights: string[];
  interactive?: 'view-mode-selector';
}

export const onboardingSteps: OnboardingStepDef[] = [
  {
    id: 'welcome',
    title: 'Welcome to SiteCheck',
    description:
      'AI-powered construction compliance for drone-assisted inspections. Choose how you want to experience the platform.',
    icon: Monitor,
    accentColor: 'text-amber-500',
    interactive: 'view-mode-selector',
    highlights: [
      'Website mode: Full desktop layout with sidebar navigation',
      'App mode: Mobile-optimized panel with bottom navigation',
    ],
  },
  {
    id: 'project-switcher',
    title: 'Project Switcher',
    description:
      'Manage multiple construction sites from one dashboard. Click the project name in the top bar to switch between bounded-site and linear pipeline projects.',
    icon: FolderKanban,
    accentColor: 'text-amber-400',
    highlights: [
      'Bounded-site projects for traditional construction areas',
      'Linear pipeline projects for corridor-based infrastructure',
      'All data updates automatically when you switch projects',
    ],
  },
  {
    id: 'linear-projects',
    title: 'Linear Projects',
    description:
      'Pipelines, transmission lines, and other corridor-based infrastructure get a dedicated experience: centerline visualization, named segments, station-based labeling, and right-of-way (ROW) overlays.',
    icon: Waypoints,
    accentColor: 'text-emerald-400',
    highlights: [
      'Corridor centerline rendered on every map',
      'Named segments with start/end stations (e.g., STA 0+00 → STA 68+64)',
      'Right-of-way boundaries auto-generated from corridor width',
      'Create new linear projects by drawing on the map or uploading GeoJSON',
    ],
  },
  {
    id: 'crossings-permits',
    title: 'Crossings & Permits',
    description:
      'Track stream, road, utility, railroad, and wetland crossings along your corridor. Monitor permit expiration and stay ahead of regulatory deadlines.',
    icon: ShieldCheck,
    accentColor: 'text-cyan-400',
    highlights: [
      'Stream HDDs, road bores, utility crossings, rail crossings, and wetland approaches',
      'Per-crossing permit checklists (404, 401, NPDES, encroachment)',
      'Expiring permit alerts with 30-day warning badge on the dashboard',
      'Crossings panel grouped by segment with status tracking',
    ],
  },
  {
    id: 'airspace-safety',
    title: 'Airspace Safety',
    description:
      'Every drone mission is checked against your project geofence and any active no-fly zones (airports, schools, critical infrastructure, wildlife areas). SiteCheck refuses to save a mission that flies through restricted airspace.',
    icon: ShieldAlert,
    accentColor: 'text-red-400',
    highlights: [
      'Operating geofence enforced as a hard boundary on every flight path',
      'Live no-fly zone overlays rendered on every mission map',
      'Wizard panel disables Generate when the planned route violates a zone',
      'Route editor highlights offending waypoints with a red ring as you drag',
      'No-Fly Zones page (linear projects) for full CRUD on restricted areas',
    ],
  },
  {
    id: 'dashboard',
    title: 'Command Dashboard',
    description:
      'Your real-time command center. View compliance metrics, site or corridor maps, crossings, permits, and activity feeds at a glance.',
    icon: Home,
    accentColor: 'text-amber-500',
    highlights: [
      'BMP checkpoint counts and compliance rate',
      'Interactive site or corridor overview map with checkpoint and crossing markers',
      'Linear projects show corridor length, crossings, and active permits',
      'Live activity feed with recent inspections and events',
    ],
  },
  {
    id: 'swppp',
    title: 'SWPPP Intelligence',
    description:
      'Upload your Stormwater Pollution Prevention Plan and let AI extract every BMP checkpoint automatically.',
    icon: FileText,
    accentColor: 'text-violet-500',
    highlights: [
      'PDF upload with page-level document viewer',
      'AI-powered checkpoint extraction with confidence scores',
      'Direct mission generation from extracted checkpoints',
    ],
  },
  {
    id: 'missions',
    title: 'Drone Mission Center',
    description:
      'Plan, execute, and review drone inspection flights with a guided 3-step wizard. Linear projects automatically generate corridor-following flight paths.',
    icon: Plane,
    accentColor: 'text-blue-400',
    highlights: [
      'Choose inspection scope: full project, single segment, or station range',
      'AI-generated flight paths with waypoint editing',
      'Corridor-following routes that lower altitude near crossings for closer inspection',
      'Live telemetry, flight replay, and AI review',
    ],
  },
  {
    id: 'mission-replay-ai',
    title: 'Mission Replay & AI Review',
    description:
      'Every flight records a real telemetry track sample-by-sample. After completion, Claude analyzes each captured photo against the CGP, and your QSP accept/override decisions persist across sessions.',
    icon: Sparkles,
    accentColor: 'text-pink-400',
    highlights: [
      'Animated replay drives off the actual flight track in solid magenta over the dashed planned path',
      'Deviation overlay flags any sample more than 30 ft off the planned route',
      'Claude analyzes every captured photo for CGP compliance with one-click re-analyze',
      'QSP accept/override decisions persist across sessions and refreshes',
      'Mission auto-completes when the last waypoint is captured (or hit Complete Mission manually)',
    ],
  },
  {
    id: 'checkpoints',
    title: 'Checkpoint Inspector',
    description:
      'Filter, browse, and monitor all BMP checkpoints across your project with AI-assisted deficiency analysis.',
    icon: CheckCircle,
    accentColor: 'text-green-500',
    highlights: [
      'Filter by status, BMP type, zone, or corridor segment',
      'Detailed checkpoint cards with photo evidence',
      'Station-based labeling for linear pipeline projects',
    ],
  },
  {
    id: 'weather',
    title: 'Weather & Compliance',
    description:
      'Track weather conditions, precipitation events, and schedule inspections around compliance windows.',
    icon: CloudRain,
    accentColor: 'text-cyan-400',
    highlights: [
      'Current conditions and 7-day forecast',
      'QPE (Quantitative Precipitation Estimate) tracking',
      'Inspection timeline with compliance deadlines',
    ],
  },
  {
    id: 'reports',
    title: 'Inspection Reports',
    description:
      'Generate CGP-compliant inspection reports ready for regulatory submission.',
    icon: FileBarChart,
    accentColor: 'text-orange-500',
    highlights: [
      'Auto-generated from drone mission data',
      'Editable sections and digital signature blocks',
      'PDF export for regulatory submission',
    ],
  },
  {
    id: 'inspections-workflow',
    title: 'Inspections & Compliance Workflow',
    description:
      'Block 5 closes the regulatory loop. Rain events automatically draft post-storm inspections with a 48-hour countdown, every inspection rolls up the AI findings + QSP decisions from Block 4, and a single click renders a CGP-compliant PDF the regulator can read.',
    icon: ClipboardCheck,
    accentColor: 'text-amber-300',
    highlights: [
      'QPE rain events (≥0.5") auto-create draft inspections with a 48-hour CGP deadline',
      'Color-tiered banner on the dashboard: emerald → amber → red as the deadline narrows',
      'Inspection records page lists every draft, in-progress, and submitted inspection',
      'Detail page shows AI findings, QSP decisions, corrective actions, and a real PDF download',
      'Corrective actions track each AI deficiency from open → resolved with proof photos',
      'Submitting an inspection freezes it and links the rendered report permanently',
    ],
  },
  {
    id: 'ready',
    title: "You're All Set",
    description:
      'Your SiteCheck workspace is ready. Dive into the dashboard to start managing your project compliance.',
    icon: Rocket,
    accentColor: 'text-amber-500',
    highlights: [],
  },
];
