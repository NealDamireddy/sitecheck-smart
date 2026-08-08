'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  CloudRain,
  FileClock,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UsersRound,
  UserRoundCheck,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/page-transition';
import { SectionHeader } from '@/components/shared/section-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProjectStore } from '@/stores/project-store';
import { cn } from '@/lib/utils';
import type {
  InspectorWorkspaceState,
  SiteRecordCreateResult,
  SiteRecordDirectoryItem,
  SiteRecordType,
} from '@/types/site-record';

const RECORD_OPTIONS: Array<{
  type: SiteRecordType;
  label: string;
  description: string;
  icon: typeof ClipboardCheck;
}> = [
  {
    type: 'weekly_inspection',
    label: 'Weekly inspection',
    description: 'Routine BMP walk-through and exception checklist',
    icon: ClipboardCheck,
  },
  {
    type: 'monthly_inspection',
    label: 'Monthly inspection',
    description: 'Full-site BMP audit and monthly record',
    icon: CalendarDays,
  },
  {
    type: 'smarts_ad_hoc',
    label: 'SMARTS ad hoc',
    description: 'Rain-event data for the open 2026–2027 reporting year',
    icon: CloudRain,
  },
];

function localDateTime(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function recordLabel(type: SiteRecordType) {
  return RECORD_OPTIONS.find((option) => option.type === type)?.label ?? type;
}

function statusTone(status: string) {
  if (status === 'verified') return 'border-emerald-700 bg-emerald-900/30 text-emerald-200';
  if (status === 'failed' || status === 'needs_review') {
    return 'border-red-700 bg-red-900/30 text-red-200';
  }
  if (status === 'ready' || status === 'running' || status === 'validating') {
    return 'border-amber-700 bg-amber-900/30 text-amber-200';
  }
  return 'border-slate-700 bg-slate-900 text-slate-300';
}

function newIdempotencyKey(projectId: string, type: SiteRecordType) {
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `ui:${projectId}:${type}:${id}`;
}

export default function FieldRecordsPage() {
  const router = useRouter();
  const projectId = useProjectStore((state) => state.currentProjectId);
  const project = useProjectStore((state) => state.currentProject());
  const [workspace, setWorkspace] = useState<InspectorWorkspaceState | null>(null);
  const [records, setRecords] = useState<SiteRecordDirectoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SiteRecordType | 'all'>('all');
  const [recordType, setRecordType] = useState<SiteRecordType>('weekly_inspection');
  const [title, setTitle] = useState('');
  const [startedAt, setStartedAt] = useState(() => localDateTime());
  const [endedAt, setEndedAt] = useState('');
  const [precipitation, setPrecipitation] = useState('');
  const [notes, setNotes] = useState('');
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(false);
  const submitKey = useRef<string | null>(null);
  const loadRequest = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const load = useCallback(async () => {
    if (!projectId) return;
    const requestId = ++loadRequest.current;
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ projectId });
      const [workspaceResponse, recordsResponse] = await Promise.all([
        fetch(`/api/inspector-workspace?${query}`),
        fetch(`/api/site-records?${query}`),
      ]);
      const workspaceBody = await workspaceResponse.json().catch(() => ({}));
      const recordsBody = await recordsResponse.json().catch(() => ({}));
      if (!workspaceResponse.ok) {
        throw new Error(workspaceBody.error ?? 'Failed to load inspector access');
      }
      if (!recordsResponse.ok) {
        throw new Error(recordsBody.error ?? 'Failed to load field records');
      }
      if (requestId !== loadRequest.current) return;
      setWorkspace(workspaceBody as InspectorWorkspaceState);
      setRecords((recordsBody.records ?? []) as SiteRecordDirectoryItem[]);
    } catch (loadError) {
      if (requestId !== loadRequest.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Failed to load records');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setWorkspace(null);
    setRecords([]);
    submitKey.current = null;
    void load();
  }, [load]);

  const visibleRecords = useMemo(
    () => (filter === 'all' ? records : records.filter((record) => record.recordType === filter)),
    [filter, records]
  );

  async function createRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!projectId || !workspace?.ready) return;
    setCreating(true);
    setError(null);
    submitKey.current ??= newIdempotencyKey(projectId, recordType);

    try {
      const startIso = new Date(startedAt).toISOString();
      const endIso = endedAt ? new Date(endedAt).toISOString() : undefined;
      const detail =
        recordType === 'smarts_ad_hoc'
          ? {
              startedAt: startIso,
              ...(endIso ? { endedAt: endIso } : {}),
              ...(precipitation ? { precipitationInches: Number(precipitation) } : {}),
              ...(notes.trim() ? { notes: notes.trim() } : {}),
            }
          : {
              inspectionDate: startIso,
              inspectionType: 'routine',
              inspectorName: workspace.profile?.displayName,
              weatherTemperature: 0,
              weatherCondition: 'not recorded',
              weatherWindSpeedMph: 0,
              weatherHumidity: 0,
              overallCompliance: 0,
            };
      const payload = {
        projectId,
        recordType,
        idempotencyKey: submitKey.current,
        title: title.trim() || recordLabel(recordType),
        observedFrom: startIso,
        ...(endIso ? { observedTo: endIso } : {}),
        detail,
        source: {
          sourceType: 'form',
          schemaVersion: 'sitecheck-field-record-v1',
          rawPayload: { recordType, title: title.trim(), detail },
        },
      };
      const response = await fetch('/api/site-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as
        | SiteRecordCreateResult
        | { error?: string };
      if (!response.ok || !('detailId' in body)) {
        throw new Error('error' in body && body.error ? body.error : 'Record creation failed');
      }

      submitKey.current = null;
      if (body.recordType === 'smarts_ad_hoc') {
        router.push(`/projects/${projectId}/events/${body.detailId}/capture`);
      } else {
        router.push(`/inspections/${body.detailId}`);
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Record creation failed');
    } finally {
      setCreating(false);
    }
  }

  if (!mounted) {
    return (
      <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading field records…
      </div>
    );
  }

  if (!projectId) {
    return (
      <PageTransition>
        <div className="p-6">
          <SectionHeader
            title="Field Records"
            description="Select a project from the top bar to view its inspector records."
          />
        </div>
      </PageTransition>
    );
  }

  return (
    <PageTransition>
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionHeader
            title="Field Records"
            description={`${project?.name ?? projectId} · weekly, monthly, and SMARTS ad hoc reporting`}
          />
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {workspace && !workspace.ready && (
          <InspectorSetupCard workspace={workspace} onReady={setWorkspace} />
        )}

        {workspace?.ready && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-100">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-medium">Inspector workspace ready</span>
            <span className="text-emerald-200/75">
              {workspace.profile?.displayName} · {workspace.project.companyName} · {workspace.project.name}
            </span>
          </div>
        )}

        {workspace?.canManageAssignments && workspace.team.length > 0 && (
          <AssignmentManager workspace={workspace} onUpdated={setWorkspace} />
        )}

        <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <FileClock className="h-5 w-5 text-amber-400" />
            <div>
              <h2 className="font-heading text-lg font-bold text-slate-100">Start field work</h2>
              <p className="text-xs text-muted-foreground">
                One submission creates the company → inspector → site → record link automatically.
              </p>
            </div>
          </div>

          <form className="mt-4 space-y-4" onSubmit={createRecord}>
            <fieldset
              disabled={!workspace?.ready || creating}
              className="grid grid-cols-1 gap-3 md:grid-cols-3"
            >
              {RECORD_OPTIONS.map((option) => {
                const Icon = option.icon;
                const selected = recordType === option.type;
                return (
                  <button
                    key={option.type}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setRecordType(option.type);
                      submitKey.current = null;
                    }}
                    className={cn(
                      'rounded-lg border p-4 text-left transition-colors',
                      selected
                        ? 'border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30'
                        : 'border-slate-700 bg-slate-950/30 hover:border-slate-500'
                    )}
                  >
                    <Icon className={cn('h-5 w-5', selected ? 'text-amber-400' : 'text-slate-400')} />
                    <span className="mt-3 block text-sm font-semibold text-slate-100">{option.label}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </fieldset>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-xs font-medium text-slate-300">
                Record title
                <Input
                  value={title}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    submitKey.current = null;
                  }}
                  placeholder={recordLabel(recordType)}
                  disabled={!workspace?.ready || creating}
                />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-slate-300">
                {recordType === 'smarts_ad_hoc' ? 'Event started' : 'Inspection date and time'}
                <Input
                  type="datetime-local"
                  value={startedAt}
                  onChange={(event) => {
                    setStartedAt(event.target.value);
                    submitKey.current = null;
                  }}
                  required
                  disabled={!workspace?.ready || creating}
                />
              </label>
              {recordType === 'smarts_ad_hoc' && (
                <>
                  <label className="space-y-1.5 text-xs font-medium text-slate-300">
                    Event ended (optional)
                    <Input
                      type="datetime-local"
                      value={endedAt}
                      min={startedAt}
                      onChange={(event) => {
                        setEndedAt(event.target.value);
                        submitKey.current = null;
                      }}
                      disabled={!workspace?.ready || creating}
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-slate-300">
                    Precipitation, inches (optional)
                    <Input
                      type="number"
                      min="0"
                      max="50"
                      step="0.01"
                      value={precipitation}
                      onChange={(event) => {
                        setPrecipitation(event.target.value);
                        submitKey.current = null;
                      }}
                      placeholder="0.00"
                      disabled={!workspace?.ready || creating}
                    />
                  </label>
                  <label className="space-y-1.5 text-xs font-medium text-slate-300 md:col-span-2">
                    Event notes (optional)
                    <Textarea
                      value={notes}
                      onChange={(event) => {
                        setNotes(event.target.value);
                        submitKey.current = null;
                      }}
                      rows={3}
                      placeholder="Conditions, sampling context, or reporting notes"
                      disabled={!workspace?.ready || creating}
                    />
                  </label>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 pt-4">
              <p className="text-xs text-muted-foreground">
                {recordType === 'smarts_ad_hoc'
                  ? 'Dates are checked against the currently open California reporting year.'
                  : 'You will continue to the QSP BMP checklist after the record is created.'}
              </p>
              <Button type="submit" disabled={!workspace?.ready || creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                {creating ? 'Creating…' : `Start ${recordLabel(recordType).toLowerCase()}`}
              </Button>
            </div>
          </form>
        </section>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-700/60 bg-red-950/30 p-3 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-lg font-bold text-slate-100">Record history</h2>
              <p className="text-xs text-muted-foreground">Stored by company, inspector, site, and record type.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {(['all', ...RECORD_OPTIONS.map((option) => option.type)] as const).map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setFilter(value)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    filter === value
                      ? 'border-amber-500 bg-amber-500/10 text-amber-100'
                      : 'border-slate-700 text-slate-300 hover:border-slate-500'
                  )}
                >
                  {value === 'all' ? 'All' : recordLabel(value)}
                </button>
              ))}
            </div>
          </div>

          {loading && records.length === 0 ? (
            <div className="rounded-lg border border-slate-800 p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 inline h-4 w-4 animate-spin" /> Loading field records…
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-8 text-center">
              <FileClock className="mx-auto h-6 w-6 text-slate-500" />
              <p className="mt-2 text-sm text-slate-300">No field records in this view yet.</p>
              <p className="mt-1 text-xs text-muted-foreground">The first completed workflow will appear here automatically.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {visibleRecords.map((record) => (
                <Link
                  key={record.siteRecordId}
                  href={`/records/${record.siteRecordId}`}
                  className="rounded-lg border border-slate-800 bg-slate-900/55 p-4 transition-colors hover:border-amber-600/60"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-100">{record.title || recordLabel(record.recordType)}</span>
                        <Badge className={cn('border text-[10px] uppercase', statusTone(record.workflowStatus))}>
                          {record.workflowStatus.replaceAll('_', ' ')}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {recordLabel(record.recordType)} · {record.inspector.name}
                      </p>
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        {format(new Date(record.createdAt), 'MMM d, yyyy · h:mm a')} · {record.company.name}
                      </p>
                    </div>
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-500" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageTransition>
  );
}

function InspectorSetupCard({
  workspace,
  onReady,
}: {
  workspace: InspectorWorkspaceState;
  onReady: (value: InspectorWorkspaceState) => void;
}) {
  const [displayName, setDisplayName] = useState(workspace.profile?.displayName ?? '');
  const [title, setTitle] = useState(workspace.profile?.title ?? '');
  const [licenseNumber, setLicenseNumber] = useState(workspace.profile?.licenseNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/inspector-workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: workspace.project.id,
          displayName,
          title: title || undefined,
          licenseNumber: licenseNumber || undefined,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body.error ?? 'Inspector setup failed');
      }
      onReady(body as InspectorWorkspaceState);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Inspector setup failed');
    } finally {
      setSaving(false);
    }
  }

  const awaitingManager = workspace.profile && !workspace.assignment && !workspace.canManageAssignments;
  return (
    <form
      onSubmit={submit}
      className="rounded-xl border border-amber-600/50 bg-amber-950/20 p-4 sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-amber-500/15 p-2 text-amber-300">
          <UserRoundCheck className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <h2 className="font-heading text-base font-bold text-amber-100">Set up inspector access</h2>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/70">
            Field records require both an inspector profile and an active assignment to this site.
          </p>
        </div>
      </div>

      {awaitingManager ? (
        <div className="mt-4 rounded-lg border border-amber-700/60 bg-slate-950/30 p-3 text-sm text-amber-100">
          <CheckCircle2 className="mr-2 inline h-4 w-4 text-emerald-400" />
          Your profile is saved. An owner, administrator, or QSP must assign you to {workspace.project.name}.
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1.5 text-xs font-medium text-amber-100/80">
              Display name *
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required minLength={2} />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-amber-100/80">
              Title
              <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="QSP / Inspector" />
            </label>
            <label className="space-y-1.5 text-xs font-medium text-amber-100/80">
              License number
              <Input value={licenseNumber} onChange={(event) => setLicenseNumber(event.target.value)} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-amber-100/65">
              {workspace.canManageAssignments
                ? 'Your management role can activate your site assignment immediately.'
                : 'Your profile will be saved; a manager must approve the site assignment.'}
            </p>
            <Button type="submit" disabled={saving || displayName.trim().length < 2}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundCheck className="h-4 w-4" />}
              {saving ? 'Saving…' : 'Activate workspace'}
            </Button>
          </div>
        </>
      )}
      {message && (
        <div className="mt-3 flex items-start gap-2 text-xs text-red-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {message}
        </div>
      )}
    </form>
  );
}

