'use client';

import { ReactNode } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { AppPanel } from '@/components/layout/app-panel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useViewModeStore } from '@/stores/view-mode-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useDemoTourStore } from '@/stores/demo-tour-store';
import { useDemoSession } from '@/hooks/use-demo-session';
import { OnboardingOverlay } from '@/components/onboarding/onboarding-overlay';
import { DemoTourOverlay } from '@/components/onboarding/demo-tour-overlay';
import { ONBOARDING_VERSION } from '@/components/onboarding/onboarding-steps';
import { AnimatePresence, motion } from 'framer-motion';

interface ViewModeWrapperProps {
  children: ReactNode;
}

export function ViewModeWrapper({ children }: ViewModeWrapperProps) {
  const { viewMode } = useViewModeStore();
  const { hasCompleted, completedVersion } = useOnboardingStore();
  const demoTourActive = useDemoTourStore((s) => s.active);
  const { inDemo } = useDemoSession();

  // Suppress the standard 14-step onboarding overlay entirely when a demo
  // session is active — VCs get the demo tour instead, and we never want
  // the welcome screen to flash on the way to /dashboard.
  const onboardingActive =
    !inDemo && (!hasCompleted || completedVersion < ONBOARDING_VERSION);

  return (
    <TooltipProvider>
      {/* Onboarding overlay — shown until user completes or skips */}
      {onboardingActive && <OnboardingOverlay />}

      {/* Demo tour panel — shown only when a demo session was started */}
      {demoTourActive && <DemoTourOverlay />}

      <AnimatePresence mode="wait">
        {viewMode === 'website' ? (
          <motion.div
            key="website"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="flex min-h-screen"
          >
            <Sidebar />
            <div className="flex flex-1 flex-col sm:pl-16">
              <TopBar />
              <main className="flex-1 overflow-auto">{children}</main>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="app"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <AppPanel>
              <TopBar />
              <main className="flex-1 overflow-y-auto overflow-x-hidden">{children}</main>
              <MobileBottomNav />
            </AppPanel>
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipProvider>
  );
}

// Mobile bottom navigation bar for app mode
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  FileText,
  Plane,
  CheckCircle,
  FileBarChart,
  CloudRain,
} from 'lucide-react';

const mobileNavItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/swppp', icon: FileText, label: 'SWPPP' },
  { href: '/missions', icon: Plane, label: 'Drone' },
  { href: '/checkpoints', icon: CheckCircle, label: 'BMPs' },
  { href: '/reports', icon: FileBarChart, label: 'Reports' },
  { href: '/weather', icon: CloudRain, label: 'Weather' },
];

function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-30 flex items-center justify-around border-t border-border bg-[#0A0A0A]/95 px-1 py-2 backdrop-blur-md">
      {mobileNavItems.map((item) => {
        const isActive =
          pathname === item.href || pathname?.startsWith(item.href + '/');
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center gap-0.5 rounded-md px-2 py-1 text-[10px] transition-colors',
              isActive
                ? 'text-amber-500'
                : 'text-muted-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5', isActive ? 'text-amber-500' : '')} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
