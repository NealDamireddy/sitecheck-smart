'use client';

import { useState, useMemo, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { ProjectTypeSelector } from '@/components/projects/project-type-selector';
import { GeoJsonUpload } from '@/components/projects/geojson-upload';
import { SegmentBuilder } from '@/components/projects/segment-builder';
import {
  MonitoringLocationsBuilder,
  type MonitoringLocationDraft,
} from '@/components/projects/monitoring-locations-builder';
import { centerlineLengthFeet, formatLinearLength } from '@/lib/format';
import { useProjectStore } from '@/stores/project-store';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import type { ProjectType, ProjectSegment, Project } from '@/types/project';

/** sessionStorage keys used by /swppp to hand off extracted SWPPP data. */
const SWPPP_PREFILL_KEY = 'sitecheck-swppp-prefill';
const SWPPP_CHECKPOINTS_KEY = 'sitecheck-swppp-checkpoints';

interface SwpppPrefill {
  projectName?: string;
  address?: string;
  totalAcres?: number;
  riskLevel?: string;
  centerLat?: number;
  centerLng?: number;
}

/** Shape of the checkpoints handed over from /swppp. */
interface ExtractedCheckpointDraft {
  id: string;
  name: string;
  bmpType: string;
  description?: string;
  cgpSection?: string;
  zone?: string;
  lat?: number;
  lng?: number;
}

const CorridorDrawMap = dynamic(
  () => import('@/components/projects/corridor-draw-map').then((m) => ({ default: m.CorridorDrawMap })),
  { ssr: false, loading: () => <div className="h-[450px] animate-pulse rounded-lg bg-elevated" /> }
);

const STEPS = [
  { id: 'type', label: 'Type' },
  { id: 'basic', label: 'Basic Info' },
  { id: 'corridor', label: 'Corridor' },
  { id: 'segments', label: 'Segments' },
  { id: 'row', label: 'ROW' },
  { id: 'monitoring', label: 'Monitoring' },
  { id: 'review', label: 'Review' },
];

/**
 * useSearchParams() forces this component to opt out of static prerender,
 * so it must sit under a Suspense boundary — Next.js fails the production
 * build otherwise (the dev server doesn't catch it). The default export
 * below provides that boundary; NewProjectWizard holds the actual UI.
 */
function NewProjectWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);

  const [currentStep, setCurrentStep] = useState(0);
  const [projectType, setProjectType] = useState<ProjectType>('linear');

  // Basic info
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [permitNumber, setPermitNumber] = useState('');
  const [wdid, setWdid] = useState('');
  const [riskLevel, setRiskLevel] = useState<1 | 2 | 3>(2);
  const [acreage, setAcreage] = useState<number>(0);
  const [qspName, setQspName] = useState('');
  const [qspLicense, setQspLicense] = useState('');
  const [qspCompany, setQspCompany] = useState('');
  const [qspPhone, setQspPhone] = useState('');
  const [qspEmail, setQspEmail] = useState('');

  // Corridor
  const [centerline, setCenterline] = useState<[number, number][]>([]);
  const [corridorWidthFeet, setCorridorWidthFeet] = useState(75);
  const [corridorTab, setCorridorTab] = useState<'draw' | 'upload'>('draw');

  // Segments
  const [segments, setSegments] = useState<ProjectSegment[]>([]);

  // ROW
  const [rowWidthFeet, setRowWidthFeet] = useState(100);
  const [easementDescription, setEasementDescription] = useState('');

  // Monitoring locations (sampling points). Required for SMARTS capture.
  const [monitoringLocations, setMonitoringLocations] = useState<
    MonitoringLocationDraft[]
  >([]);

  // Checkpoints extracted by Claude on the /swppp screen, persisted as
  // real DB rows after the project is created so the BMP detail pages
  // and photo upload route have rows to attach data to.
  const [extractedCheckpoints, setExtractedCheckpoints] = useState<
    ExtractedCheckpointDraft[]
  >([]);

  // Center coords — populated either from SWPPP prefill (bounded sites) or
  // from the first centerline vertex (linear). Used to seed lat/lng on
  // newly added monitoring locations.
  const [prefillCenter, setPrefillCenter] = useState<
    { lat: number; lng: number } | null
  >(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read SWPPP-extracted prefill (if any) on mount. The /swppp page stashes
  // siteInfo in sessionStorage before routing here with ?source=swppp.
  useEffect(() => {
    if (searchParams.get('source') !== 'swppp') return;
    if (typeof window === 'undefined') return;
    try {
      const raw = sessionStorage.getItem(SWPPP_PREFILL_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as SwpppPrefill;
      if (parsed.projectName) setName(parsed.projectName);
      if (parsed.address) setAddress(parsed.address);
      if (parsed.totalAcres) setAcreage(parsed.totalAcres);
      if (parsed.riskLevel) {
        const m = parsed.riskLevel.match(/[1-3]/);
        if (m) setRiskLevel(Number(m[0]) as 1 | 2 | 3);
      }
      if (parsed.centerLat != null && parsed.centerLng != null) {
        setPrefillCenter({ lat: parsed.centerLat, lng: parsed.centerLng });
      }
      // SWPPP-sourced sites are bounded by default — corridor isn't extracted.
      setProjectType('bounded-site');
      sessionStorage.removeItem(SWPPP_PREFILL_KEY);
    } catch {
      // Bad JSON — silently ignore and let the user fill manually.
    }

    // Pull extracted checkpoints (if any) for later persistence.
    try {
      const rawCps = sessionStorage.getItem(SWPPP_CHECKPOINTS_KEY);
      if (rawCps) {
        const parsed = JSON.parse(rawCps);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setExtractedCheckpoints(parsed as ExtractedCheckpointDraft[]);
        }
        sessionStorage.removeItem(SWPPP_CHECKPOINTS_KEY);
      }
    } catch {
      // Bad JSON — drop them.
    }
  }, [searchParams]);

  // Pre-fill QSP fields from the user's account profile. The wizard
  // still writes a per-project copy on submit; this just avoids retyping
  // the same name / license # / company on every new site.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/qsp-profile');
        if (!res.ok) return;
        const profile = (await res.json()) as {
          name?: string;
          licenseNumber?: string;
          company?: string;
          phone?: string;
          email?: string;
        };
        if (cancelled) return;
        // Only fill blanks — never clobber a value the user already typed.
        setQspName((cur) => cur || profile.name || '');
        setQspLicense((cur) => cur || profile.licenseNumber || '');
        setQspCompany((cur) => cur || profile.company || '');
        setQspPhone((cur) => cur || profile.phone || '');
        setQspEmail((cur) => cur || profile.email || '');
      } catch {
        // Profile fetch is best-effort — wizard works without it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived
  const corridorLengthFeet = useMemo(() => centerlineLengthFeet(centerline), [centerline]);
  const corridorLengthMiles = corridorLengthFeet / 5280;

  const visibleSteps = projectType === 'linear' ? STEPS : STEPS.filter((s) => s.id !== 'corridor' && s.id !== 'segments' && s.id !== 'row');
  const step = visibleSteps[currentStep];

  // Center coord for seeding new monitoring locations: SWPPP prefill wins,
  // else first centerline vertex (linear), else nothing.
  const monitoringCenter = prefillCenter
    ? prefillCenter
    : centerline.length > 0
      ? { lat: centerline[0][1], lng: centerline[0][0] }
      : null;

  const canProceed = (): boolean => {
    switch (step?.id) {
      case 'type':
        return !!projectType;
      case 'basic':
        return name.trim().length > 0;
      case 'corridor':
        return centerline.length >= 2;
      case 'segments':
        return true; // optional
      case 'row':
        return true; // optional
      case 'monitoring':
        // Each row must have name + drainage area filled.
        return monitoringLocations.every(
          (loc) => loc.name.trim().length > 0 && loc.drainageArea.trim().length > 0,
        );
      case 'review':
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < visibleSteps.length - 1) setCurrentStep(currentStep + 1);
  };
  const handleBack = () => {
    if (currentStep > 0) setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const payload: Partial<Project> = {
        id,
        name: name.trim(),
        address: address.trim(),
        permitNumber: permitNumber.trim(),
        wdid: wdid.trim(),
        riskLevel,
        qsp: {
          name: qspName.trim(),
          licenseNumber: qspLicense.trim(),
          company: qspCompany.trim(),
          phone: qspPhone.trim(),
          email: qspEmail.trim(),
        },
        status: 'active',
        startDate: new Date().toISOString().slice(0, 10),
        estimatedCompletion: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        acreage,
        coordinates:
          centerline.length > 0
            ? { lng: centerline[0][0], lat: centerline[0][1] }
            : prefillCenter
              ? { lat: prefillCenter.lat, lng: prefillCenter.lng }
              : { lat: 36.78, lng: -119.42 },
        bounds:
          centerline.length > 0
            ? [
                [
                  Math.min(...centerline.map((c) => c[1])),
                  Math.min(...centerline.map((c) => c[0])),
                ],
                [
                  Math.max(...centerline.map((c) => c[1])),
                  Math.max(...centerline.map((c) => c[0])),
                ],
              ]
            : [
                [36.78, -119.42],
                [36.79, -119.41],
              ],
        projectType,
      };

      if (projectType === 'linear') {
        payload.corridor = {
          centerline,
          corridorWidthFeet,
          totalLength: Math.round(corridorLengthFeet),
          linearUnit: 'feet',
        };
        payload.linearMileage = Number(corridorLengthMiles.toFixed(2));
        payload.segments = segments;
        payload.rowBoundaries = {
          left: [],
          right: [],
          easementDescription: easementDescription.trim() || undefined,
          widthFeet: rowWidthFeet,
        };
      }

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to create project: ${res.status}`);
      }

      // Chain monitoring-location creates. We intentionally do NOT roll the
      // project back if a location fails — the project itself is valid; a
      // failed location just gets reported and the QSP can re-add it from
      // a future "manage locations" screen.
      const locationErrors: string[] = [];
      for (const loc of monitoringLocations) {
        const locRes = await fetch('/api/monitoring-locations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: id,
            name: loc.name.trim(),
            drainageArea: loc.drainageArea.trim(),
            dischargePointType: loc.dischargePointType,
            isAts: loc.isAts,
            isPassiveTreatment: loc.isPassiveTreatment,
            description: loc.description?.trim() || undefined,
            latitude: loc.latitude,
            longitude: loc.longitude,
            status: 'active',
          }),
        });
        if (!locRes.ok) {
          const errBody = await locRes.json().catch(() => ({}));
          locationErrors.push(
            `${loc.name}: ${errBody.error || `HTTP ${locRes.status}`}`,
          );
        }
      }

      // Chain checkpoint creates from the SWPPP extraction. Same partial-
      // failure stance as monitoring locations — a failed checkpoint
      // doesn't roll back the project. The static demo data renders
      // anyway as a fallback in CheckpointDetail, so the QSP can keep
      // going; failed rows just won't accept photo uploads until re-added.
      //
      // Defaults below cover NOT NULL / CHECK columns the SWPPP extraction
      // doesn't fill: priority, zone, install_date. Claude returns zone
      // most of the time but we still coerce to a valid CHECK value.
      const ALLOWED_ZONES = new Set([
        'north',
        'south',
        'east',
        'west',
        'central',
      ]);
      const today = new Date().toISOString().slice(0, 10);

      // AI-01: extraction returns null coordinates when the SWPPP doesn't
      // state them — fabricating positions in a legal record is forbidden.
      // Unlocated checkpoints are placed on a tight ring around the
      // project's real center so the QSP can drag each one to its true
      // spot on the site map.
      const projectCenter =
        centerline.length > 0
          ? { lat: centerline[0][1], lng: centerline[0][0] }
          : prefillCenter ?? { lat: 36.78, lng: -119.42 };
      const placeholderCoord = (index: number) => {
        const angle = index * 2.4; // golden-angle spread, no overlaps
        const radius = 0.0006 + 0.00012 * index; // ~65m ring, growing
        return {
          lat: projectCenter.lat + radius * Math.sin(angle),
          lng: projectCenter.lng + radius * Math.cos(angle),
        };
      };

      const checkpointErrors: string[] = [];
      let unlocatedIndex = 0;
      for (const cp of extractedCheckpoints) {
        const safeZone =
          cp.zone && ALLOWED_ZONES.has(cp.zone) ? cp.zone : 'central';
        // Don't forward Claude's BMP code (e.g. "SC-1") as the DB primary
        // key — `checkpoints.id` is globally unique, not scoped per
        // project, so short codes collide across projects and across
        // retries of this same wizard. Let the API mint a unique id and
        // surface the BMP code in the name so the QSP still sees it.
        const displayName = cp.id ? `${cp.id} — ${cp.name}` : cp.name;
        const hasRealCoords = cp.lat != null && cp.lng != null;
        const coords = hasRealCoords
          ? { lat: cp.lat as number, lng: cp.lng as number }
          : placeholderCoord(unlocatedIndex++);
        const cpRes = await fetch('/api/checkpoints', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: id,
            name: displayName,
            bmpType: cp.bmpType,
            description: cp.description || cp.name,
            cgpSection: cp.cgpSection || 'TBD',
            zone: safeZone,
            lat: coords.lat,
            lng: coords.lng,
            status: 'needs-review',
            priority: 'medium',
            installDate: today,
          }),
        });
        if (!cpRes.ok) {
          const errBody = await cpRes.json().catch(() => ({}));
          checkpointErrors.push(
            `${cp.id}: ${errBody.error || `HTTP ${cpRes.status}`}`,
          );
        }
      }

      await fetchProjects();
      // Switch the active project so the dashboard, checkpoints page, and
      // every project-scoped store reads from the site we just created
      // instead of whichever site was selected before. Then prime the
      // checkpoint store so /checkpoints shows the freshly-persisted BMPs
      // without waiting for a manual project switch.
      setCurrentProject(id);
      await fetchCheckpoints();
      const partial: string[] = [];
      if (locationErrors.length > 0) {
        partial.push(
          `${locationErrors.length} monitoring location(s) failed: ${locationErrors.join('; ')}`,
        );
      }
      if (checkpointErrors.length > 0) {
        partial.push(
          `${checkpointErrors.length} checkpoint(s) failed: ${checkpointErrors.join('; ')}`,
        );
      }
      if (partial.length > 0) {
        setError(`Project created, but ${partial.join(' · ')}`);
        setSubmitting(false);
        return;
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">New Project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Set up a new construction project with permits, BMPs, and inspection tracking.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {visibleSteps.map((s, idx) => {
          const isActive = idx === currentStep;
          const isComplete = idx < currentStep;
          return (
            <div key={s.id} className="flex items-center flex-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : isComplete
                      ? 'bg-amber-500/30 text-amber-300'
                      : 'bg-elevated text-muted-foreground'
                }`}
              >
                {isComplete ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <span
                className={`ml-2 text-xs hidden sm:block ${
                  isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
                }`}
              >
                {s.label}
              </span>
              {idx < visibleSteps.length - 1 && (
                <div className="flex-1 mx-3 h-px bg-border" />
              )}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      <div className="rounded-lg border border-border bg-surface p-5 min-h-[400px]">
        {step?.id === 'type' && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold">Choose project type</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Bounded sites have fixed boundaries. Linear infrastructure projects use centerline geometry.
              </p>
            </div>
            <ProjectTypeSelector value={projectType} onChange={setProjectType} />
          </div>
        )}

        {step?.id === 'basic' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Basic information</h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Project name *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Address / location
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">CGP Permit Number</label>
                <input
                  type="text"
                  value={permitNumber}
                  onChange={(e) => setPermitNumber(e.target.value)}
                  className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">WDID</label>
                <input
                  type="text"
                  value={wdid}
                  onChange={(e) => setWdid(e.target.value)}
                  className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Risk Level</label>
                <select
                  value={riskLevel}
                  onChange={(e) => setRiskLevel(Number(e.target.value) as 1 | 2 | 3)}
                  className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                >
                  <option value={1}>Risk Level 1</option>
                  <option value={2}>Risk Level 2</option>
                  <option value={3}>Risk Level 3</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">Acreage</label>
                <input
                  type="number"
                  step="0.1"
                  value={acreage}
                  onChange={(e) => setAcreage(Number(e.target.value) || 0)}
                  className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
                />
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                QSP Information
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="QSP name"
                  value={qspName}
                  onChange={(e) => setQspName(e.target.value)}
                  className="rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="License #"
                  value={qspLicense}
                  onChange={(e) => setQspLicense(e.target.value)}
                  className="rounded border border-border bg-elevated px-3 py-2 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Company"
                  value={qspCompany}
                  onChange={(e) => setQspCompany(e.target.value)}
                  className="rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Phone"
                  value={qspPhone}
                  onChange={(e) => setQspPhone(e.target.value)}
                  className="rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Email"
                  value={qspEmail}
                  onChange={(e) => setQspEmail(e.target.value)}
                  className="col-span-2 rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                />
              </div>
            </div>
          </div>
        )}

        {step?.id === 'corridor' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Define corridor centerline</h2>

            <div className="flex border-b border-border">
              <button
                type="button"
                onClick={() => setCorridorTab('draw')}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                  corridorTab === 'draw'
                    ? 'border-amber-500 text-amber-300'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Draw on Map
              </button>
              <button
                type="button"
                onClick={() => setCorridorTab('upload')}
                className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                  corridorTab === 'upload'
                    ? 'border-amber-500 text-amber-300'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Upload GeoJSON
              </button>
            </div>

            {corridorTab === 'draw' && (
              <CorridorDrawMap centerline={centerline} onChange={setCenterline} />
            )}

            {corridorTab === 'upload' && (
              <GeoJsonUpload onCenterlineLoaded={setCenterline} />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Corridor width (feet)
                </label>
                <input
                  type="number"
                  value={corridorWidthFeet}
                  onChange={(e) => setCorridorWidthFeet(Number(e.target.value) || 0)}
                  className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
                />
              </div>
              <div className="flex items-end">
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono">{Math.round(corridorLengthFeet).toLocaleString()} ft</span>
                  <span className="mx-1">·</span>
                  <span className="font-mono">{corridorLengthMiles.toFixed(2)} mi</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {step?.id === 'segments' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Corridor segments</h2>
            <SegmentBuilder
              segments={segments}
              onChange={setSegments}
              totalLength={Math.round(corridorLengthFeet)}
            />
          </div>
        )}

        {step?.id === 'row' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Right-of-Way</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  ROW total width (feet)
                </label>
                <input
                  type="number"
                  value={rowWidthFeet}
                  onChange={(e) => setRowWidthFeet(Number(e.target.value) || 0)}
                  className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm font-mono focus:border-amber-500/50 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Auto-derived as parallel offsets from the centerline.
                </p>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">
                Easement description (optional)
              </label>
              <textarea
                value={easementDescription}
                onChange={(e) => setEasementDescription(e.target.value)}
                rows={3}
                className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                placeholder="e.g. 100-ft utility easement granted by Madera County (Doc #2018-074521)"
              />
            </div>
          </div>
        )}

        {step?.id === 'monitoring' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Monitoring Locations</h2>
            <MonitoringLocationsBuilder
              locations={monitoringLocations}
              onChange={setMonitoringLocations}
              centerLat={monitoringCenter?.lat}
              centerLng={monitoringCenter?.lng}
            />
          </div>
        )}

        {step?.id === 'review' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Review & submit</h2>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <ReviewItem label="Type" value={projectType === 'linear' ? 'Linear Infrastructure' : 'Bounded Site'} />
              <ReviewItem label="Name" value={name || '—'} />
              <ReviewItem label="Address" value={address || '—'} />
              <ReviewItem label="Permit #" value={permitNumber || '—'} mono />
              <ReviewItem label="WDID" value={wdid || '—'} mono />
              <ReviewItem label="Risk Level" value={`RL-${riskLevel}`} />
              <ReviewItem label="Acreage" value={acreage ? `${acreage} ac` : '—'} mono />
              <ReviewItem label="QSP" value={qspName || '—'} />
              <ReviewItem label="QSP License" value={qspLicense || '—'} mono />
              <ReviewItem
                label="Monitoring locations"
                value={String(monitoringLocations.length)}
              />
              {extractedCheckpoints.length > 0 && (
                <ReviewItem
                  label="Checkpoints from SWPPP"
                  value={String(extractedCheckpoints.length)}
                />
              )}

              {projectType === 'linear' && (
                <>
                  <ReviewItem label="Centerline vertices" value={String(centerline.length)} />
                  <ReviewItem
                    label="Corridor length"
                    value={formatLinearLength(corridorLengthFeet, corridorLengthFeet >= 5280 ? 'miles' : 'feet')}
                    mono
                  />
                  <ReviewItem label="Corridor width" value={`${corridorWidthFeet} ft`} mono />
                  <ReviewItem label="ROW width" value={`${rowWidthFeet} ft`} mono />
                  <ReviewItem label="Segments" value={String(segments.length)} />
                </>
              )}
            </dl>

            {error && (
              <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentStep === 0}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-elevated px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>

        {currentStep < visibleSteps.length - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed()}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-primary/40 bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            {submitting ? 'Creating…' : 'Create Project'}
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col rounded border border-border bg-elevated px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-0.5 text-sm ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-4xl p-4 sm:p-6">
          <div className="h-[400px] animate-pulse rounded-lg bg-elevated" />
        </div>
      }
    >
      <NewProjectWizard />
    </Suspense>
  );
}
