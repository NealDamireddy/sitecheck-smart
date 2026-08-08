'use client';

import { ReactNode, useEffect } from 'react';
import { useMounted } from '@/hooks/use-mounted';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/top-bar';
import { AppPanel } from '@/components/layout/app-panel';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useViewModeStore } from '@/stores/view-mode-store';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useDemoTourStore } from '@/stores/demo-tour-store';
import { useDemoSession } from '@/hooks/use-demo-session';
import { useProjectStore } from '@/stores/project-store';
import { RainEventBanner } from '@/components/dashboard/rain-event-banner';
import { OnboardingOverlay } from '@/components/onboarding/onboarding-overlay';
import { DemoTourOverlay } from '@/components/onboarding/demo-tour-overlay';
import { ONBOARDING_VERSION } from '@/components/onboarding/onboarding-steps';
import { AnimatePresence, motion } from 'framer-motion';

interface ViewModeWrapperProps {
  children: ReactNode;
}

/** Auth pages render bare — no sidebar/top-bar/banners for logged-out users. */
const CHROMELESS_ROUTES = ['/login', '/signup'];

export function ViewModeWrapper({ children }: ViewModeWrapperProps) {
  const mounted = useMounted();
  const { viewMode } = useViewModeStore();
  const { hasCompleted, completedVersion } = useOnboardingStore();
  const demoTourActive = useDemoTourStore((s) => s.active);
  const { inDemo } = useDemoSession();
  const loaded = useProjectStore((s) => s.loaded);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const wrapperPathname = usePathname();

  // Bootstrap the (RLS-scoped) project list once per session. /api/projects
  // returns 401 for anonymous users; the store swallows that error so /login
  // and /signup still render cleanly.
  useEffect(() => {
    if (!loaded) fetchProjects();
  }, [loaded, fetchProjects]);

  // Suppress the standard 14-step onboarding overlay entirely when a demo
  // session is active — VCs get the demo tour instead, and we never want
  // the welcome screen to flash on the way to /dashboard.
  const onboardingActive =
    mounted &&
    !inDemo &&
    (!hasCompleted || completedVersion < ONBOARDING_VERSION);

  // Login/signup get no app chrome — a logged-out visitor shouldn't see a
  // project switcher, notification bell, or account link behind the form.
  if (wrapperPathname && CHROMELESS_ROUTES.some((r) => wrapperPathname.startsWith(r))) {
    return <>{children}</>;
  }

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
              {/* Sticky qualifying-rain reminder shown above every page. */}
              <RainEventBanner />
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
              <RainEventBanner />
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
  Building2,
  FileText,
  Plane,
  CheckCircle,
  Droplets,
  FileBarChart,
  CloudRain,
} from 'lucide-react';

// Static entries. SMARTS is project-scoped so it's spliced in at render
// time (see MobileBottomNav). Order mirrors the desktop sidebar.
const mobileNavItems = [
  { href: '/dashboard', icon: Home, label: 'Home' },
  { href: '/sites', icon: Building2, label: 'Sites' },
  { href: '/swppp', icon: FileText, label: 'SWPPP' },
  { href: '/missions', icon: Plane, label: 'Drone' },
  { href: '/checkpoints', icon: CheckCircle, label: 'BMPs' },
  { href: '/reports', icon: FileBarChart, label: 'Reports' },
  { href: '/weather', icon: CloudRain, label: 'Weather' },
];

function MobileBottomNav() {
  const pathname = usePathname();
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  // currentProjectId is empty on the server / first client paint (it's
  // read from localStorage). Defer the project-scoped SMARTS link until
  // after mount so SSR and hydration agree — same guard as the desktop
  // sidebar.
  const mounted = useMounted();

  // Splice SMARTS in after BMPs (idx 4), matching the desktop ordering
  // (Inspections sits between in the sidebar; mobile omits Inspections).
  const navItems =
    mounted && currentProjectId
      ? [
          ...mobileNavItems.slice(0, 5),
          {
            href: `/projects/${currentProjectId}/events`,
            icon: Droplets,
            label: 'SMARTS',
          },
          ...mobileNavItems.slice(5),
        ]
      : mobileNavItems;

  return (
    <nav className="sticky bottom-0 z-30 flex items-center justify-around border-t border-border bg-sidebar/95 px-1 py-2 backdrop-blur-md">
      {navItems.map((item) => {
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
                ? 'text-white'
                : 'text-sidebar-foreground'
            )}
          >
            <Icon className={cn('h-5 w-5', isActive ? 'text-sidebar-primary' : '')} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
