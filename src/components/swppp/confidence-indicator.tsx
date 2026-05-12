'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, FileSearch, Brain, Shield, BarChart3, Sparkles, Plane, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { ProcessingStep } from '@/stores/swppp-store';

const STEP_CONFIG: Record<string, { label: string; icon: typeof FileSearch; progress: number }> = {
  uploading: { label: 'Uploading SWPPP document...', icon: FileSearch, progress: 10 },
  extracting: { label: 'Extracting BMP locations with AI...', icon: Brain, progress: 35 },
  'cross-referencing': { label: 'Cross-referencing CGP requirements...', icon: Shield, progress: 70 },
  'generating-mission': { label: 'Generating drone flight path...', icon: Plane, progress: 85 },
  complete: { label: 'Analysis Complete', icon: CheckCircle, progress: 100 },
  error: { label: 'Analysis Error', icon: AlertCircle, progress: 0 },
};

interface ConfidenceIndicatorProps {
  processingStep: ProcessingStep;
  checkpointCount: number;
  error?: string | null;
}

export function ConfidenceIndicator({ processingStep, checkpointCount, error }: ConfidenceIndicatorProps) {
  const config = STEP_CONFIG[processingStep] || STEP_CONFIG.uploading;
  const isComplete = processingStep === 'complete';
  const isError = processingStep === 'error';
  const StepIcon = config.icon;

  const progress = useMemo(() => config.progress, [config.progress]);

  return (
    <Card className="border-0 bg-[#141414] ring-1 ring-white/5">
      <CardContent>
        <div className="space-y-4">
          {/* Progress bar */}
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                background: isComplete
                  ? 'linear-gradient(90deg, #22C55E, #16A34A)'
                  : isError
                    ? 'linear-gradient(90deg, #EF4444, #DC2626)'
                    : 'linear-gradient(90deg, #F59E0B, #D97706)',
              }}
              initial={{ width: '0%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
            {!isComplete && !isError && (
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-white/20"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
                style={{ filter: 'blur(4px)' }}
              />
            )}
          </div>

          {/* Status text */}
          <div className="flex items-center justify-between">
            <AnimatePresence mode="wait">
              {isComplete ? (
                <motion.div
                  key="complete"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-green-500">
                      Analysis Complete
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {checkpointCount} BMPs extracted from document
                    </p>
                  </div>
                </motion.div>
              ) : isError ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/10">
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-red-500">
                      Analysis Failed
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {error || 'An error occurred during analysis'}
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key={processingStep}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="flex items-center gap-3"
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10">
                    <motion.div
                      animate={{ rotate: [0, 360] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                    >
                      <StepIcon className="h-5 w-5 text-amber-500" />
                    </motion.div>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {config.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Processing SWPPP document
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <span className="text-sm tabular-nums text-muted-foreground">
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
