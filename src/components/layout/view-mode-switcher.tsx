'use client';

import { Monitor, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useViewModeStore } from '@/stores/view-mode-store';
import { motion } from 'framer-motion';

export function ViewModeSwitcher() {
  const { viewMode, setViewMode } = useViewModeStore();

  return (
    <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2">
      <div className="flex items-center gap-1 rounded-full border border-border bg-[#0A0A0A]/95 p-1 shadow-lg backdrop-blur-md">
        <button
          onClick={() => setViewMode('website')}
          className={cn(
            'relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
            viewMode === 'website'
              ? 'text-black'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {viewMode === 'website' && (
            <motion.div
              layoutId="viewmode-pill"
              className="absolute inset-0 rounded-full bg-amber-500"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            />
          )}
          <Monitor className="relative z-10 h-4 w-4" />
          <span className="relative z-10">Website</span>
        </button>
        <button
          onClick={() => setViewMode('app')}
          className={cn(
            'relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors',
            viewMode === 'app'
              ? 'text-black'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {viewMode === 'app' && (
            <motion.div
              layoutId="viewmode-pill"
              className="absolute inset-0 rounded-full bg-amber-500"
              transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }}
            />
          )}
          <Smartphone className="relative z-10 h-4 w-4" />
          <span className="relative z-10">App</span>
        </button>
      </div>
    </div>
  );
}
