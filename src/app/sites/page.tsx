'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FilePlus2, Plus, Building2, Pipette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SectionHeader } from '@/components/shared/section-header';
import { PageTransition } from '@/components/shared/page-transition';
import { useProjectStore } from '@/stores/project-store';

export default function SitesPage() {
  const router = useRouter();
  const projects = useProjectStore((s) => s.projects);
  const currentProjectId = useProjectStore((s) => s.currentProjectId);
  const setCurrentProject = useProjectStore((s) => s.setCurrentProject);
  const fetchProjects = useProjectStore((s) => s.fetchProjects);
  const loading = useProjectStore((s) => s.loading);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const openSite = (id: string) => {
    setCurrentProject(id);
    router.push('/dashboard');
  };

  return (
    <PageTransition>
      <div className="flex h-full flex-col gap-4 p-4">
        <SectionHeader
          title="Projects"
          description="All construction projects under your organization. Open one to land on its dashboard."
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link href="/swppp">
                <Button variant="outline" size="sm">
                  <FilePlus2 className="h-3.5 w-3.5" />
                  Upload SWPPP
                </Button>
              </Link>
              <Link href="/projects/new">
                <Button size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  New Site
                </Button>
              </Link>
            </div>
          }
        />

        {loading && projects.length === 0 ? (
          <div className="flex items-center justify-center p-12 text-sm text-muted-foreground">
            Loading sites…
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-elevated/50 p-8 text-center">
            <Pipette className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">No sites yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload a SWPPP to auto-fill site details, or create one manually.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => {
              const isCurrent = p.id === currentProjectId;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => openSite(p.id)}
                    className={`group flex w-full flex-col gap-2 rounded-lg border bg-surface p-4 text-left transition-colors ${
                      isCurrent
                        ? 'border-amber-500/50 ring-1 ring-amber-500/30'
                        : 'border-border hover:border-amber-500/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-amber-400" />
                        <span className="text-sm font-semibold leading-tight">
                          {p.name}
                        </span>
                      </div>
                      {isCurrent && (
                        <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.address || '—'}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      {p.wdid && <span className="font-mono">WDID {p.wdid}</span>}
                      <span>RL-{p.riskLevel}</span>
                      <span>{p.projectType === 'linear' ? 'Linear' : 'Bounded'}</span>
                      {p.acreage > 0 && <span>{p.acreage} ac</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageTransition>
  );
}
