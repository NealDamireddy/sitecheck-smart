'use client';

/**
 * SMARTS onboarding wizard — three steps:
 *   1. SMARTS credentials — REUSES the existing write-only credential API
 *      (PUT /api/smarts/credentials). The password is never echoed back.
 *   2. WDID confirmation — reads the current project's WDID and saves a
 *      correction via PATCH /api/projects/[projectId].
 *   3. Monitoring data — the production path builds the SMARTS CSV
 *      server-side from inspection/sample data; there is NO client CSV
 *      upload. The user picks an existing rain event, previews the exact
 *      server-built CSV (GET /api/smarts/sync/preview), then launches via
 *      the EXISTING POST /api/smarts/sync. The bot still reads a
 *      server-generated CSV; the orchestrator contract is unchanged.
 *
 * On launch the user is sent to the dashboard, where the run-status panel
 * polls the new run.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronRight,
  KeyRound,
  Loader2,
  MapPin,
  Play,
  Save,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { SectionHeader } from '@/components/shared/section-header';
import { PageTransition } from '@/components/shared/page-transition';
import { Button } from '@/components/ui/button';
import { useProjectStore } from '@/stores/project-store';

interface SmartsCredentialStatus {
  configured: boolean;
  source: 'account' | 'server-env' | null;
  username: string | null;
  updatedAt: string | null;
}

interface SmartsEvent {
  id: string;
  status: string;
  source: string;
  forecastDetectedAt: string;
  startedAt?: string;
  endedAt?: string;
}

interface SyncPreview {
  eventId: string;
  siteName: string;
  wdid: string | null;
  blockers: string[];
  warnings: string[];
  csv: string;
}

export default function SmartsSetupPage() {
  const [step, setStep] = useState(1);

  return (
    <PageTransition>
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <SectionHeader
          title="SMARTS Setup"
          description="Connect your SMARTS account, confirm your WDID, and run the Ad Hoc Monitoring Report fill. The bot fills and stops before certification — you certify in SMARTS."
        />

        <StepRail step={step} />

        {step === 1 && <CredentialsStep onNext={() => setStep(2)} />}
        {step === 2 && (
          <WdidStep onBack={() => setStep(1)} onNext={() => setStep(3)} />
        )}
        {step === 3 && <MonitoringStep onBack={() => setStep(2)} />}
      </div>
    </PageTransition>
  );
}

function StepRail({ step }: { step: number }) {
  const labels = ['SMARTS login', 'Confirm WDID', 'Monitoring data'];
  return (
    <div className="flex items-center gap-2">
      {labels.map((label, i) => {
        const n = i + 1;
        const active = step === n;
        const done = step > n;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={
                done
                  ? 'flex h-6 w-6 items-center justify-center rounded-full border border-emerald-600 bg-emerald-700/40 text-emerald-200'
                  : active
                    ? 'flex h-6 w-6 items-center justify-center rounded-full border border-amber-500 bg-amber-700/30 text-amber-200'
                    : 'flex h-6 w-6 items-center justify-center rounded-full border border-slate-700 bg-slate-900/60 text-slate-400'
              }
            >
              {done ? <Check className="h-3.5 w-3.5" /> : <span className="text-[10px]">{n}</span>}
            </div>
            <span
              className={
                active ? 'text-xs font-medium text-slate-100' : 'text-xs text-muted-foreground'
              }
            >
              {label}
            </span>
            {n < labels.length && <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
          </div>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────
// Step 1 — SMARTS credentials (reuse the write-only API)
// ──────────────────────────────────────────────────────

function CredentialsStep({ onNext }: { onNext: () => void }) {
  const [status, setStatus] = useState<SmartsCredentialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/smarts/credentials');
        if (!res.ok) throw new Error(`Failed to load status (${res.status})`);
        const data = (await res.json()) as SmartsCredentialStatus;
        if (cancelled) return;
        setStatus(data);
        if (data.source === 'account' && data.username) setUsername(data.username);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load status');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/smarts/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ? String(body.error) : `Save failed (${res.status})`);
      setStatus(body as SmartsCredentialStatus);
      setPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credentials');
    } finally {
      setSaving(false);
    }
  }

  const hasOwn = status?.source === 'account';

  return (
    <form onSubmit={handleSave} className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="h-4 w-4 text-amber-400" /> SMARTS login
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Used by Sync to SMARTS to file Ad Hoc Monitoring Reports under your own SMARTS
          account. Your password is encrypted before storage and is never displayed again.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading status…
        </div>
      ) : (
        <>
          <div
            className={
              hasOwn
                ? 'flex items-center gap-2 rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300'
                : 'rounded border border-border bg-elevated px-3 py-2 text-xs text-muted-foreground'
            }
          >
            {hasOwn ? (
              <>
                <ShieldCheck className="h-3.5 w-3.5 shrink-0" /> Saved as{' '}
                <span className="font-mono">{status?.username}</span>
              </>
            ) : status?.source === 'server-env' ? (
              <>Using the server-wide fallback login. Save your own below to file under your account.</>
            ) : (
              <>No SMARTS login saved yet.</>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                SMARTS username (email)
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
                className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                SMARTS password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                className="w-full rounded border border-border bg-elevated px-3 py-2 text-sm focus:border-amber-500/50 focus:outline-none"
                placeholder={hasOwn ? '•••••••• (saved — enter to replace)' : 'Your SMARTS password'}
              />
            </div>
          </div>

          {error && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border pt-4">
            <Button type="submit" variant="outline" disabled={saving || !username || !password}>
              {saving ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="mr-1.5 h-4 w-4" /> Save SMARTS login
                </>
              )}
            </Button>
            <Button type="button" onClick={onNext} disabled={!status?.configured}>
              Next <ChevronRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
          {!status?.configured && (
            <p className="text-[11px] text-muted-foreground">
              Save your SMARTS login to continue.
            </p>
          )}
        </>
      )}
    </form>
  );
}

// ──────────────────────────────────────────────────────
// Step 2 — WDID confirmation
// ──────────────────────────────────────────────────────

function WdidStep({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const projectId = useProjectStore((s) => s.currentProjectId);
  const project = useProjectStore((s) => s.currentProject());
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const loaded = useProjectStore((s) => s.loaded);

  const [wdid, setWdid] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) void fetchProjects();
  }, [loaded, fetchProjects]);

  useEffect(() => {
    if (project) setWdid(project.wdid ?? '');
  }, [project]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId) {
      setError('No project selected.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wdid }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ? String(body.error) : `Save failed (${res.status})`);
      await fetchProjects();
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save WDID');
    } finally {
      setSaving(false);
    }
  }

  const justSaved = savedAt && Date.now() - savedAt < 3000;

  return (
    <form onSubmit={handleSave} className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-amber-400" /> Confirm WDID
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The Waste Discharge Identification number the bot uses to find{' '}
          <span className="text-slate-300">{project?.name ?? 'your site'}</span> in SMARTS.
          Correct it here if it is wrong or missing.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">WDID</label>
        <input
          type="text"
          value={wdid}
          onChange={(e) => setWdid(e.target.value)}
          className="w-full rounded border border-border bg-elevated px-3 py-2 font-mono text-sm focus:border-amber-500/50 focus:outline-none"
          placeholder="e.g. 5S33C361234"
        />
      </div>

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex items-center gap-3">
          {justSaved && (
            <span className="flex items-center gap-1 text-xs text-emerald-400">
              <Check className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <Button type="submit" variant="outline" disabled={saving || !wdid.trim()}>
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save className="mr-1.5 h-4 w-4" /> Save WDID
              </>
            )}
          </Button>
          <Button type="button" onClick={onNext} disabled={!wdid.trim()}>
            Next <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </div>
    </form>
  );
}

// ──────────────────────────────────────────────────────
// Step 3 — Monitoring data: pick event, preview server CSV, launch
// ──────────────────────────────────────────────────────

function MonitoringStep({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const projectId = useProjectStore((s) => s.currentProjectId);

  const [events, setEvents] = useState<SmartsEvent[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [preview, setPreview] = useState<SyncPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setLoadingEvents(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/smarts-events?projectId=${encodeURIComponent(projectId)}`);
        if (!res.ok) throw new Error(`Failed to load events (${res.status})`);
        const data = (await res.json()) as SmartsEvent[];
        if (!cancelled) setEvents(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load events');
      } finally {
        if (!cancelled) setLoadingEvents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function selectEvent(eventId: string) {
    setSelectedEventId(eventId);
    setPreview(null);
    setError(null);
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/smarts/sync/preview?eventId=${encodeURIComponent(eventId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ? String(body.error) : `Preview failed (${res.status})`);
      setPreview(body as SyncPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to build preview');
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleLaunch() {
    if (!selectedEventId) return;
    setLaunching(true);
    setError(null);
    try {
      const res = await fetch('/api/smarts/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId: selectedEventId, headed: false }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const blockers = Array.isArray(body?.blockers) ? ` ${body.blockers.join('; ')}` : '';
        throw new Error((body?.error ? String(body.error) : `Launch failed (${res.status})`) + blockers);
      }
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch sync');
      setLaunching(false);
    }
  }

  const canLaunch = !!preview && preview.blockers.length === 0 && !launching;

  return (
    <div className="space-y-4 rounded-lg border border-border bg-surface p-4 sm:p-6">
      <div>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Upload className="h-4 w-4 text-amber-400" /> Monitoring data
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          The SMARTS CSV is built server-side from this event&apos;s recorded samples — no upload
          needed. Pick an event, review the exact data the bot will reference, then launch.
        </p>
      </div>

      {loadingEvents ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading events…
        </div>
      ) : events.length === 0 ? (
        <div className="rounded border border-border bg-elevated px-3 py-2 text-xs text-muted-foreground">
          No rain events recorded for this project yet.
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((evt) => (
            <button
              key={evt.id}
              type="button"
              onClick={() => selectEvent(evt.id)}
              className={
                selectedEventId === evt.id
                  ? 'flex w-full items-center justify-between rounded border border-amber-500/60 bg-amber-700/15 px-3 py-2 text-left'
                  : 'flex w-full items-center justify-between rounded border border-border bg-elevated px-3 py-2 text-left hover:border-slate-500'
              }
            >
              <div className="min-w-0">
                <div className="text-sm text-slate-100">
                  {new Date(evt.forecastDetectedAt).toLocaleDateString()}{' '}
                  <span className="text-xs text-muted-foreground">· {evt.source}</span>
                </div>
                <div className="text-[11px] text-muted-foreground">Status: {evt.status}</div>
              </div>
              {selectedEventId === evt.id && <Check className="h-4 w-4 text-amber-300" />}
            </button>
          ))}
        </div>
      )}

      {loadingPreview && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Building preview…
        </div>
      )}

      {preview && (
        <div className="space-y-3">
          {preview.blockers.length > 0 && (
            <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              <div className="mb-1 font-semibold">Resolve before syncing:</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {preview.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}
          {preview.warnings.length > 0 && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              <div className="mb-1 font-semibold">Warnings:</div>
              <ul className="list-disc space-y-0.5 pl-4">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Generated SMARTS CSV (what the bot references)
            </div>
            <pre className="max-h-56 overflow-auto rounded border border-border bg-slate-950/70 p-3 text-[10px] leading-relaxed text-slate-300">
              {preview.csv}
            </pre>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button type="button" onClick={handleLaunch} disabled={!canLaunch}>
          {launching ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Launching…
            </>
          ) : (
            <>
              <Play className="mr-1.5 h-4 w-4" /> Launch sync
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
