'use client';

import { useState, useRef, ChangeEvent } from 'react';
import Image from 'next/image';
import {
  Camera,
  Upload,
  Loader2,
  AlertTriangle,
  Plane,
  User,
} from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import { cn } from '@/lib/utils';

type View = 'drone' | 'qsp';

interface Props {
  checkpointId: string;
  droneUrl?: string | null;
  qspUrl?: string | null;
  qspUploadedAt?: string | null;
  /** Called with the freshly-uploaded URL + timestamp after a successful POST. */
  onUploaded?: (next: { qspPhotoUrl: string; qspPhotoUploadedAt: string }) => void;
}

const ACCEPT = 'image/jpeg,image/png,image/webp,image/heic';

export function CheckpointPhotoViewer({
  checkpointId,
  droneUrl,
  qspUrl,
  qspUploadedAt,
  onUploaded,
}: Props) {
  // Default to the QSP photo if one exists — field photos win over drone
  // by recency, which is what the QSP usually wants to see.
  const [view, setView] = useState<View>(qspUrl ? 'qsp' : 'drone');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localQspUrl, setLocalQspUrl] = useState<string | null>(qspUrl ?? null);
  const [localQspAt, setLocalQspAt] = useState<string | null>(qspUploadedAt ?? null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeUrl = view === 'qsp' ? localQspUrl : droneUrl;

  const onChooseFile = () => fileInputRef.current?.click();

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same filename
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('file', file);
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
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
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
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {uploading
              ? 'Uploading…'
              : localQspUrl
                ? 'Replace photo'
                : 'Upload photo'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
          <AlertTriangle className="h-3 w-3" />
          {error}
        </div>
      )}
    </div>
  );
}
