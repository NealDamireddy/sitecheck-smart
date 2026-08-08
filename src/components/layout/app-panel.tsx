'use client';

import { ReactNode } from 'react';

interface AppPanelProps {
  children: ReactNode;
}

export function AppPanel({ children }: AppPanelProps) {
  return (
    <div className="flex min-h-screen items-start justify-center bg-secondary/70 px-4 pb-4 pt-16">
      {/* App window container */}
      <div
        className="relative w-[420px] overflow-hidden rounded-2xl border border-border bg-background shadow-[0_24px_70px_rgba(22,44,48,0.14)]"
        style={{ height: 'min(85vh, 820px)' }}
      >
        <div className="flex h-full flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
