'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { startDemoSession } from '@/lib/demo/start-demo';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  function handleStartDemo() {
    setDemoLoading(true);
    // startDemoSession() does a hard navigation to /dashboard internally.
    // We don't need router.push — and using it would race with the cookie
    // not being visible to middleware on the prefetch.
    startDemoSession();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      router.push(redirect);
      router.refresh();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  if (demoLoading) {
    return <DemoLoadingScreen />;
  }

  return (
    <div className="w-full max-w-sm space-y-4">
      {/* Prominent Demo CTA — primary action for unauthenticated visitors */}
      <button
        type="button"
        onClick={handleStartDemo}
        disabled={demoLoading}
        className="group flex w-full items-center gap-4 rounded-xl border-2 border-amber-500/50 bg-gradient-to-r from-amber-500/15 to-amber-500/5 p-5 text-left transition-all hover:border-amber-500 hover:from-amber-500/25 hover:to-amber-500/10 hover:shadow-lg hover:shadow-amber-500/10 disabled:opacity-50"
      >
        <div className="shrink-0 rounded-lg border border-amber-500/40 bg-amber-500/15 p-3 transition-colors group-hover:bg-amber-500/25">
          <Sparkles className="h-6 w-6 text-amber-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-heading text-base font-bold tracking-wide text-amber-400">
              {demoLoading ? 'Starting demo...' : 'Try Live Demo'}
            </span>
            <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400">
              No signup
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            See the full app with sample data &amp; a guided tour →
          </p>
        </div>
      </button>

      {/* Sign-in card */}
      <div className="space-y-6 rounded-lg border border-border bg-card p-8">
        <div className="space-y-2 text-center">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            SiteCheck
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="you@company.com"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium text-foreground">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Enter your password"
          />
        </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

function DemoLoadingScreen() {
  return (
    <div className="flex w-full flex-col items-center gap-5 text-center">
      <div className="relative">
        <div className="h-14 w-14 animate-spin rounded-full border-2 border-amber-500/20 border-t-amber-500" />
        <Sparkles className="absolute inset-0 m-auto h-5 w-5 text-amber-400" />
      </div>
      <div className="space-y-1">
        <h2 className="font-heading text-lg font-bold tracking-wide text-amber-400">
          Starting demo session
        </h2>
        <p className="text-xs text-muted-foreground">
          Loading sample project &amp; guided tour...
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Suspense fallback={
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          Loading...
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
