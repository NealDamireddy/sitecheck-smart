'use client';

import { useState, useRef, ChangeEvent } from 'react';
import {
  Camera,
  Upload,
  Loader2,
  AlertTriangle,
  Plane,
  User,
  Brain,
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { cn } from '@/lib/utils';
import { FIELD_ACTION_CLASS } from '@/lib/field-ui';
import { compressFieldPhoto, describeCompression } from '@/lib/image-compress';
import type { AIAnalysis } from '@/types/drone';
import type { CheckpointStatus } from '@/types/checkpoint';

type View = 'drone' | 'qsp';

interface Props {
  checkpointId: string;
  droneUrl?: string | null;
  qspUrl?: string | null;
  qspUploadedAt?: string | null;
  /** Called with the freshly-uploaded URL + timestamp after a successful POST. */
  onUploaded?: (next: { qspPhotoUrl: string; qspPhotoUploadedAt: string }) => void;
  /** Called with the freshly-generated Claude analysis after auto-analyze. */
  onAnalyzed?: (analysis: AIAnalysis) => void;
}

interface AnalyzeResponse extends AIAnalysis {
  id?: string;
  createdAt?: string;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic';

export function CheckpointPhotoViewer({
  checkpointId,
  droneUrl,
  qspUrl,
  qspUploadedAt,
  onUploaded,
  onAnalyzed,
}: Props) {
  // Default to the QSP photo if one exists — field photos win over drone
  // by recency, which is what the QSP usually wants to see.
  const [view, setView] = useState<View>(qspUrl ? 'qsp' : 'drone');
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localQspUrl, setLocalQspUrl] = useState<string | null>(qspUrl ?? null);
  const [localQspAt, setLocalQspAt] = useState<string | null>(qspUploadedAt ?? null);
  const [prepping, setPrepping] = useState(false);
  const [sizeNote, setSizeNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeUrl = view === 'qsp' ? localQspUrl : droneUrl;

  const onChooseFile = () => fileInputRef.current?.click();

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same filename
    if (!file) return;

    setUploading(true);
    setError(null);
    setPrepping(true);
    try {
      // UX-02: downscale before upload. A raw phone photo routinely
      // exceeds the route's 5 MiB cap and is slow on field cellular.
      const prepared = await compressFieldPhoto(file);
      setPrepping(false);
      setSizeNote(describeCompression(prepared));

      const form = new FormData();
      form.set('file', prepared.file);
      const res = await fetch(`/api/checkpoints/${checkpointId}/photo`, {
        method: 'POST',
        body: form,
      });
      const body = (await res.json()) as
        | { qspPhotoUrl: string; qspPhotoUploadedAt: string }
        | { error: string };
      if (!res.ok || !('qspPhotoUrl' in body)) {
        const message = 'error' in body ? body.error : `Upload failed (${res.status})`;
        throw new Error(message);
      }
      setLocalQspUrl(body.qspPhotoUrl);
      setLocalQspAt(body.qspPhotoUploadedAt);
      setView('qsp');
      onUploaded?.(body);
    } catch (err) {
      setPrepping(false);
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploading(false);
      return;
    }
    setUploading(false);

    // Chain Claude vision analysis. A failure here doesn't roll back the
    // upload — the photo stays on the checkpoint, the QSP just won't see
    // a fresh analysis in the AI tab until they retry.
    setAnalyzing(true);
    try {
      const analyzeRes = await fetch(
        `/api/checkpoints/${checkpointId}/analyze`,
        { method: 'POST' },
      );
      const analyzeBody = (await analyzeRes.json()) as
        | AnalyzeResponse
        | { error: string };
      if (!analyzeRes.ok || 'error' in analyzeBody) {
        const message =
          'error' in analyzeBody
            ? analyzeBody.error
            : `Analysis failed (${analyzeRes.status})`;
        throw new Error(message);
      }
      onAnalyzed?.({
        checkpointId: analyzeBody.checkpointId,
        summary: analyzeBody.summary,
        status: analyzeBody.status as CheckpointStatus,
        confidence: analyzeBody.confidence,
        details: analyzeBody.details,
        cgpReference: analyzeBody.cgpReference,
        recommendations: analyzeBody.recommendations,
      });
    } catch (err) {
      setError(
        `Photo uploaded but analysis failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="relative aspect-video overflow-hidden rounded-lg border border-border bg-background/50">
        {activeUrl ? (
          // Use a plain <img> rather than next/image because Supabase Storage
          // URLs aren't whitelisted in next.config domains and we don't want
          // to gate uploads on a config change.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={activeUrl}
            alt={view === 'qsp' ? 'QSP field photo' : 'Drone photo'}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Camera className="h-10 w-10 opacity-40" />
            <span className="text-xs uppercase tracking-wider opacity-60">
              {view === 'qsp' ? 'No field photo yet' : 'No drone image'}
            </span>
          </div>
        )}

        {/* View toggle — top-right overlay so it's discoverable but doesn't
            dominate. Disabled labels indicate which sources are populated. */}
        <div className="absolute right-2 top-2 flex overflow-hidden rounded-md border border-border bg-background/80 backdrop-blur">
          <button
            type="button"
            onClick={() => setView('drone')}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-[11px] transition-colors',
              view === 'drone'
                ? 'bg-amber-500 text-black'
                : 'text-muted-foreground hover:text-foreground',
              !droneUrl && 'opacity-50',
            )}
            aria-pressed={view === 'drone'}
          >
            <Plane className="h-3 w-3" />
            Drone
          </button>
          <button
            type="button"
            onClick={() => setView('qsp')}
            className={cn(
              'flex items-center gap-1 px-2 py-1 text-[11px] transition-colors',
              view === 'qsp'
                ? 'bg-amber-500 text-black'
                : 'text-muted-foreground hover:text-foreground',
              !localQspUrl && 'opacity-50',
            )}
            aria-pressed={view === 'qsp'}
          >
            <User className="h-3 w-3" />
            My photo
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-muted-foreground">
          {view === 'qsp' && localQspAt
            ? `Uploaded ${formatDistanceToNowStrict(new Date(localQspAt))} ago`
            : view === 'drone' && droneUrl
              ? 'Latest drone capture'
              : ' '}
        </span>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT}
            // `capture="environment"` tells mobile browsers to launch the
            // rear camera directly instead of the file picker. Desktop
            // browsers ignore it and fall back to a file chooser, so this
            // costs us nothing in the laptop flow.
            capture="environment"
            onChange={onFile}
            className="hidden"
          />
          <button
            type="button"
            onClick={onChooseFile}
            disabled={uploading || analyzing}
            className={cn(
              FIELD_ACTION_CLASS,
              'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20',
            )}
          >
            {uploading || analyzing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {prepping
              ? 'Preparing…'
              : uploading
                ? 'Uploading…'
                : analyzing
                  ? 'Analyzing…'
                  : localQspUrl
                    ? 'Replace photo'
                    : 'Upload photo'}
          </button>
        </div>
      </div>

      {sizeNote && !error && (
        <div className="text-[11px] text-muted-foreground">
          Photo resized for upload ({sizeNote})
        </div>
      )}

      {analyzing && (
        <div className="flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-200">
          <Brain className="h-3 w-3" />
          Generating compliance analysis from this photo…
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </div>
      )}
    </div>
  );
}
