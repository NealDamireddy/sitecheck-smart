'use client';

/**
 * SWPPP documents for a project.
 *
 * /projects/[projectId]/swppp
 *
 * Upload a SWPPP PDF, watch it process, review the BMPs the extractor found,
 * and promote the ones you accept into real checkpoints.
 *
 * The review step is the point. Extraction writes drafts and stops; nothing
 * becomes a checkpoint until a QSP ticks it here, because AI output is a
 * draft and never authority. The UI reflects that: no "accept all and go"
 * button, and every draft shows the maintenance trigger the document actually
 * stated so the QSP is checking against the source, not a summary.
 *
 * This is separate from /swppp, which scans a PDF *before* a project exists
 * to bootstrap one. That flow is unchanged.
 */

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from 'lucide-react';

import { PageTransition } from '@/components/shared/page-transition';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BMP_CATEGORY_LABELS } from '@/lib/constants';
import type { AnyBmpType } from '@/lib/cgp/bmp-types';

interface SwpppDocument {
  id: string;
  filename: string;
  status: 'processing' | 'completed' | 'failed';
  error_message: string | null;
  bmp_count: number | null;
  page_count: number | null;
  extracted_wdid: string | null;
  extracted_risk_level: string | null;
  extracted_qsp_name: string | null;
  uploaded_at: string;
}

interface BmpDraft {
  id: number;
  bmp_category: string;
  bmp_code: string;
  title: string;
  required_locations: string[];
  inspection_frequency: string[];
  maintenance_threshold: string;
  promoted_checkpoint_id: string | null;
}

/** Poll while a document is processing. Extraction runs 15–30s typically. */
const POLL_MS = 2_000;

export default function ProjectSwpppPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);

  const [documents, setDocuments] = useState<SwpppDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDocId, setOpenDocId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<BmpDraft[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [promoting, setPromoting] = useState(false);
  const [promoteResult, setPromoteResult] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/swppp`);
      if (!res.ok) throw new Error('Could not load documents');
      const data = await res.json();
      setDocuments(data.documents ?? []);
    } catch {
      setError('Could not load SWPPP documents.');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Poll only while something is actually processing, and stop as soon as
  // nothing is — an interval that never clears is how a page quietly burns
  // battery on a phone in the field.
  useEffect(() => {
    if (!documents.some((d) => d.status === 'processing')) return;
    const timer = setInterval(loadDocuments, POLL_MS);
    return () => clearInterval(timer);
  }, [documents, loadDocuments]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await fetch(`/api/projects/${projectId}/swppp`, {
        method: 'POST',
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // A 503 means the processing service is down; point at the flow that
        // still works rather than leaving the user stuck.
        setError(
          data.fallback
            ? `${data.error} You can still use the SWPPP scanner.`
            : data.error || `Upload failed (HTTP ${res.status})`
        );
        return;
      }
      await loadDocuments();
    } catch {
      setError('Upload failed. Check your connection and try again.');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function openDocument(documentId: string) {
    if (openDocId === documentId) {
      setOpenDocId(null);
      return;
    }
    setOpenDocId(documentId);
    setDrafts([]);
    setSelected(new Set());
    setPromoteResult(null);
    const res = await fetch(`/api/projects/${projectId}/swppp/${documentId}`);
    if (res.ok) {
      const data = await res.json();
      const list: BmpDraft[] = data.drafts ?? [];
      setDrafts(list);
      // Pre-select everything not already promoted: reviewing means removing
      // what you disagree with, which is less error-prone than remembering to
      // tick every row.
      setSelected(new Set(list.filter((d) => !d.promoted_checkpoint_id).map((d) => d.id)));
    }
  }

  async function promote() {
    if (selected.size === 0) return;
    setPromoting(true);
    setPromoteResult(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/swppp/${openDocId}/promote`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ draftIds: [...selected] }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPromoteResult(data.error || 'Could not create checkpoints.');
        return;
      }
      setPromoteResult(
        `Created ${data.created} checkpoint${data.created === 1 ? '' : 's'}.` +
          (data.unplaced
            ? ' Set the project location to place them on the map.'
            : ' Drag them into position on the map.')
      );
      if (openDocId) await openDocument(openDocId);
    } finally {
      setPromoting(false);
    }
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function remove(documentId: string) {
    const res = await fetch(`/api/projects/${projectId}/swppp/${documentId}`, {
      method: 'DELETE',
    });
    if (res.ok) {
      if (openDocId === documentId) setOpenDocId(null);
      await loadDocuments();
    }
  }

  return (
    <PageTransition>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <Link
          href="/sites"
          className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Projects
        </Link>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">SWPPP Documents</h1>
            <p className="mt-1 text-sm text-slate-400">
              Upload a SWPPP to extract its BMP schedule. Extracted BMPs stay
              drafts until you promote them.
            </p>
          </div>
          <div>
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
              }}
            />
            <Button
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              {uploading ? 'Uploading…' : 'Upload SWPPP'}
            </Button>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 py-16 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm text-slate-400">No SWPPP uploaded yet.</p>
            <p className="mt-1 text-xs text-slate-500">
              Upload the PDF and its BMP schedule becomes reviewable checkpoints.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="rounded-lg border border-slate-800 bg-slate-900/40"
              >
                <div className="flex items-center gap-3 p-4">
                  <FileText className="h-5 w-5 shrink-0 text-slate-500" />
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => doc.status === 'completed' && openDocument(doc.id)}
                    disabled={doc.status !== 'completed'}
                  >
                    <p className="truncate font-medium text-slate-100">
                      {doc.filename}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {format(new Date(doc.uploaded_at), 'd MMM yyyy, HH:mm')}
                      {doc.page_count ? ` · ${doc.page_count} pages` : ''}
                      {doc.extracted_risk_level
                        ? ` · Risk ${doc.extracted_risk_level}`
                        : ''}
                      {doc.extracted_wdid ? ` · WDID ${doc.extracted_wdid}` : ''}
                    </p>
                  </button>

                  <StatusBadge doc={doc} />

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(doc.id)}
                    aria-label={`Delete ${doc.filename}`}
                  >
                    <Trash2 className="h-4 w-4 text-slate-500" />
                  </Button>
                </div>

                {doc.status === 'failed' && doc.error_message && (
                  <p className="border-t border-slate-800 px-4 py-3 text-sm text-red-300">
                    {doc.error_message}
                  </p>
                )}

                {openDocId === doc.id && (
                  <DraftReview
                    drafts={drafts}
                    selected={selected}
                    onToggle={toggle}
                    onPromote={promote}
                    promoting={promoting}
                    result={promoteResult}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageTransition>
  );
}

