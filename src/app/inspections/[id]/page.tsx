'use client';

/**
 * Block 5 — Inspection detail page.
 *
 * Renders a single inspection record with:
 *   - Status pill, trigger badge, due-by countdown
 *   - Editable narrative (PATCH on blur)
 *   - Compliance numbers (AI vs QSP) with progress bar
 *   - Linked missions roll-up
 *   - AI findings list (compliant / deficient / needs-review)
 *   - QSP decisions list
 *   - Corrective actions table with severity / status pills
 *   - "Download PDF" button → /api/inspections/[id]/pdf
 *   - "Submit Inspection" button (disabled when already submitted)
 */

import { useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  ArrowLeft,
  CloudRain,
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  FileDown,
  Send,
  Clock,
  Loader2,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/page-transition';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useInspectionStore } from '@/stores/inspection-store';
import { cn } from '@/lib/utils';

interface AnalysisRow {
  id: string;
  missionId: string;
  waypointNumber: number;
  checkpointId: string;
  summary: string;
  status: string;
  confidence: number;
  cgpReference: string;
  createdAt: string;
}

interface ReviewRow {
  id: string;
  missionId: string;
  waypointNumber: number;
  checkpointId: string;
  decision: string;
  overrideStatus: string | null;
  overrideNotes: string | null;
  reviewedAt: string;
}

interface CorrectiveActionRow {
  id: string;
  description: string;
  severity: string;
  status: string;
  dueDate: string;
  resolvedAt: string | null;
  cgpReference: string | null;
}

function statusToBadge(status: string | undefined) {
  switch (status) {
    case 'submitted':
      return 'bg-emerald-900/40 text-emerald-200 border-emerald-700';
    case 'in-progress':
      return 'bg-amber-900/40 text-amber-200 border-amber-700';
    case 'archived':
      return 'bg-slate-800/40 text-slate-300 border-slate-700';
    default:
      return 'bg-slate-800/40 text-slate-200 border-slate-600';
  }
}

function complianceTone(pct: number | undefined) {
  if (pct == null) return 'text-slate-300';
  if (pct >= 90) return 'text-emerald-300';
  if (pct >= 75) return 'text-amber-300';
  return 'text-red-300';
}

export default function InspectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useInspectionStore((s) => s.detailById[id]);
  const fetchById = useInspectionStore((s) => s.fetchById);
  const patchInspection = useInspectionStore((s) => s.patchInspection);
  const submitInspection = useInspectionStore((s) => s.submitInspection);
  const isLoading = useInspectionStore((s) => s.loadingDetails.has(id));

  const [narrativeDraft, setNarrativeDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchById(id);
  }, [id, fetchById]);

  useEffect(() => {
    if (detail?.inspection?.narrative != null) {
      setNarrativeDraft(detail.inspection.narrative);
    }
  }, [detail?.inspection?.narrative]);

  const inspection = detail?.inspection ?? null;
  const aiAnalyses = (detail?.aiAnalyses ?? []) as AnalysisRow[];
  const qspReviews = (detail?.qspReviews ?? []) as ReviewRow[];
  const correctiveActions = (detail?.correctiveActions ?? []) as CorrectiveActionRow[];

  const aiSummary = useMemo(() => {
    if (aiAnalyses.length === 0) return null;
    const compliant = aiAnalyses.filter((a) => a.status === 'compliant').length;
    const deficient = aiAnalyses.filter((a) => a.status === 'deficient').length;
    const review = aiAnalyses.filter((a) => a.status === 'needs-review').length;
    return { compliant, deficient, review, total: aiAnalyses.length };
  }, [aiAnalyses]);

  if (isLoading && !inspection) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading inspection...
        </div>
      </PageTransition>
    );
  }

  if (!inspection) {
    return (
      <PageTransition>
        <div className="p-6">
          <Link href="/inspections" className="text-sm text-amber-400 hover:underline">
            ← Back to inspections
          </Link>
          <p className="mt-4 text-muted-foreground">Inspection not found.</p>
        </div>
      </PageTransition>
    );
  }

  const isSubmitted = inspection.status === 'submitted';
  const compliance = inspection.qspOverallCompliance ?? inspection.aiOverallCompliance ?? inspection.overallCompliance ?? 0;

  async function handleNarrativeBlur() {
    if (!detail?.inspection) return;
    if (narrativeDraft === (detail.inspection.narrative ?? '')) return;
    await patchInspection(id, { narrative: narrativeDraft });
  }

  async function handleSubmit() {
    if (isSubmitted) return;
    setSubmitting(true);
    try {
      await submitInspection(id);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PageTransition>
      <div className="flex flex-col gap-4 p-6">
        <Link
          href="/inspections"
          className="inline-flex items-center gap-1 text-sm text-amber-400 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to inspections
        </Link>

        {/* Header card */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {inspection.trigger === 'rain-event' || inspection.trigger === 'qpe' || inspection.trigger === 'post-storm' ? (
                  <CloudRain className="h-5 w-5 text-blue-400" />
                ) : (
                  <ClipboardCheck className="h-5 w-5 text-amber-400" />
                )}
                <h1 className="font-heading text-xl font-bold text-slate-100">
                  Inspection — {format(new Date(inspection.date), 'MMMM d, yyyy')}
                </h1>
                <Badge className={cn('border text-[10px] uppercase', statusToBadge(inspection.status))}>
                  {inspection.status ?? 'draft'}
                </Badge>
                {inspection.trigger && inspection.trigger !== 'manual' && (
                  <Badge className="border border-blue-700 bg-blue-900/40 text-[10px] uppercase text-blue-200">
                    {inspection.trigger}
                  </Badge>
                )}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {inspection.type} · Inspector: {inspection.inspector || 'Unassigned'}
              </div>
              {inspection.dueBy && !isSubmitted && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-700 bg-amber-900/30 px-2 py-1 text-xs text-amber-200">
                  <Clock className="h-3 w-3" />
                  Due {formatDistanceToNowStrict(new Date(inspection.dueBy), { addSuffix: true })}
                </div>
              )}
              {inspection.submittedAt && (
                <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-emerald-700 bg-emerald-900/30 px-2 py-1 text-xs text-emerald-200">
                  <CheckCircle2 className="h-3 w-3" />
                  Submitted {format(new Date(inspection.submittedAt), 'MMM d, h:mm a')}
                </div>
              )}
            </div>

            <div className="flex flex-col items-end gap-2">
              <div className={cn('text-4xl font-bold', complianceTone(compliance))}>
                {compliance}
                <span className="text-xl text-muted-foreground">%</span>
              </div>
              <div className="text-[10px] uppercase text-muted-foreground">Overall Compliance</div>
              <div className="flex gap-2">
                <a
                  href={`/api/inspections/${id}/pdf`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-md border border-amber-600 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Download PDF
                </a>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitted || submitting}
                  className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                  size="sm"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span className="ml-1.5">{isSubmitted ? 'Submitted' : 'Submit'}</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Compliance breakdown */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
              <span>AI Overall Compliance</span>
              <span>(Claude Vision)</span>
            </div>
            <div className={cn('mt-1 text-3xl font-bold', complianceTone(inspection.aiOverallCompliance))}>
              {inspection.aiOverallCompliance ?? '—'}
              {inspection.aiOverallCompliance != null && <span className="text-base text-muted-foreground">%</span>}
            </div>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
              <span>QSP Overall Compliance</span>
              <span>(After Override)</span>
            </div>
            <div className={cn('mt-1 text-3xl font-bold', complianceTone(inspection.qspOverallCompliance))}>
              {inspection.qspOverallCompliance ?? '—'}
              {inspection.qspOverallCompliance != null && <span className="text-base text-muted-foreground">%</span>}
            </div>
          </div>
        </div>

        {/* QSP narrative */}
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase text-muted-foreground">QSP Narrative</div>
            {isSubmitted && (
              <span className="text-[10px] text-muted-foreground">Read-only — inspection submitted</span>
            )}
          </div>
          <textarea
            value={narrativeDraft}
            onChange={(e) => setNarrativeDraft(e.target.value)}
            onBlur={handleNarrativeBlur}
            placeholder="Add inspection notes, observations, weather context, or follow-up items..."
            disabled={isSubmitted}
            rows={4}
            className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none disabled:opacity-60"
          />
        </div>

        {/* Linked missions */}
        {inspection.missionIds && inspection.missionIds.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase text-muted-foreground">
              Linked Missions ({inspection.missionIds.length})
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {inspection.missionIds.map((missionId) => (
                <Link
                  key={missionId}
                  href={`/missions/${missionId}`}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 hover:border-amber-600 hover:text-amber-200"
                >
                  {missionId}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* AI findings */}
        {aiSummary && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
              <span>AI Findings (Claude Vision)</span>
              <span>{aiSummary.total} total</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge className="border border-emerald-700 bg-emerald-900/40 text-emerald-200">
                {aiSummary.compliant} compliant
              </Badge>
              <Badge className="border border-red-700 bg-red-900/40 text-red-200">
                {aiSummary.deficient} deficient
              </Badge>
              <Badge className="border border-amber-700 bg-amber-900/40 text-amber-200">
                {aiSummary.review} needs review
              </Badge>
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
              {aiAnalyses.map((a) => (
                <div
                  key={a.id}
                  className="rounded-md border border-slate-800 bg-slate-950/40 p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      Waypoint {a.waypointNumber}
                    </span>
                    <Badge
                      className={cn(
                        'border text-[9px] uppercase',
                        a.status === 'compliant' && 'border-emerald-700 bg-emerald-900/40 text-emerald-200',
                        a.status === 'deficient' && 'border-red-700 bg-red-900/40 text-red-200',
                        a.status === 'needs-review' && 'border-amber-700 bg-amber-900/40 text-amber-200'
                      )}
                    >
                      {a.status} · {a.confidence}%
                    </Badge>
                  </div>
                  <p className="mt-1 text-slate-300">{a.summary}</p>
                  {a.cgpReference && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      CGP: {a.cgpReference}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* QSP decisions */}
        {qspReviews.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs uppercase text-muted-foreground">QSP Decisions</div>
            <div className="mt-3 space-y-2">
              {qspReviews.map((r) => (
                <div
                  key={r.id}
                  className="rounded-md border border-slate-800 bg-slate-950/40 p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      Waypoint {r.waypointNumber}
                    </span>
                    <Badge
                      className={cn(
                        'border text-[9px] uppercase',
                        r.decision === 'accept' && 'border-emerald-700 bg-emerald-900/40 text-emerald-200',
                        r.decision === 'override' && 'border-amber-700 bg-amber-900/40 text-amber-200',
                        r.decision === 'pending' && 'border-slate-700 bg-slate-800/40 text-slate-300'
                      )}
                    >
                      {r.decision}
                    </Badge>
                  </div>
                  {r.overrideStatus && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      Override status: {r.overrideStatus}
                    </div>
                  )}
                  {r.overrideNotes && (
                    <p className="mt-1 text-slate-300">{r.overrideNotes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Corrective actions */}
        {correctiveActions.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-center justify-between text-xs uppercase text-muted-foreground">
              <span>Corrective Actions</span>
              <span>{correctiveActions.length} total</span>
            </div>
            <div className="mt-3 space-y-2">
              {correctiveActions.map((ca) => (
                <div
                  key={ca.id}
                  className="rounded-md border border-slate-800 bg-slate-950/40 p-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200">
                      {ca.description}
                    </span>
                    <div className="flex gap-1">
                      <Badge
                        className={cn(
                          'border text-[9px] uppercase',
                          ca.severity === 'high' && 'border-red-700 bg-red-900/40 text-red-200',
                          ca.severity === 'medium' && 'border-amber-700 bg-amber-900/40 text-amber-200',
                          ca.severity === 'low' && 'border-slate-700 bg-slate-800/40 text-slate-300'
                        )}
                      >
                        {ca.severity}
                      </Badge>
                      <Badge
                        className={cn(
                          'border text-[9px] uppercase',
                          (ca.status === 'resolved' || ca.status === 'verified') && 'border-emerald-700 bg-emerald-900/40 text-emerald-200',
                          ca.status === 'in-progress' && 'border-amber-700 bg-amber-900/40 text-amber-200',
                          ca.status === 'open' && 'border-red-700 bg-red-900/40 text-red-200'
                        )}
                      >
                        {ca.status}
                      </Badge>
                    </div>
                  </div>
                  {ca.cgpReference && (
                    <div className="mt-1 text-[10px] text-muted-foreground">
                      CGP: {ca.cgpReference}
                    </div>
                  )}
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Due {format(new Date(ca.dueDate), 'MMM d, yyyy')}
                    {ca.resolvedAt && ` · Resolved ${format(new Date(ca.resolvedAt), 'MMM d')}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!aiSummary && qspReviews.length === 0 && correctiveActions.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900/30 p-6 text-center text-sm text-muted-foreground">
            <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-amber-400" />
            No Block 4 mission data, AI findings, or corrective actions linked yet.
            <br />
            Link a completed mission from the missions page to populate the report.
          </div>
        )}
      </div>
    </PageTransition>
  );
}

