'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  Home,
  FileText,
  Plane,
  CheckCircle,
  ClipboardCheck,
  FileBarChart,
  CloudRain,
  RotateCcw,
  Waypoints,
  ShieldAlert,
} from 'lucide-react';
import { useOnboardingStore } from '@/stores/onboarding-store';
import { useProjectStore } from '@/stores/project-store';

const baseNavItems = [
  { href: '/dashboard', icon: Home, label: 'Dashboard' },
  { href: '/swppp', icon: FileText, label: 'SWPPP Intelligence' },
  { href: '/missions', icon: Plane, label: 'Drone Missions' },
  { href: '/checkpoints', icon: CheckCircle, label: 'Checkpoints' },
  { href: '/inspections', icon: ClipboardCheck, label: 'Inspections' },
  { href: '/reports', icon: FileBarChart, label: 'Reports' },
  { href: '/weather', icon: CloudRain, label: 'Weather' },
];

export function Sidebar() {
  const pathname = usePathname();
  const project = useProjectStore((s) => s.currentProject());
  const navItems =
    project?.projectType === 'linear'
      ? [
          ...baseNavItems.slice(0, 4),
          { href: '/crossings', icon: Waypoints, label: 'Crossings' },
          { href: '/nofly-zones', icon: ShieldAlert, label: 'No-Fly Zones' },
          ...baseNavItems.slice(4), // Inspections, Reports, Weather
        ]
      : baseNavItems;

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

      {/* Version info + Restart Tour */}
      <div className="border-t border-border p-3">
        <div className="flex flex-col items-center gap-2 opacity-0 transition-opacity duration-300 group-hover/sidebar:opacity-100">
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