function StatusBadge({ doc }: { doc: SwpppDocument }) {
  if (doc.status === 'processing') {
    return (
      <Badge className="border-blue-800 bg-blue-950/50 text-blue-200">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Processing
      </Badge>
    );
  }
  if (doc.status === 'failed') {
    return (
      <Badge className="border-red-800 bg-red-950/50 text-red-200">Failed</Badge>
    );
  }
  return (
    <Badge className="border-emerald-800 bg-emerald-950/50 text-emerald-200">
      {doc.bmp_count ?? 0} BMPs
    </Badge>
  );
}

function DraftReview({
  drafts,
  selected,
  onToggle,
  onPromote,
  promoting,
  result,
}: {
  drafts: BmpDraft[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  onPromote: () => void;
  promoting: boolean;
  result: string | null;
}) {
  const pending = drafts.filter((d) => !d.promoted_checkpoint_id);

  return (
    <div className="border-t border-slate-800 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">
          {pending.length > 0
            ? `Review the extracted BMPs, then create checkpoints. ${selected.size} of ${pending.length} selected.`
            : 'Every BMP from this document has been promoted.'}
        </p>
        {pending.length > 0 && (
          <Button size="sm" onClick={onPromote} disabled={promoting || selected.size === 0}>
            {promoting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            Create {selected.size} checkpoint{selected.size === 1 ? '' : 's'}
          </Button>
        )}
      </div>

      {result && (
        <p className="mb-3 flex items-center gap-2 text-sm text-emerald-300">
          <CheckCircle2 className="h-4 w-4" />
          {result}
        </p>
      )}

      <ul className="space-y-2">
        {drafts.map((draft) => {
          const promoted = Boolean(draft.promoted_checkpoint_id);
          return (
            <li
              key={draft.id}
              className={cn(
                'rounded-md border p-3',
                promoted
                  ? 'border-slate-800 bg-slate-900/30 opacity-60'
                  : 'border-slate-700 bg-slate-900/60'
              )}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0"
                  checked={promoted || selected.has(draft.id)}
                  disabled={promoted}
                  onChange={() => onToggle(draft.id)}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-100">
                      {draft.bmp_code}
                    </span>
                    <span className="text-slate-300">{draft.title}</span>
                    <Badge className="border-slate-700 bg-slate-800 text-slate-300">
                      {BMP_CATEGORY_LABELS[draft.bmp_category as AnyBmpType] ??
                        draft.bmp_category}
                    </Badge>
                    {promoted && (
                      <Badge className="border-emerald-900 bg-emerald-950/40 text-emerald-300">
                        Promoted
                      </Badge>
                    )}
                  </div>

                  {/* The maintenance trigger is what an inspector actually acts
                      on in the field, so it gets the most visual weight. */}
                  <p className="mt-1.5 text-sm text-slate-400">
                    {draft.maintenance_threshold}
                  </p>

                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                    {draft.inspection_frequency.length > 0 && (
                      <span>Inspect: {draft.inspection_frequency.join(', ')}</span>
                    )}
                    {draft.required_locations.length > 0 && (
                      <span>At: {draft.required_locations.join('; ')}</span>
                    )}
                  </div>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
