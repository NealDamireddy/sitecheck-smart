'use client';

// This is NOT an API integration with SMARTS — the State Water Board does
// not accept programmatic submissions for construction projects. This modal
// is a structured checklist that guides the QSP through the required manual
// filing process and records completion in our DB.
//
// Steps 1-3 are self-reported (user-toggled checkboxes; the action buttons
// auto-flip the checkbox for convenience but the user can toggle either way).
// Step 4 is the only step that touches the DB — it PATCHes the smarts_event
// to status='completed' and is read-only-displayed thereafter.

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  Send,
} from 'lucide-react';
import { useSmartsEventsStore } from '@/stores/smarts-events-store';
import { buildSmartsWalkthrough } from '@/lib/smarts/walkthrough';
import { cn } from '@/lib/utils';
import type { SmartsExportInput } from '@/lib/smarts/types';

const SMARTS_PORTAL_URL = 'https://smarts.waterboards.ca.gov';

export interface SyncToSmartsDialogProps {
  eventId: string;
  projectId: string;
  open: boolean;
  onClose: () => void;
  onCompleted: () => void;
  /**
   * Walkthrough input — parent page already has this hydrated from its
   * own store subscriptions. Passed in rather than re-fetched here so
   * the modal stays decoupled from monitoring-locations / samples
   * stores. (The sync modal still needs the smarts-events store to
   * commit Step 4.)
   */
  walkthroughInput: SmartsExportInput;
}

export function SyncToSmartsDialog({
  eventId,
  projectId,
  open,
  onClose,
  onCompleted,
  walkthroughInput,
}: SyncToSmartsDialogProps) {
  const [step1Done, setStep1Done] = useState(false);
  const [step2Done, setStep2Done] = useState(false);
  const [step3Done, setStep3Done] = useState(false);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);

  const status = useSmartsEventsStore((s) => s.byId[eventId]?.status ?? null);
  const updateEvent = useSmartsEventsStore((s) => s.update);

  const isFiled = status === 'completed';
  const canCommit = step1Done && step2Done && step3Done;

  const wdid = walkthroughInput.wdid;
  const dateStr = new Date().toISOString().slice(0, 10);
  const excelFilename = `smarts-ad-hoc-${
    wdid && wdid.trim() ? wdid.trim() : eventId
  }-${dateStr}.xlsx`;

  async function handleCopyWalkthrough() {
    try {
      const text = buildSmartsWalkthrough(walkthroughInput);
      await navigator.clipboard.writeText(text);
      setStep2Done(true);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2000);
    } catch (err) {
      console.warn('Copy walkthrough failed:', err);
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 3000);
    }
  }

  async function handleCommit() {
    setCommitting(true);
    setCommitError(null);
    try {
      await updateEvent(eventId, projectId, { status: 'completed' });
      const storeError = useSmartsEventsStore.getState().error;
      if (storeError) throw new Error(storeError);
      onCompleted();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to mark filing complete';
      setCommitError(msg);
      setCommitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync to SMARTS</DialogTitle>
          <DialogDescription>
            SMARTS does not accept programmatic submissions for construction
            projects. This checklist guides the manual filing process and
            records completion in our database when you&apos;re done.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <StepBlock
            number={1}
            title="Download Excel data-entry aid"
            helper="Open this file alongside SMARTS as you type. SMARTS does not accept this file as an upload — it's a reference."
            checked={step1Done}
            onCheckedChange={setStep1Done}
          >
            <a
              href={`/api/smarts-events/${eventId}/export`}
              download={excelFilename}
              onClick={() => setStep1Done(true)}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800/60"
            >
              <Download className="h-3.5 w-3.5" />
              Download xlsx
            </a>
          </StepBlock>

          <StepBlock
            number={2}
            title="Copy filing walkthrough"
            helper="Paste-ready instructions for each SMARTS field."
            checked={step2Done}
            onCheckedChange={setStep2Done}
          >
            <Button variant="outline" size="sm" onClick={handleCopyWalkthrough}>
              {copyState === 'copied' ? (
                <>
                  <CheckCircle2 className="mr-1.5 h-3.5 w-3.5 text-emerald-400" />
                  Copied ✓
                </>
              ) : copyState === 'error' ? (
                <>
                  <AlertTriangle className="mr-1.5 h-3.5 w-3.5 text-red-400" />
                  Copy failed
                </>
              ) : (
                <>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copy walkthrough
                </>
              )}
            </Button>
          </StepBlock>

          <StepBlock
            number={3}
            title="Open SMARTS portal"
            helper="Log in with your SMARTS credentials. Navigate to Reports → File Reports → Ad Hoc Monitoring Report."
            checked={step3Done}
            onCheckedChange={setStep3Done}
          >
            <a
              href={SMARTS_PORTAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setStep3Done(true)}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-100 hover:bg-slate-800/60"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open SMARTS portal
            </a>
          </StepBlock>

          {/* Step 4 — no independent checkbox; reads from DB state. */}
          <div
            className={cn(
              'rounded-md border p-3',
              isFiled
                ? 'border-emerald-700 bg-emerald-900/30'
                : 'border-slate-800 bg-slate-950/40'
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  isFiled
                    ? 'border-emerald-600 bg-emerald-700/40 text-emerald-200'
                    : 'border-slate-600 bg-slate-900/60 text-slate-400'
                )}
                aria-label={isFiled ? 'Filed' : 'Not yet filed'}
              >
                {isFiled ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <span className="text-[10px]">4</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Step 4
                </div>
                <div className="mt-0.5 font-semibold text-slate-100">
                  {isFiled ? 'Filed ✓' : 'Mark filing complete'}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Only mark complete after you&apos;ve successfully submitted in
                  SMARTS. This sets the event status to{' '}
                  <code className="rounded bg-slate-950/60 px-1 py-0.5 font-mono text-[10px] text-slate-200">
                    completed
                  </code>{' '}
                  in our database.
                </div>
                {!isFiled && (
                  <div className="mt-2">
                    <Button
                      onClick={handleCommit}
                      disabled={!canCommit || committing}
                      className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                      size="sm"
                    >
                      {committing ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          Recording…
                        </>
                      ) : (
                        <>
                          <Send className="mr-1.5 h-3.5 w-3.5" />
                          Mark complete
                        </>
                      )}
                    </Button>
                    {!canCommit && (
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        Check off steps 1, 2, and 3 to enable.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {commitError && (
            <div className="rounded-md border border-red-700 bg-red-900/40 p-3 text-xs text-red-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span className="break-words">{commitError}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────
// StepBlock — checklist row for steps 1-3
// ──────────────────────────────────────────────────────

interface StepBlockProps {
  number: number;
  title: string;
  helper: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  children: React.ReactNode;
}

function StepBlock({
  number,
  title,
  helper,
  checked,
  onCheckedChange,
  children,
}: StepBlockProps) {
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        checked
          ? 'border-emerald-700 bg-emerald-900/20'
          : 'border-slate-800 bg-slate-950/40'
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => onCheckedChange(!checked)}
          aria-pressed={checked}
          aria-label={`Mark step ${number} ${checked ? 'incomplete' : 'complete'}`}
          className={cn(
            'mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
            checked
              ? 'border-emerald-600 bg-emerald-700/40 text-emerald-200'
              : 'border-slate-600 bg-slate-900/60 text-slate-400 hover:border-slate-500'
          )}
        >
          {checked && <CheckCircle2 className="h-3.5 w-3.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Step {number}
          </div>
          <div className="mt-0.5 font-semibold text-slate-100">{title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{helper}</div>
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
