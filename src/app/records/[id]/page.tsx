'use client';

import { FormEvent, use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  Download,
  FileText,
  Loader2,
  MapPin,
  Paperclip,
  Upload,
  UserRound,
} from 'lucide-react';
import { PageTransition } from '@/components/shared/page-transition';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
  SiteRecordDirectoryItem,
  SiteRecordStatusChange,
  SiteRecordUpload,
} from '@/types/site-record';

interface DetailResponse {
  record: SiteRecordDirectoryItem;
  uploads: SiteRecordUpload[];
  statusHistory: SiteRecordStatusChange[];
  sourceCount: number;
}

function recordLabel(record: SiteRecordDirectoryItem) {
  if (record.recordType === 'weekly_inspection') return 'Weekly inspection';
  if (record.recordType === 'monthly_inspection') return 'Monthly inspection';
  return 'SMARTS ad hoc';
}

function bytesLabel(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export default function FieldRecordDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileRole, setFileRole] = useState('supporting_document');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/site-records/${id}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Failed to load field record');
      setDetail(body as DetailResponse);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load field record');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('fileRole', fileRole);
      const response = await fetch(`/api/site-records/${id}/uploads`, {
        method: 'POST',
        body: formData,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'File upload failed');
      setFile(null);
      const input = document.getElementById('record-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await load();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'File upload failed');
    } finally {
      setUploading(false);
    }
  }

  if (loading && !detail) {
    return (
      <PageTransition>
        <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading field record…
        </div>
      </PageTransition>
    );
  }

  if (!detail) {
    return (
      <PageTransition>
        <div className="p-6">
          <Link href="/records" className="text-sm text-amber-400 hover:underline">← Back to field records</Link>
          <p className="mt-4 text-sm text-red-300">{error ?? 'Field record not found.'}</p>
        </div>
      </PageTransition>
    );
  }

  const { record } = detail;
  const workflowHref = record.detail.inspectionId
    ? `/inspections/${record.detail.inspectionId}`
    : record.detail.smartsEventId
      ? `/projects/${record.site.id}/events/${record.detail.smartsEventId}/capture`
      : null;

  return (
    <PageTransition>
      <div className="flex flex-col gap-5 p-4 sm:p-6">
        <Link href="/records" className="inline-flex items-center gap-1 text-sm text-amber-400 hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to field records
        </Link>

        <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-xl font-bold text-slate-100">
                  {record.title || recordLabel(record)}
                </h1>
                <Badge className="border border-slate-700 bg-slate-950 text-[10px] uppercase text-slate-200">
                  {record.workflowStatus.replaceAll('_', ' ')}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-slate-400">{recordLabel(record)}</p>
            </div>
            {workflowHref && (
              <Button nativeButton={false} render={<Link href={workflowHref} />}>
                Open field workflow <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Summary icon={Building2} label="Company" value={record.company.name} />
            <Summary icon={UserRound} label="Inspector" value={record.inspector.name} />
            <Summary icon={MapPin} label="Site" value={record.site.name} detail={record.site.wdid || undefined} />
            <Summary
              icon={CalendarClock}
              label="Created"
              value={format(new Date(record.createdAt), 'MMM d, yyyy')}
              detail={format(new Date(record.createdAt), 'h:mm a')}
            />
          </div>
        </section>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-700/60 bg-red-950/30 p-3 text-sm text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_0.8fr]">
          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-amber-400" />
              <div>
                <h2 className="font-heading text-base font-bold text-slate-100">Attachments</h2>
                <p className="text-xs text-muted-foreground">Private files retained with this record.</p>
              </div>
            </div>

            <form onSubmit={uploadFile} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
              <Input
                id="record-file"
                type="file"
                accept=".pdf,.csv,.txt,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.heic"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={uploading}
              />
              <select
                value={fileRole}
                onChange={(event) => setFileRole(event.target.value)}
                disabled={uploading}
                className="h-8 rounded-lg border border-input bg-slate-950 px-2.5 text-sm text-slate-200 outline-none focus:border-amber-500"
              >
                <option value="supporting_document">Supporting document</option>
                <option value="source">Original source</option>
                <option value="lab_result">Lab result</option>
                <option value="photo">Photo</option>
              </select>
              <Button type="submit" disabled={!file || uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
            </form>
            <p className="mt-2 text-[11px] text-muted-foreground">
              PDF, spreadsheet, text, or image · maximum 50 MiB · immutable after upload
            </p>

            <div className="mt-4 space-y-2">
              {detail.uploads.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-700 p-5 text-center text-xs text-muted-foreground">
                  No attachments yet.
                </div>
              ) : (
                detail.uploads.map((upload) => (
                  <div key={upload.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/35 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-200">{upload.originalFilename}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {upload.fileRole.replaceAll('_', ' ')} · {bytesLabel(upload.byteSize)} · {format(new Date(upload.createdAt), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                    {upload.downloadUrl && (
                      <Button nativeButton={false} variant="outline" size="icon-sm" render={<a href={upload.downloadUrl} target="_blank" rel="noreferrer" />}>
                        <Download className="h-4 w-4" />
                        <span className="sr-only">Download {upload.originalFilename}</span>
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
            <h2 className="font-heading text-base font-bold text-slate-100">Record activity</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {detail.sourceCount} captured source{detail.sourceCount === 1 ? '' : 's'} · immutable status trail
            </p>
            <ol className="mt-4 space-y-4 border-l border-slate-700 pl-4">
              {detail.statusHistory.map((change) => (
                <li key={change.id} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-slate-900 bg-amber-400" />
                  <p className="text-sm font-medium text-slate-200">{change.toStatus.replaceAll('_', ' ')}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {format(new Date(change.changedAt), 'MMM d, yyyy · h:mm a')}
                  </p>
                  {change.reason && <p className="mt-1 text-xs text-slate-400">{change.reason}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </PageTransition>
  );
}

function Summary({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-slate-200">{value}</p>
      {detail && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{detail}</p>}
    </div>
  );
}
