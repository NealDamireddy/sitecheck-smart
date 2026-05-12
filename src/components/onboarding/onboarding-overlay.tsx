'use client';

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Monitor, Smartphone, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useViewModeStore } from '@/stores/view-mode-store';
import { useDemoTourStore } from '@/stores/demo-tour-store';
import { isDemoSession } from '@/lib/demo/start-demo';
import { onboardingSteps, ONBOARDING_VERSION } from './onboarding-steps';
import { cn } from '@/lib/utils';

const accentToBg: Record<string, string> = {
  'text-amber-500': 'bg-amber-500/10',
  'text-amber-400': 'bg-amber-400/10',
  'text-violet-500': 'bg-violet-500/10',
  'text-blue-400': 'bg-blue-400/10',
  'text-green-500': 'bg-green-500/10',
  'text-cyan-400': 'bg-cyan-400/10',
  'text-orange-500': 'bg-orange-500/10',
};

const accentToDot: Record<string, string> = {
  'text-amber-500': 'bg-amber-500',
  'text-amber-400': 'bg-amber-400',
  'text-violet-500': 'bg-violet-500',
  'text-blue-400': 'bg-blue-400',
  'text-green-500': 'bg-green-500',
  'text-cyan-400': 'bg-cyan-400',
  'text-orange-500': 'bg-orange-500',
};

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 80 : -80,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -80 : 80,
    opacity: 0,
  }),
};

export function OnboardingOverlay() {
  const {
    hasCompleted,
    completedVersion,
    currentStep,
    nextStep,
    prevStep,
    setStep,
    completeOnboarding,
  } = useOnboardingStore();
  const { viewMode, setViewMode } = useViewModeStore();
  const demoTourActive = useDemoTourStore((s) => s.active);

  const [mounted, setMounted] = useState(false);
  const directionRef = useRef(1);
  const prevStepRef = useRef(currentStep);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    directionRef.current = currentStep > prevStepRef.current ? 1 : -1;
    prevStepRef.current = currentStep;
  }, [currentStep]);

  if (!mounted) return null;
  // Defense-in-depth: never show the standard onboarding to a demo user,
  // even if ViewModeWrapper somehow mounts us. Checks both the demo cookie
  // (synchronous read of document.cookie post-hydration) and the in-memory
  // demo-tour flag.
  if (demoTourActive || isDemoSession()) return null;
  if (hasCompleted && completedVersion >= ONBOARDING_VERSION) return null;

  const step = onboardingSteps[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === onboardingSteps.length - 1;
  const Icon = step.icon;

  const handleNext = () => {
    if (isLastStep) {
      completeOnboarding();
    } else {
      directionRef.current = 1;
      nextStep();
    }
  };

  const handlePrev = () => {
    directionRef.current = -1;
    prevStep();
  };

  const handleSkip = () => {
    completeOnboarding();
  };

  const handleDotClick = (i: number) => {
    directionRef.current = i > currentStep ? 1 : -1;
    setStep(i);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0A0A0A]"
      role="dialog"
      aria-modal="true"
      aria-label="SiteCheck Onboarding"
    >
      {/* Subtle radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(245,158,11,0.05)_0%,_transparent_70%)]" />

      {/* Skip button — positioned in overlay, outside content container */}
      {!isLastStep && (
        <button
          onClick={handleSkip}
          className="absolute top-6 right-6 z-20 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Skip
          <X className="h-3.5 w-3.5" />
        </button>
      )}

      <div className="relative z-10 flex w-full max-w-2xl flex-col gap-8 px-6">

        {/* Step content */}
        <AnimatePresence mode="wait" custom={directionRef.current}>
          <motion.div
            key={step.id}
            custom={directionRef.current}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="flex flex-col items-center text-center"
          >
            {/* Icon */}
            <div
              className={cn(
                'mb-6 rounded-2xl border border-border p-5',
                accentToBg[step.accentColor] ?? 'bg-amber-500/10'
              )}
            >
              <Icon className={cn('h-10 w-10', step.accentColor)} />
            </div>

            {/* Title */}
            <h2 className="font-heading text-3xl font-bold tracking-wide text-foreground">
              {step.title}
            </h2>

            {/* Description */}
            <p className="mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
              {step.description}
            </p>

            {/* Interactive: View Mode Selector */}
            {step.interactive === 'view-mode-selector' && (
              <div className="mx-auto mt-8 flex items-center gap-2 rounded-full border border-border bg-surface p-1.5">
                <button
                  onClick={() => setViewMode('website')}
                  className={cn(
                    'relative flex items-center gap-3 rounded-full px-6 py-3 text-sm font-medium transition-colors',
                    viewMode === 'website'
                      ? 'text-black'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {viewMode === 'website' && (
                    <motion.div
                      layoutId="onboarding-viewmode-pill"
                      className="absolute inset-0 rounded-full bg-amber-500"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                  <Monitor className="relative z-10 h-5 w-5" />
                  <div className="relative z-10 text-left">
                    <div className="font-medium">Website</div>
                    <div
                      className={cn(
                        'text-xs',
                        viewMode === 'website' ? 'text-black/70' : 'text-muted-foreground'
                      )}
                    >
                      Desktop sidebar
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setViewMode('app')}
                  className={cn(
                    'relative flex items-center gap-3 rounded-full px-6 py-3 text-sm font-medium transition-colors',
                    viewMode === 'app'
                      ? 'text-black'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {viewMode === 'app' && (
                    <motion.div
                      layoutId="onboarding-viewmode-pill"
                      className="absolute inset-0 rounded-full bg-amber-500"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
                    />
                  )}
                  <Smartphone className="relative z-10 h-5 w-5" />
                  <div className="relative z-10 text-left">
                    <div className="font-medium">App</div>
                    <div
                      className={cn(
                        'text-xs',
                        viewMode === 'app' ? 'text-black/70' : 'text-muted-foreground'
                      )}
                    >
                      Mobile panel
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* Highlights */}
            {step.highlights.length > 0 && !step.interactive && (
              <ul className="mt-6 space-y-2.5 text-left">
                {step.highlights.map((h, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm text-muted-foreground"
                  >
                    <div
                      className={cn(
                        'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                        accentToDot[step.accentColor] ?? 'bg-amber-500'
                      )}
                    />
                    {h}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2">
          {onboardingSteps.map((_, i) => (
            <button
              key={i}
              onClick={() => handleDotClick(i)}
              aria-label={`Go to step ${i + 1}`}
              className={cn(
                'h-2 rounded-full transition-all duration-300',
                i === currentStep
                  ? 'w-6 bg-amber-500'
                  : i < currentStep
                    ? 'w-2 bg-amber-500/40'
                    : 'w-2 bg-border'
              )}
            />
          ))}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={isFirstStep}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
              isFirstStep && 'invisible'
            )}
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-6 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
          >
            {isLastStep ? 'Enter Dashboard' : 'Next'}
            {!isLastStep && <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