function AssignmentManager({
  workspace,
  onUpdated,
}: {
  workspace: InspectorWorkspaceState;
  onUpdated: (workspace: InspectorWorkspaceState) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <UsersRound className="h-5 w-5 text-sky-400" />
        <div>
          <h2 className="font-heading text-base font-bold text-slate-100">Site assignments</h2>
          <p className="text-xs text-muted-foreground">
            Approve active inspector profiles for {workspace.project.name}.
          </p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-2 lg:grid-cols-2">
        {workspace.team.map((member) => (
          <AssignmentRow
            key={member.userId}
            projectId={workspace.project.id}
            member={member}
            onUpdated={onUpdated}
          />
        ))}
      </div>
    </section>
  );
}

function AssignmentRow({
  projectId,
  member,
  onUpdated,
}: {
  projectId: string;
  member: InspectorWorkspaceState['team'][number];
  onUpdated: (workspace: InspectorWorkspaceState) => void;
}) {
  const [assignmentRole, setAssignmentRole] = useState(
    member.assignment?.assignmentRole ?? 'inspector'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = member.assignment?.status === 'active' && !member.assignment.endedAt;

  async function update(status: 'active' | 'inactive') {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/inspector-workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          userId: member.userId,
          assignmentRole,
          status,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Assignment update failed');
      onUpdated(body as InspectorWorkspaceState);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Assignment update failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-200">{member.displayName}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {member.title || 'Inspector profile'} · {member.profileStatus}
          </p>
        </div>
        <Badge
          className={cn(
            'border text-[10px] uppercase',
            active
              ? 'border-emerald-700 bg-emerald-900/30 text-emerald-200'
              : 'border-slate-700 bg-slate-900 text-slate-300'
          )}
        >
          {active ? 'assigned' : 'not assigned'}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={assignmentRole}
          onChange={(event) => setAssignmentRole(event.target.value as typeof assignmentRole)}
          disabled={saving}
          className="h-8 flex-1 rounded-lg border border-input bg-slate-950 px-2.5 text-sm text-slate-200 outline-none focus:border-amber-500"
        >
          <option value="lead">Lead</option>
          <option value="inspector">Inspector</option>
          <option value="reviewer">Reviewer</option>
        </select>
        <Button
          type="button"
          size="sm"
          variant={active ? 'outline' : 'default'}
          disabled={saving || member.profileStatus !== 'active'}
          onClick={() => void update(active ? 'inactive' : 'active')}
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {saving ? 'Saving…' : active ? 'End assignment' : 'Assign'}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
