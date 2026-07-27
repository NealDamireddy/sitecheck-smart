/**
 * Shared password rules for signup, recovery, and in-app password change
 * (ACC-01). One definition so the three entry points can't drift apart.
 */

/** Matches the `minLength` already enforced on the signup form. */
export const MIN_PASSWORD_LENGTH = 8;

export type PasswordCheck = { ok: true } | { ok: false; error: string };

export function validateNewPassword(
  password: string,
  confirmation: string
): PasswordCheck {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password !== confirmation) {
    return { ok: false, error: 'The two passwords do not match.' };
  }
  return { ok: true };
}

/**
 * Where Supabase sends the inspector after they click the emailed
 * recovery link: through the auth callback (which exchanges the code for
 * a session) and on to the set-a-new-password screen.
 *
 * Always built from the caller's own origin — a recovery link must never
 * be able to bounce the user to another host.
 */
export function buildPasswordResetRedirect(origin: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/auth/callback?redirect=${encodeURIComponent(
    '/auth/reset-password'
  )}`;
}
