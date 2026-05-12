'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Camera,
  MapPin,
  Calendar,
  FileText,
  Clock,
  AlertTriangle,
  Brain,
  History,
} from 'lucide-react';
import type { Checkpoint } from '@/types/checkpoint';
import type { AIAnalysis } from '@/types/drone';
import type { Deficiency } from '@/types/deficiency';
import {
  BMP_CATEGORY_LABELS,
  BMP_CATEGORY_COLORS,
  STATUS_COLORS,
} from '@/lib/constants';
import { checkpoints as staticCheckpoints } from '@/data/checkpoints';
import { aiAnalyses as staticAnalyses } from '@/data/ai-analyses';
import { deficiencies as staticDeficiencies } from '@/data/deficiencies';
import { formatDateTime, formatCoordinate } from '@/lib/format';
import { StatusBadge } from '@/components/shared/status-badge';
import { AIAnalysisPanel } from '@/components/checkpoints/ai-analysis-panel';
import { DeficiencyPanel } from '@/components/checkpoints/deficiency-panel';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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

  useEffect(() => {
    function fallbackToStatic() {
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
        // Fall back to static demo data when the API is unavailable (demo mode).
        fallbackToStatic();
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
          {/* Drone image placeholder */}
          <div className="relative aspect-video rounded-lg bg-background/50 border border-border flex items-center justify-center overflow-hidden">
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <Camera className="h-10 w-10 opacity-40" />
              <span className="text-xs uppercase tracking-wider opacity-60">
                Drone Image
              </span>
            </div>
          </div>

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
