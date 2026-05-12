'use client';

import { useState } from 'react';
import { CheckCircle, Lightbulb, BookOpen, Sparkles, Loader2, RotateCcw, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { AIAnalysis } from '@/types/drone';
import { Checkpoint } from '@/types/checkpoint';
import { BMP_CATEGORY_LABELS } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface AIAnalysisPanelProps {
  analysis: AIAnalysis;
  checkpoint?: Checkpoint;
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 90) return 'text-green-500';
  if (confidence >= 75) return 'text-amber-500';
  return 'text-red-500';
}

function getConfidenceIndicatorClass(confidence: number): string {
  if (confidence >= 90) return '[&_[data-slot=progress-indicator]]:bg-green-500';
  if (confidence >= 75) return '[&_[data-slot=progress-indicator]]:bg-amber-500';
  return '[&_[data-slot=progress-indicator]]:bg-red-500';
}

export function AIAnalysisPanel({ analysis, checkpoint }: AIAnalysisPanelProps) {
  const [liveAnalysis, setLiveAnalysis] = useState<AIAnalysis | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzedAt, setAnalyzedAt] = useState<Date | null>(null);

  const displayAnalysis = liveAnalysis ?? analysis;
  const isLive = liveAnalysis !== null;

  async function handleReanalyze() {
    if (!checkpoint) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checkpointId: checkpoint.id,
          checkpointName: checkpoint.name,
          bmpCategory: BMP_CATEGORY_LABELS[checkpoint.bmpType],
          status: checkpoint.status,
          description: checkpoint.description,
          cgpSection: checkpoint.cgpSection,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis request failed');
      }

      const result: AIAnalysis = await response.json();
      setLiveAnalysis(result);
      setAnalyzedAt(new Date());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Analysis failed';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setLiveAnalysis(null);
    setError(null);
    setAnalyzedAt(null);
  }

  return (
    <div className="space-y-6">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isLive && analyzedAt && (
            <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-400">
              <Sparkles className="h-3 w-3" />
              Live AI Analysis
              <span className="text-violet-400/60">
                {analyzedAt.toLocaleTimeString()}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isLive && (
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to cached
            </Button>
          )}
          {checkpoint && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleReanalyze}
              disabled={isLoading}
            >
              {isLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {isLoading ? 'Analyzing...' : 'Re-analyze with AI'}
            </Button>
          )}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-red-500 mb-1">
                Analysis Error
              </h4>
              <p className="text-sm text-red-400/80 leading-relaxed">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-6 animate-pulse">
          <div>
            <div className="h-3 w-20 rounded bg-muted mb-3" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-3/4 rounded bg-muted" />
            </div>
          </div>
          <div>
            <div className="h-3 w-28 rounded bg-muted mb-3" />
            <div className="h-2 w-full rounded bg-muted" />
          </div>
          <div>
            <div className="h-3 w-24 rounded bg-muted mb-3" />
            <div className="space-y-2">
              <div className="h-4 w-full rounded bg-muted" />
              <div className="h-4 w-5/6 rounded bg-muted" />
              <div className="h-4 w-4/5 rounded bg-muted" />
            </div>
          </div>
        </div>
      )}

      {/* Analysis Content */}
      {!isLoading && (
        <>
          {/* Summary */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              AI Summary
            </h4>
            <p className="text-sm text-foreground/90 leading-relaxed">
              {displayAnalysis.summary}
            </p>
          </div>

          {/* Confidence Score */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Confidence Score
              </h4>
              <span
                className={cn(
                  'font-mono text-sm font-bold',
                  getConfidenceColor(displayAnalysis.confidence)
                )}
              >
                {displayAnalysis.confidence}%
              </span>
            </div>
            <Progress
              value={displayAnalysis.confidence}
              className={cn('w-full', getConfidenceIndicatorClass(displayAnalysis.confidence))}
            />
          </div>

          {/* Details */}
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Analysis Details
            </h4>
            <ul className="space-y-2">
              {displayAnalysis.details.map((detail, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                  <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500/70" />
                  <span>{detail}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CGP Reference */}
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
            <div className="flex items-start gap-2">
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <h4 className="text-xs font-medium uppercase tracking-wider text-amber-500 mb-1">
                  CGP Reference
                </h4>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {displayAnalysis.cgpReference}
                </p>
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {displayAnalysis.recommendations && displayAnalysis.recommendations.length > 0 && (
            <div>
              <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                Recommendations
              </h4>
              <ul className="space-y-2">
                {displayAnalysis.recommendations.map((rec, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/80">
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500/70" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
