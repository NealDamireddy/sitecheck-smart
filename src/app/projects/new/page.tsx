'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { ProjectTypeSelector } from '@/components/projects/project-type-selector';
import { GeoJsonUpload } from '@/components/projects/geojson-upload';
import { SegmentBuilder } from '@/components/projects/segment-builder';
import { centerlineLengthFeet, formatLinearLength } from '@/lib/format';
import { useProjectStore } from '@/stores/project-store';
import type { ProjectType, ProjectSegment, Project } from '@/types/project';

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
  { id: 'review', label: 'Review' },
];

export default function NewProjectPage() {
  const router = useRouter();
  const fetchProjects = useProjectStore((s) => s.fetchProjects);

  const [currentStep, setCurrentStep] = useState(0);
  const [projectType, setProjectType] = useState<ProjectType>('linear');

  // Basic info
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [permitNumber, setPermitNumber] = useState('');
  const [wdid, setWdid] = useState('');
  const [riskLevel, setRiskLevel] = useState<1 | 2 | 3>(2);
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

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived
  const corridorLengthFeet = useMemo(() => centerlineLengthFeet(centerline), [centerline]);
  const corridorLengthMiles = corridorLengthFeet / 5280;

  const visibleSteps = projectType === 'linear' ? STEPS : STEPS.filter((s) => s.id !== 'corridor' && s.id !== 'segments' && s.id !== 'row');
  const step = visibleSteps[currentStep];

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
        acreage: 0,
        coordinates:
          centerline.length > 0
            ? { lng: centerline[0][0], lat: centerline[0][1] }
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

      await fetchProjects();
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
                    ? 'bg-amber-500 text-black'
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
              <ReviewItem label="QSP" value={qspName || '—'} />
              <ReviewItem label="QSP License" value={qspLicense || '—'} mono />

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
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500 px-4 py-2 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !name.trim()}
            className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500 px-4 py-2 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
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
