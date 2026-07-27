'use client';

/**
 * Set a new password after following the emailed recovery link (ACC-01).
 *
 * By the time this renders, /auth/callback has already exchanged the
 * recovery code for a session — so this page is behind the middleware
 * auth wall and `updateUser` acts on the recovered account. If someone
 * lands here without that session (expired or reused link), we say so
 * and point them back to request a fresh one.
 */

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  MIN_PASSWORD_LENGTH,
  validateNewPassword,
} from '@/lib/auth/password-policy';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getUser();
      if (!cancelled) setHasSession(Boolean(data.user));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      const check = validateNewPassword(password, confirmation);
      if (!check.ok) {
        setError(check.error);
        return;
      }

      setLoading(true);
      try {
        const supabase = createClient();
        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });
        if (updateError) {
          setError(updateError.message);
          return;
        }
        router.push('/dashboard');
        router.refresh();
      } catch {
        setError('Could not update your password. Try again in a moment.');
      } finally {
        setLoading(false);
      }
    },
    [password, confirmation, router]
  );

  if (hasSession === false) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-card p-8 text-center">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Link expired
          </h1>
          <p className="text-sm text-muted-foreground">
            This password reset link is no longer valid. Request a new one to
            continue.
          </p>
          <Link
            href="/auth/forgot-password"
            className="inline-block text-sm text-primary hover:underline"
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-border bg-card p-8">
        <div className="space-y-2 text-center">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-foreground">
            Choose a new password
          </h1>
          <p className="text-sm text-muted-foreground">
            At least {MIN_PASSWORD_LENGTH} characters.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-foreground"
            >
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Enter a new password"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="confirmation"
              className="text-sm font-medium text-foreground"
            >
              Confirm new password
            </label>
            <input
              id="confirmation"
              type="password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Re-enter the new password"
            />
          </div>

          <button
            type="submit"
            disabled={loading || hasSession === null}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}
