'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  FileText,
  Plane,
  CheckCircle,
  ClipboardCheck,
  FileBarChart,
  CloudRain,
  Droplets,
  RotateCcw,
  Waypoints,
  ShieldAlert,
  Building2,
  LogOut,
} from 'lucide-react';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useProjectStore } from '@/stores/project-store';
import { createClient } from '@/lib/supabase/client';

const baseNavItems = [
  { href: '/dashboard', icon: Home, label: 'Dashboard' },
  { href: '/sites', icon: Building2, label: 'Sites' },
  { href: '/swppp', icon: FileText, label: 'SWPPP Intelligence' },
  { href: '/missions', icon: Plane, label: 'Drone Missions' },
  { href: '/checkpoints', icon: CheckCircle, label: 'Checkpoints' },
  { href: '/inspections', icon: ClipboardCheck, label: 'Inspections' },
  // SMARTS entry is inserted here at render time — its href is
  // project-scoped (depends on useProjectStore.currentProjectId) so it
  // can't live in this static array.
  { href: '/reports', icon: FileBarChart, label: 'Reports' },
  { href: '/weather', icon: CloudRain, label: 'Weather' },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const project = useProjectStore((s) => s.currentProject());
  const currentProjectId = useProjectStore((s) => s.currentProjectId);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Clear the persisted project pointer so the next user doesn't land
    // on whatever site this one had selected.
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('sitecheck-current-project');
      } catch {
        // ignore
      }
    }
    router.push('/login');
    router.refresh();
  };

  // currentProjectId is read from localStorage on first client render but
  // is empty on the server. Defer adding the project-scoped SMARTS link
  // until after mount so SSR and hydration agree on the link count and
  // href. (Without this guard, server emits href="/projects//events" and
  // the client hydrates with the real id — a React hydration mismatch.)
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Project-scoped SMARTS entry inserted between Inspections and Reports.
  // baseNavItems order after the Sites insert:
  //   0 Dashboard, 1 Sites, 2 SWPPP, 3 Missions, 4 Checkpoints,
  //   5 Inspections, 6 Reports, 7 Weather
  const itemsWithSmarts =
    mounted && currentProjectId
      ? [
          ...baseNavItems.slice(0, 6),
          {
            href: `/projects/${currentProjectId}/events`,
            icon: Droplets,
            label: 'SMARTS',
          },
          ...baseNavItems.slice(6),
        ]
      : baseNavItems;

  // For linear projects, splice Crossings + No-Fly Zones in after Missions
  // (idx 3 in baseNavItems) and before Checkpoints/Inspections.
  const navItems =
    project?.projectType === 'linear'
      ? [
          ...itemsWithSmarts.slice(0, 4),
          { href: '/crossings', icon: Waypoints, label: 'Crossings' },
          { href: '/nofly-zones', icon: ShieldAlert, label: 'No-Fly Zones' },
          ...itemsWithSmarts.slice(4),
        ]
      : itemsWithSmarts;

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-16 flex-col border-r border-border bg-[#0A0A0A] transition-all duration-300 hover:w-56 sm:flex group/sidebar">
      {/* Logo area */}
      <div className="flex h-14 items-center border-b border-border px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-amber-500 font-heading text-sm font-bold text-black">
            SC
          </div>
          <span className="whitespace-nowrap font-heading text-sm font-semibold tracking-wider text-amber-500 opacity-0 transition-opacity duration-300 group-hover/sidebar:opacity-100">
            SITECHECK
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex flex-1 flex-col gap-1 p-2">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname?.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex h-10 items-center gap-3 rounded-md px-3 text-sm transition-all duration-200',
                isActive
                  ? 'bg-amber-500/10 text-amber-500'
                  : 'text-muted-foreground hover:bg-surface-elevated hover:text-foreground'
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5 shrink-0',
                  isActive ? 'text-amber-500' : ''
                )}
              />
              <span className="whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover/sidebar:opacity-100">
                {item.label}
              </span>
              {isActive && (
                <div className="absolute left-0 h-6 w-0.5 rounded-r bg-amber-500" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer: logout + Restart Tour + version */}
      <div className="border-t border-border p-2">
        {/* Logout — visible by default (icon), label appears on hover */}
        <button
          onClick={handleLogout}
          className="mb-1 flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          aria-label="Log out"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="whitespace-nowrap opacity-0 transition-opacity duration-300 group-hover/sidebar:opacity-100">
            Log out
          </span>
        </button>

        <div className="flex flex-col items-center gap-2 px-1 opacity-0 transition-opacity duration-300 group-hover/sidebar:opacity-100">
          <button
            onClick={() => useOnboardingStore.getState().resetOnboarding()}
            className="flex items-center gap-1.5 text-[10px] text-muted-foreground transition-colors hover:text-amber-500"
          >
            <RotateCcw className="h-3 w-3" />
            Restart Tour
          </button>
          <p className="text-center text-[10px] text-muted-foreground">
            v0.1.0 — Demo
          </p>
        </div>
      </div>
    </aside>
  );
}
