'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  FileText,
  Clock,
  AlertTriangle,
  Brain,
  History,
  CheckCircle2,
  XCircle,
  CircleHelp,
  Loader2,
} from 'lucide-react';
import type { Checkpoint, CheckpointStatus } from '@/types/checkpoint';
import type { AIAnalysis } from '@/types/drone';
import type { Deficiency } from '@/types/deficiency';
import {
  BMP_CATEGORY_LABELS,
  BMP_CATEGORY_COLORS,
} from '@/lib/constants';
import { checkpoints as staticCheckpoints } from '@/data/checkpoints';
import { aiAnalyses as staticAnalyses } from '@/data/ai-analyses';
import { deficiencies as staticDeficiencies } from '@/data/deficiencies';
import { isDemoSession } from '@/lib/demo/start-demo';
import { formatDateTime, formatCoordinate } from '@/lib/format';
import { StatusBadge } from '@/components/shared/status-badge';
import { AIAnalysisPanel } from '@/components/checkpoints/ai-analysis-panel';
import { CheckpointPhotoViewer } from '@/components/checkpoints/checkpoint-photo-viewer';
import { DeficiencyPanel } from '@/components/checkpoints/deficiency-panel';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useActiveInspectionStore } from '@/stores/active-inspection-store';
import { FIELD_ACTION_CLASS } from '@/lib/field-ui';

const priorityColors: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-green-500',
};

