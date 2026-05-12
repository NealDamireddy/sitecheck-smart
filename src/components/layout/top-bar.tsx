'use client';

import { Bell, Cloud, Droplets, Wind, ThermometerSun, ChevronDown, MapPin, GitBranch, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { useAppMode } from '@/hooks/use-app-mode';
import { useDemoSession } from '@/hooks/use-demo-session';
import { useProjectStore } from '@/stores/project-store';
import { useCheckpointStore } from '@/stores/checkpoint-store';
import { useDroneStore } from '@/stores/drone-store';
import { useDemoTourStore } from '@/stores/demo-tour-store';
import { exitDemoSession } from '@/lib/demo/start-demo';
import { cn } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';

export function TopBar() {
  const router = useRouter();
  const { isApp } = useAppMode();
  const { inDemo } = useDemoSession();
  const exitDemoTour = useDemoTourStore((s) => s.exit);
  const { projects, currentProjectId, setCurrentProject, currentProject: getCurrentProject } = useProjectStore();
  const fetchCheckpoints = useCheckpointStore((s) => s.fetchCheckpoints);
  const fetchMissions = useDroneStore((s) => s.fetchMissions);
  const project = getCurrentProject();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  function handleExitDemo() {
    exitDemoSession();
    exitDemoTour();
    router.push('/login');
    router.refresh();
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleSwitch = (id: string) => {
    if (id === currentProjectId) {
      setOpen(false);
      return;
    }
    setCurrentProject(id);
    setOpen(false);
    // Re-fetch project-scoped data
    fetchCheckpoints();
    fetchMissions();
  };

  return (
    <header className={cn(
      'sticky top-0 z-30 flex items-center justify-between border-b border-border bg-[#0A0A0A]/80 backdrop-blur-sm',
      isApp ? 'h-11 px-3' : 'h-14 px-3 sm:px-6'
    )}>
      {/* Project Switcher */}
      <div className="flex min-w-0 items-center gap-2" ref={dropdownRef}>
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border border-border bg-surface transition-colors hover:bg-surface-elevated hover:border-amber-500/40',
              isApp ? 'px-2 py-1' : 'px-3 py-1.5'
            )}
          >
            {project?.projectType === 'linear' ? (
              <GitBranch className={cn('shrink-0 text-cyan-400', isApp ? 'h-3 w-3' : 'h-4 w-4')} />
            ) : (
              <MapPin className={cn('shrink-0 text-amber-400', isApp ? 'h-3 w-3' : 'h-4 w-4')} />
            )}
            <h1 className={cn(
              'truncate font-heading font-semibold tracking-wide text-foreground',
              isApp ? 'text-xs' : 'text-sm sm:text-lg'
            )}>
              {project?.name || 'Select Project'}
            </h1>
            <ChevronDown className={cn(
              'shrink-0 text-foreground/60 transition-transform',
              isApp ? 'h-3 w-3' : 'h-4 w-4',
              open && 'rotate-180'
            )} />
          </button>

          {open && (
            <div className="absolute left-0 top-full mt-1 z-50 min-w-[280px] rounded-lg border border-border bg-[#0A0A0A] shadow-xl">
              <div className="px-3 py-2 border-b border-border">
                <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Projects</p>
              </div>
              {projects.map((p) => (
                <button
                  key={p.id}
                  onClick={() => handleSwitch(p.id)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-elevated',
                    p.id === currentProjectId && 'bg-surface-elevated'
                  )}
                >
                  {p.projectType === 'linear' ? (
                    <GitBranch className="h-4 w-4 shrink-0 text-cyan-400" />
                  ) : (
                    <MapPin className="h-4 w-4 shrink-0 text-amber-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                    <p className="truncate text-[10px] text-muted-foreground">{p.address}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn(
                      'shrink-0 text-[9px]',
                      p.projectType === 'linear'
                        ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                    )}
                  >
                    {p.projectType === 'linear' ? 'LINEAR' : 'SITE'}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
        {!isApp && (
          <Badge
            variant="outline"
            className={cn(
              'hidden shrink-0 text-xs lg:inline-flex',
              project?.status === 'active'
                ? 'border-amber-500/30 bg-amber-500/10 text-amber-500'
                : 'border-muted-foreground/30 bg-muted-foreground/10 text-muted-foreground'
            )}
          >
            {project?.status === 'active' ? 'ACTIVE' : 'INACTIVE'}
          </Badge>
        )}
      </div>

      {/* Right side: Weather + Notifications */}
      <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">
        {/* Demo session indicator + Exit button — prominent so VCs always
            know they're in a sandbox and how to leave. The "Demo Mode"
            label hides on narrow viewports to keep the header from
            wrapping; the dot + Exit Demo button stay visible. */}
        {inDemo && (
          <div
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md border-2 border-amber-500/60 bg-amber-500/10',
              isApp ? 'px-1.5 py-1' : 'px-2 py-1 sm:gap-2 sm:px-2.5'
            )}
          >
            <span
              className={cn(
                'flex items-center gap-1 font-bold uppercase tracking-wider text-amber-400',
                isApp ? 'text-[9px]' : 'text-[10px]'
              )}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
              </span>
              <span className="hidden sm:inline">Demo Mode</span>
            </span>
            <span className="hidden h-3 w-px bg-amber-500/40 sm:inline-block" />
            <button
              onClick={handleExitDemo}
              className={cn(
                'flex items-center gap-1 rounded-sm font-semibold text-amber-300 transition-colors hover:text-amber-100',
                isApp ? 'text-[10px]' : 'text-xs'
              )}
              aria-label="Exit demo"
            >
              <LogOut className={cn(isApp ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
              Exit Demo
            </button>
          </div>
        )}

        {/* Weather Widget — hidden in app mode and on small screens */}
        {!isApp && (
          <div className="hidden items-center gap-4 rounded-md border border-border bg-surface px-3 py-1.5 text-xs md:flex">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Cloud className="h-3.5 w-3.5" />
              <span>Partly Cloudy</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <ThermometerSun className="h-3.5 w-3.5" />
              <span>72°F</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Wind className="h-3.5 w-3.5" />
              <span>8 mph</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Droplets className="h-3.5 w-3.5" />
              <span>45%</span>
            </div>
          </div>
        )}

        {/* Notification Bell */}
        <button className={cn(
          'relative flex items-center justify-center rounded-md border border-border bg-surface transition-colors hover:bg-surface-elevated',
          isApp ? 'h-7 w-7' : 'h-9 w-9'
        )}>
          <Bell className={cn(isApp ? 'h-3.5 w-3.5' : 'h-4 w-4', 'text-muted-foreground')} />
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-black">
            3
          </span>
        </button>
      </div>
    </header>
  );
}
