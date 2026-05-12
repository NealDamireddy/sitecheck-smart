'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { startDemoSession } from '@/lib/demo/start-demo';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  function handleStartDemo() {
    setDemoLoading(true);
    // startDemoSession() does a hard navigation to /dashboard internally.
    startDemoSession();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();

      const { error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            org_name: orgName,
          },
        },
      });

      if (authError) {
        setError(authError.message);
        return;
      }

      // If email confirmation is enabled, show success message
      // Otherwise, redirect to dashboard
      setSuccess(true);
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Check your email
          </h1>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <strong>{email}</strong>.
            Click the link to activate your account.
          </p>
          <Link
            href="/login"
            className="inline-block text-sm text-primary hover:underline"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (demoLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
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
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background py-8">
      <div className="w-full max-w-sm space-y-4">
        {/* Prominent Demo CTA */}
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

        <div className="space-y-6 rounded-lg border border-border bg-card p-8">
          <div className="space-y-2 text-center">
            <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
              SiteCheck
            </h1>
            <p className="text-sm text-muted-foreground">
              Create your account
            </p>
          </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="orgName" className="text-sm font-medium text-foreground">
              Organization name
            </label>
            <input
              id="orgName"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              required
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Acme Construction"
            />
          </div>

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
              minLength={8}
              autoComplete="new-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="At least 8 characters"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>

          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
