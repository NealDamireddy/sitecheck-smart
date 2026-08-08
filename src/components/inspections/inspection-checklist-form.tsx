'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  MapPin,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  SITE_OBSERVATION_CHECKS,
  getBmpCategoriesForRiskLevel,
  type SiteObservationId,
} from '@/lib/cgp/risk-level-bmps';
import { TRADITIONAL_RISK_2_CHECKLIST_VERSION } from '@/lib/cgp/checklist-expansion';
import { cn } from '@/lib/utils';
import { useActiveInspectionStore } from '@/stores/active-inspection-store';

interface ExceptionDraft {
  description: string;
  recommendation: string;
  location: string;
}

type ObservationState = Record<SiteObservationId, boolean>;

interface InspectionChecklistFormProps {
  inspectionId: string;
  initialObservedAt: string;
  onSubmitted: () => Promise<void>;
}

const EMPTY_EXCEPTION: ExceptionDraft = {
  description: '',
  recommendation: '',
  location: '',
};

const INITIAL_OBSERVATIONS: ObservationState = {
  precipitation: false,
  discolorations: false,
  odors: false,
  turbidity: false,
  sheen: false,
  floating_material: false,
  suspended_material: false,
};

function toLocalDateTimeInput(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoTimestamp(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function newSubmissionKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `checklist-${crypto.randomUUID()}`;
  }
  return `checklist-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function InspectionChecklistForm({
  inspectionId,
  initialObservedAt,
  onSubmitted,
}: InspectionChecklistFormProps) {
  const categories = useMemo(() => getBmpCategoriesForRiskLevel(2), []);
  const activeInspectionId = useActiveInspectionStore((state) => state.inspectionId);
  const clearActiveInspection = useActiveInspectionStore((state) => state.clear);
  const submissionKey = useRef<string | null>(null);

  const [observedAt, setObservedAt] = useState(() =>
    toLocalDateTimeInput(initialObservedAt)
  );
  const [constructionStage, setConstructionStage] = useState('');
  const [photosTaken, setPhotosTaken] = useState(false);
  const [observations, setObservations] = useState<ObservationState>(
    INITIAL_OBSERVATIONS
  );
  const [observationComments, setObservationComments] = useState('');
  const [qpeStart, setQpeStart] = useState('');
  const [qpeEnd, setQpeEnd] = useState('');
  const [qpeDurationHours, setQpeDurationHours] = useState('');
  const [rainGaugeInches, setRainGaugeInches] = useState('');
  const [exceptions, setExceptions] = useState<Record<string, ExceptionDraft>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exceptionCount = Object.keys(exceptions).length;

  function toggleException(itemId: string) {
    setExceptions((current) => {
      const next = { ...current };
      if (next[itemId]) delete next[itemId];
      else next[itemId] = { ...EMPTY_EXCEPTION };
      return next;
    });
  }

  function updateException(
    itemId: string,
    field: keyof ExceptionDraft,
    value: string
  ) {
    setExceptions((current) => ({
      ...current,
      [itemId]: {
        ...(current[itemId] ?? EMPTY_EXCEPTION),
        [field]: value,
      },
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const observedAtIso = toIsoTimestamp(observedAt);
    if (!observedAtIso) {
      setError('Enter a valid inspection observation date and time.');
      return;
    }
    if (!constructionStage.trim()) {
      setError('Enter the current construction stage.');
      return;
    }
    if (!confirmed) {
      setError('Confirm that every unflagged checklist item was reviewed.');
      return;
    }

    const incompleteException = Object.entries(exceptions).find(
      ([, draft]) => !draft.description.trim() || !draft.recommendation.trim()
    );
    if (incompleteException) {
      setError(
        'Every flagged exception needs both a description and a recommendation.'
      );
      return;
    }

    const qpeHasValues =
      qpeStart || qpeEnd || qpeDurationHours || rainGaugeInches;
    const qpeStartIso = toIsoTimestamp(qpeStart);
    const qpeEndIso = toIsoTimestamp(qpeEnd);
    if ((qpeStart && !qpeStartIso) || (qpeEnd && !qpeEndIso)) {
      setError('Enter valid QPE start and end dates.');
      return;
    }

    const orderedExceptions = categories.flatMap((category) =>
      category.questions.flatMap((question) => {
        const draft = exceptions[question.id];
        if (!draft) return [];
        return [
          {
            itemId: question.id,
            description: draft.description.trim(),
            recommendation: draft.recommendation.trim(),
            ...(draft.location.trim() ? { location: draft.location.trim() } : {}),
          },
        ];
      })
    );

    submissionKey.current ??= newSubmissionKey();
    setSubmitting(true);
    try {
      const response = await fetch(
        `/api/inspections/${inspectionId}/checklist/submit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idempotencyKey: submissionKey.current,
            checklistVersion: TRADITIONAL_RISK_2_CHECKLIST_VERSION,
            observedAt: observedAtIso,
            unflaggedItemsConfirmed: true,
            constructionStage: constructionStage.trim(),
            photosTaken,
            ...(qpeHasValues
              ? {
                  qpe: {
                    start: qpeStartIso,
                    end: qpeEndIso,
                    durationHours: qpeDurationHours
                      ? Number(qpeDurationHours)
                      : null,
                    rainGaugeInches: rainGaugeInches
                      ? Number(rainGaugeInches)
                      : null,
                  },
                }
              : {}),
            siteObservations: {
              precipitation: observations.precipitation,
              discolorations: observations.discolorations,
              odors: observations.odors,
              turbidity: observations.turbidity,
              sheen: observations.sheen,
              floatingMaterial: observations.floating_material,
              suspendedMaterial: observations.suspended_material,
              ...(observationComments.trim()
                ? { comments: observationComments.trim() }
                : {}),
            },
            exceptions: orderedExceptions,
          }),
        }
      );

      const body = (await response.json().catch(() => ({}))) as {
        error?: string | Array<{ message?: string }>;
      };
      if (!response.ok) {
        const message =
          typeof body.error === 'string'
            ? body.error
            : body.error?.[0]?.message ?? 'Checklist submission failed.';
        throw new Error(message);
      }

      if (activeInspectionId === inspectionId) clearActiveInspection();
      await onSubmitted();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Checklist submission failed.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      id="bmp-checklist"
      onSubmit={handleSubmit}
      className="scroll-mt-6 rounded-lg border border-amber-500/35 bg-slate-900/70 p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-amber-400" />
            <h2 className="font-heading text-lg font-bold text-slate-100">
              QSP BMP inspection checklist
            </h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-300">
            Walk the site using these 22 CGP questions. Flag only exceptions;
            unflagged items are recorded as compliant only after your final
            confirmation.
          </p>
        </div>
        <div
          className={cn(
            'rounded-full border px-3 py-1 text-xs font-semibold',
            exceptionCount > 0
              ? 'border-red-700 bg-red-950/40 text-red-200'
              : 'border-slate-700 bg-slate-950/50 text-slate-300'
          )}
        >
          {exceptionCount} exception{exceptionCount === 1 ? '' : 's'} flagged
        </div>
      </div>

      <section className="mt-5 rounded-lg border border-slate-800 bg-slate-950/30 p-4">
        <h3 className="text-sm font-semibold text-slate-100">
          Part 1 — Inspection information
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Site name, WDID, risk level, and QSP identity are copied from the
          stored project and inspection records.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-300">
            Observed date and time
            <input
              type="datetime-local"
              value={observedAt}
              onChange={(event) => setObservedAt(event.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium text-slate-300">
            Current construction stage
            <input
              value={constructionStage}
              onChange={(event) => setConstructionStage(event.target.value)}
              required
              maxLength={500}
              placeholder="Example: Earthwork / grading"
              className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
            />
          </label>
        </div>

        <div className="mt-4">
          <div className="text-xs font-medium text-slate-300">
            Site observations — check each condition that was present
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SITE_OBSERVATION_CHECKS.map((observation) => (
              <label
                key={observation.id}
                className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-800 bg-slate-950/50 p-2.5 text-xs text-slate-300"
              >
                <input
                  type="checkbox"
                  checked={observations[observation.id]}
                  onChange={(event) =>
                    setObservations((current) => ({
                      ...current,
                      [observation.id]: event.target.checked,
                    }))
                  }
                  className="mt-0.5 h-4 w-4 accent-amber-500"
                />
                {observation.label}
              </label>
            ))}
          </div>
          <textarea
            value={observationComments}
            onChange={(event) => setObservationComments(event.target.value)}
            maxLength={5000}
            rows={2}
            placeholder="Optional site-observation comments"
            aria-label="Site observation comments"
            className="mt-2 block w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
          />
        </div>

        <details className="mt-4 rounded-md border border-slate-800 bg-slate-950/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-200">
            Qualifying precipitation event details (optional)
          </summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-slate-300">
              QPE beginning
              <input
                type="datetime-local"
                value={qpeStart}
                onChange={(event) => setQpeStart(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-950/70 px-2 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-300">
              QPE ending
              <input
                type="datetime-local"
                value={qpeEnd}
                onChange={(event) => setQpeEnd(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-950/70 px-2 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-300">
              Duration (hours)
              <input
                type="number"
                min="0"
                step="0.1"
                value={qpeDurationHours}
                onChange={(event) => setQpeDurationHours(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-950/70 px-2 py-2 text-sm text-slate-100"
              />
            </label>
            <label className="text-xs text-slate-300">
              Rain gauge (inches)
              <input
                type="number"
                min="0"
                step="0.01"
                value={rainGaugeInches}
                onChange={(event) => setRainGaugeInches(event.target.value)}
                className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-950/70 px-2 py-2 text-sm text-slate-100"
              />
            </label>
          </div>
        </details>

        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={photosTaken}
            onChange={(event) => setPhotosTaken(event.target.checked)}
            className="h-4 w-4 accent-amber-500"
          />
          <Camera className="h-4 w-4 text-slate-400" />
          Photographs were taken during this inspection
        </label>
      </section>

      <section className="mt-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">
            Part 2 — BMP observations
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Tap “Flag exception” only when the BMP question is not satisfied.
          </p>
        </div>

        {categories.map((category) => (
          <div
            key={category.number}
            className="overflow-hidden rounded-lg border border-slate-800"
          >
            <div className="bg-slate-800/75 px-3 py-2 text-sm font-semibold text-slate-100">
              {category.number}. {category.title}
            </div>
            <div className="divide-y divide-slate-800">
              {category.questions.map((question, index) => {
                const exception = exceptions[question.id];
                return (
                  <div
                    key={question.id}
                    className={cn(
                      'p-3 transition-colors',
                      exception ? 'bg-red-950/20' : 'bg-slate-950/30'
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <p className="text-sm leading-relaxed text-slate-200">
                        <span className="mr-1 font-semibold text-slate-400">
                          {index + 1}.
                        </span>
                        {question.prompt}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleException(question.id)}
                        aria-pressed={!!exception}
                        className={cn(
                          'shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50',
                          exception
                            ? 'border-red-600 bg-red-900/50 text-red-100 hover:bg-red-900/70'
                            : 'border-slate-600 bg-slate-900 text-slate-300 hover:border-amber-600 hover:text-amber-200'
                        )}
                      >
                        {exception ? 'Exception flagged' : 'Flag exception'}
                      </button>
                    </div>

                    {exception && (
                      <div className="mt-3 grid gap-3 rounded-md border border-red-900/60 bg-slate-950/55 p-3 md:grid-cols-2">
                        <label className="text-xs font-medium text-red-100">
                          Deficiency description
                          <textarea
                            value={exception.description}
                            onChange={(event) =>
                              updateException(
                                question.id,
                                'description',
                                event.target.value
                              )
                            }
                            required
                            maxLength={5000}
                            rows={3}
                            placeholder="Describe what was observed"
                            className="mt-1 block w-full rounded-md border border-red-900/70 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-red-500 focus:outline-none"
                          />
                        </label>
                        <label className="text-xs font-medium text-red-100">
                          Recommended correction
                          <textarea
                            value={exception.recommendation}
                            onChange={(event) =>
                              updateException(
                                question.id,
                                'recommendation',
                                event.target.value
                              )
                            }
                            required
                            maxLength={5000}
                            rows={3}
                            placeholder="Describe the recommended corrective action"
                            className="mt-1 block w-full rounded-md border border-red-900/70 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-red-500 focus:outline-none"
                          />
                        </label>
                        <label className="text-xs font-medium text-slate-300 md:col-span-2">
                          <MapPin className="mr-1 inline h-3.5 w-3.5" />
                          Location (optional)
                          <input
                            value={exception.location}
                            onChange={(event) =>
                              updateException(
                                question.id,
                                'location',
                                event.target.value
                              )
                            }
                            maxLength={1000}
                            placeholder="Example: northwest concrete washout"
                            className="mt-1 block w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
                          />
                        </label>
                        <p className="text-xs text-amber-300 md:col-span-2">
                          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
                          The repair-start deadline will be calculated as 72
                          hours after the inspection observation time.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 accent-emerald-500"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-200">
              <ShieldCheck className="h-4 w-4" />
              QSP confirmation
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-foreground/80">
              I reviewed every checklist item. Every unflagged item was
              observed to be compliant, and every deficiency was flagged above.
            </span>
          </span>
        </label>
      </section>

      {error && (
        <div
          role="alert"
          className="mt-4 rounded-md border border-red-800 bg-red-950/35 p-3 text-sm text-red-200"
        >
          <AlertTriangle className="mr-1.5 inline h-4 w-4" />
          {error}
        </div>
      )}

      <div className="mt-4 flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-xs text-muted-foreground">
          Submission stores all 22 answers and permanently closes this
          inspection.
        </p>
        <Button
          type="submit"
          size="lg"
          disabled={submitting || !confirmed}
          className="bg-emerald-600 px-5 hover:bg-emerald-700"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {submitting ? 'Submitting checklist…' : 'Submit completed inspection'}
        </Button>
      </div>
    </form>
  );
}
