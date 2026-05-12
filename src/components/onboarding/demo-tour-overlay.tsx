'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, X, Sparkles } from 'lucide-react';
import { useDemoTourStore } from '@/stores/demo-tour-store';
import { useAppMode } from '@/hooks/use-app-mode';
import { demoTourSteps } from './demo-tour-steps';
import { cn } from '@/lib/utils';

const accentToBg: Record<string, string> = {
  'text-amber-500': 'bg-amber-500/10 border-amber-500/30',
  'text-amber-400': 'bg-amber-400/10 border-amber-400/30',
  'text-violet-500': 'bg-violet-500/10 border-violet-500/30',
  'text-blue-400': 'bg-blue-400/10 border-blue-400/30',
  'text-green-500': 'bg-green-500/10 border-green-500/30',
  'text-cyan-400': 'bg-cyan-400/10 border-cyan-400/30',
  'text-orange-500': 'bg-orange-500/10 border-orange-500/30',
  'text-red-400': 'bg-red-400/10 border-red-400/30',
};

const accentToDot: Record<string, string> = {
  'text-amber-500': 'bg-amber-500',
  'text-amber-400': 'bg-amber-400',
  'text-violet-500': 'bg-violet-500',
  'text-blue-400': 'bg-blue-400',
  'text-green-500': 'bg-green-500',
  'text-cyan-400': 'bg-cyan-400',
  'text-orange-500': 'bg-orange-500',
  'text-red-400': 'bg-red-400',
};

/**
 * DemoTourOverlay — non-blocking bottom-right card that walks a VC through
 * the 7 most impressive features of the app. Reads `useDemoTourStore` for
 * state; navigates with `router.push()` on each Next.
 *
 * Mounted in `view-mode-wrapper.tsx`, gated by `active`.
 */
export function DemoTourOverlay() {
  const { active, currentStep, next, prev, setStep, endTour } = useDemoTourStore();
  const router = useRouter();
  const pathname = usePathname();
  const { isApp } = useAppMode();

  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const lastNavStep = useRef<number | null>(null);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard SSR-mount idiom
  useEffect(() => setMounted(true), []);

  // When the step index changes, navigate to that step's route.
  useEffect(() => {
    if (!active || !mounted) return;
    const step = demoTourSteps[currentStep];
    if (!step) return;
    if (lastNavStep.current === currentStep) return;
    lastNavStep.current = currentStep;
    if (pathname !== step.targetRoute) {
      router.push(step.targetRoute);
    }
  }, [active, mounted, currentStep, pathname, router]);

  if (!mounted || !active) return null;

  const step = demoTourSteps[currentStep];
  if (!step) return null;

  const isFirst = currentStep === 0;
  const isLast = currentStep === demoTourSteps.length - 1;
  const Icon = step.icon;

  const handleNext = () => {
    if (isLast) {
      endTour();
    } else {
      next();
    }
  };

  return (
    <div
      className={cn(
        'pointer-events-none fixed z-[60] flex justify-end px-4',
        // Bottom-right placement, with extra clearance above the mobile bottom nav.
        isApp ? 'bottom-20 left-0 right-0' : 'bottom-4 left-auto right-0'
      )}
    >
      <AnimatePresence mode="wait">
        {collapsed ? (
          <motion.button
            key="collapsed"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            onClick={() => setCollapsed(false)}
            className="pointer-events-auto flex items-center gap-2 rounded-full border border-amber-500/40 bg-[#0A0A0A]/95 px-4 py-2 text-xs font-medium text-amber-400 shadow-xl backdrop-blur-md transition-colors hover:bg-amber-500/10"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Resume tour ({currentStep + 1}/{demoTourSteps.length})
          </motion.button>
        ) : (
          <motion.div
            key="card"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            role="dialog"
            aria-label="SiteCheck demo tour"
            className={cn(
              'pointer-events-auto w-full max-w-[420px] rounded-xl border border-border bg-[#0A0A0A]/95 shadow-2xl backdrop-blur-md',
              'flex flex-col overflow-hidden'
            )}
          >
            {/* Header */}
            <div className="flex items-start gap-3 border-b border-border px-5 py-4">
              <div
                className={cn(
                  'shrink-0 rounded-lg border p-2',
                  accentToBg[step.accentColor] ?? accentToBg['text-amber-500']
                )}
              >
                <Icon className={cn('h-5 w-5', step.accentColor)} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-amber-400">
                    Demo · Step {currentStep + 1} of {demoTourSteps.length}
                  </span>
                </div>
                <h3 className="mt-1 font-heading text-base font-semibold tracking-wide text-foreground">
                  {step.title}
                </h3>
              </div>
              <button
                onClick={() => setCollapsed(true)}
                aria-label="Collapse tour panel"
                className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Body */}
            <AnimatePresence mode="wait">
              <motion.div
                key={step.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
                className="px-5 py-4"
              >
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
                {step.highlights.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {step.highlights.map((h, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2.5 text-xs text-muted-foreground"
                      >
                        <div
                          className={cn(
                            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                            accentToDot[step.accentColor] ?? 'bg-amber-500'
                          )}
                        />
                        <span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Progress dots */}
            <div className="flex items-center justify-center gap-1.5 px-5 pb-3">
              {demoTourSteps.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  aria-label={`Go to step ${i + 1}`}
                  className={cn(
                    'h-1.5 rounded-full transition-all duration-300',
                    i === currentStep
                      ? 'w-5 bg-amber-500'
                      : i < currentStep
                        ? 'w-1.5 bg-amber-500/40'
                        : 'w-1.5 bg-border'
                  )}
                />
              ))}
            </div>

            {/* Footer / nav */}
            <div className="flex items-center justify-between border-t border-border bg-surface/40 px-4 py-3">
              <button
                onClick={endTour}
                className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip tour
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={prev}
                  disabled={isFirst}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground',
                    isFirst && 'invisible'
                  )}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Back
                </button>
                <button
                  onClick={handleNext}
                  className="flex items-center gap-1 rounded-md bg-amber-500 px-4 py-1.5 text-xs font-semibold text-black transition-colors hover:bg-amber-400"
                >
                  {isLast ? 'Finish' : 'Next'}
                  {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