export function CheckpointDetail({ checkpointId }: { checkpointId: string }) {
  const [checkpoint, setCheckpoint] = useState<Checkpoint | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);
  const [matchingDeficiencies, setMatchingDeficiencies] = useState<Deficiency[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<CheckpointStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  useEffect(() => {
    // Demo session → fall back to bundled demo data when the API can't
    // serve this checkpoint. Real account → surface "Not found" rather
    // than masking it with a demo BMP that isn't theirs.
    function handleApiFailure() {
      if (!isDemoSession()) {
        setError('Not found');
        setLoading(false);
        return;
      }
      const cp = staticCheckpoints.find((c) => c.id === checkpointId);
      if (!cp) {
        setError('Not found');
        setLoading(false);
        return;
      }
      setCheckpoint({
        ...cp,
        location: cp.location ?? { lat: cp.lat, lng: cp.lng },
      });
      setAnalysis(staticAnalyses.find((a) => a.checkpointId === checkpointId) ?? null);
      setMatchingDeficiencies(
        staticDeficiencies.filter((d) => d.checkpointId === checkpointId)
      );
      setError(null);
      setLoading(false);
    }

    fetch(`/api/checkpoints/${checkpointId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        // The API returns flat lat/lng, construct location object
        const cp = {
          ...data,
          location: data.location || { lat: data.lat, lng: data.lng },
        };
        setCheckpoint(cp);
        setAnalysis(data.analysis || null);
        setMatchingDeficiencies(data.deficiencies || []);
        setLoading(false);
      })
      .catch(() => {
        handleApiFailure();
      });
  }, [checkpointId]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-500 border-t-transparent" /></div>;
  }

  if (error || !checkpoint) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground mb-4" />
        <h2 className="text-lg font-medium text-foreground mb-2">Checkpoint not found</h2>
        <p className="text-sm text-muted-foreground mb-6">No checkpoint exists with ID &quot;{checkpointId}&quot;.</p>
        <Link href="/checkpoints" className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-foreground/80 transition-colors">
          <ArrowLeft className="h-4 w-4" />Back to Checkpoints
        </Link>
      </div>
    );
  }

  const bmpColor = BMP_CATEGORY_COLORS[checkpoint.bmpType];

  // Mark a checkpoint compliant / deficient / needs-review without
  // requiring a photo. Useful when the QSP physically inspects a BMP
  // and just needs to record the result. Sends a PUT to the existing
  // /api/checkpoints/[id] endpoint and reflects the change locally so
  // the badge + sidebar update immediately.
  async function setCheckpointStatus(next: CheckpointStatus) {
    if (!checkpoint || checkpoint.status === next || statusUpdating) return;
    setStatusUpdating(next);
    setStatusError(null);
    try {
      const res = await fetch(`/api/checkpoints/${checkpoint.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: next,
          lastInspectionDate: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Update failed (HTTP ${res.status})`);
      }
      const updated = await res.json();
      setCheckpoint((prev) =>
        prev
          ? {
              ...prev,
              status: updated.status ?? next,
              lastInspectionDate:
                updated.lastInspectionDate ?? new Date().toISOString(),
            }
          : prev,
      );
      // Count this BMP toward the active inspection's reviewed total.
      useActiveInspectionStore.getState().markReviewed(checkpoint.id);
    } catch (err) {
      setStatusError(
        err instanceof Error ? err.message : 'Failed to update status',
      );
    } finally {
      setStatusUpdating(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Back button */}
      <Link
        href="/checkpoints"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Checkpoints
      </Link>

      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-xs text-muted-foreground">
          {checkpoint.id}
        </span>
        <h1 className="text-xl font-semibold text-foreground">
          {checkpoint.name}
        </h1>
        <StatusBadge status={checkpoint.status} />
        <span
          className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded"
          style={{
            color: bmpColor,
            backgroundColor: `${bmpColor}15`,
          }}
        >
          {BMP_CATEGORY_LABELS[checkpoint.bmpType]}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
          {checkpoint.stationLabel ?? checkpoint.zone ?? '—'}
        </span>
        <div className="flex items-center gap-1">
          <div
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              priorityColors[checkpoint.priority]
            )}
          />
          <span className="text-[10px] text-muted-foreground capitalize">
            {checkpoint.priority}
          </span>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Photo viewer — toggles between drone view and QSP field photo,
              with inline upload. */}
          <CheckpointPhotoViewer
            checkpointId={checkpoint.id}
            droneUrl={checkpoint.lastInspectionPhoto}
            qspUrl={checkpoint.qspPhotoUrl ?? null}
            qspUploadedAt={checkpoint.qspPhotoUploadedAt ?? null}
            onUploaded={(next) =>
              setCheckpoint((prev) =>
                prev
                  ? {
                      ...prev,
                      qspPhotoUrl: next.qspPhotoUrl,
                      qspPhotoUploadedAt: next.qspPhotoUploadedAt,
                    }
                  : prev,
              )
            }
            onAnalyzed={(next) => setAnalysis(next)}
          />

          {/* Photo-less status actions. The QSP can record a visual
              inspection result directly, without uploading or running
              AI analysis. */}
          <Card className="border-border bg-surface">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="flex flex-col">
                <span className="text-xs font-medium text-foreground">
                  Mark this BMP without a photo
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Records an inspection result and updates the last-inspected timestamp.
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCheckpointStatus('compliant')}
                  disabled={
                    checkpoint.status === 'compliant' || statusUpdating !== null
                  }
                  className={cn(
                    FIELD_ACTION_CLASS,
                    checkpoint.status === 'compliant'
                      ? 'border-green-500/40 bg-green-500/15 text-green-300'
                      : 'border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20',
                  )}
                >
                  {statusUpdating === 'compliant' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {checkpoint.status === 'compliant'
                    ? 'Compliant'
                    : 'Mark Compliant'}
                </button>
                <button
                  type="button"
                  onClick={() => setCheckpointStatus('deficient')}
                  disabled={
                    checkpoint.status === 'deficient' || statusUpdating !== null
                  }
                  className={cn(
                    FIELD_ACTION_CLASS,
                    checkpoint.status === 'deficient'
                      ? 'border-red-500/40 bg-red-500/15 text-red-300'
                      : 'border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20',
                  )}
                >
                  {statusUpdating === 'deficient' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="h-4 w-4" />
                  )}
                  {checkpoint.status === 'deficient'
                    ? 'Deficient'
                    : 'Mark Deficient'}
                </button>
                <button
                  type="button"
                  onClick={() => setCheckpointStatus('needs-review')}
                  disabled={
                    checkpoint.status === 'needs-review' ||
                    statusUpdating !== null
                  }
                  className={cn(
                    FIELD_ACTION_CLASS,
                    checkpoint.status === 'needs-review'
                      ? 'border-purple-500/40 bg-purple-500/15 text-purple-300'
                      : 'border-purple-500/30 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20',
                  )}
                >
                  {statusUpdating === 'needs-review' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CircleHelp className="h-4 w-4" />
                  )}
                  {checkpoint.status === 'needs-review'
                    ? 'Needs Review'
                    : 'Mark Needs Review'}
                </button>
              </div>
              {statusError && (
                <div className="flex w-full items-center gap-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11px] text-red-300">
                  <AlertTriangle className="h-3 w-3" />
                  {statusError}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tabs */}
          <Tabs defaultValue="ai-analysis">
            <TabsList>
              <TabsTrigger value="ai-analysis">
                <Brain className="h-3.5 w-3.5" />
                AI Analysis
              </TabsTrigger>
              <TabsTrigger value="deficiencies">
                <AlertTriangle className="h-3.5 w-3.5" />
                Deficiencies
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-3.5 w-3.5" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ai-analysis" className="pt-4">
              {analysis ? (
                <AIAnalysisPanel analysis={analysis} checkpoint={checkpoint} />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Brain className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No AI analysis available for this checkpoint.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="deficiencies" className="pt-4">
              {matchingDeficiencies.length > 0 ? (
                <div className="space-y-4">
                  {matchingDeficiencies.map((deficiency) => (
                    <DeficiencyPanel
                      key={deficiency.id}
                      deficiency={deficiency}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <AlertTriangle className="h-8 w-8 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">
                    No deficiencies recorded for this checkpoint.
                  </p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="pt-4">
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <History className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Inspection history coming soon.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right column (1/3) */}
        <div className="lg:col-span-1">
          <Card className="border-border bg-surface">
            <CardContent className="space-y-4 pt-4">
              <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Checkpoint Info
              </h3>

              {/* CGP Section */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  CGP Section
                </p>
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {checkpoint.cgpSection}
                  </span>
                </div>
              </div>

              {/* Install Date */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Install Date
                </p>
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {formatDateTime(checkpoint.installDate)}
                  </span>
                </div>
              </div>

              {/* Last Inspected */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Last Inspected
                </p>
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    {formatDateTime(checkpoint.lastInspectionDate)}
                  </span>
                </div>
              </div>

              {/* Zone */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  {checkpoint.stationLabel ? 'Station' : 'Zone'}
                </p>
                <Badge variant="outline" className="capitalize">
                  {checkpoint.stationLabel ?? checkpoint.zone ?? '—'}
                </Badge>
              </div>

              {/* Location */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  Location
                </p>
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="text-sm text-foreground font-mono">
                    <div>{formatCoordinate(checkpoint.location.lat, 'lat')}</div>
                    <div>{formatCoordinate(checkpoint.location.lng, 'lng')}</div>
                  </div>
                </div>
              </div>

              {/* SWPPP Page */}
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">
                  SWPPP Page
                </p>
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm text-foreground">
                    Page {checkpoint.swpppPage}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}
