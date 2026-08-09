/**
 * Turning validation failures into something a human can act on.
 *
 * Routes used to answer a ZodError with `{ error: err.issues }` — an array of
 * objects. Every client that does `` `${body.error}` `` then renders
 * "[object Object]", so the user is told something failed but never what. That
 * is how an empty required field on a monitoring location became an
 * undiagnosable 400 during the 2026-08-08 production run.
 *
 * These helpers are deliberately dependency-free (no next/server) so the same
 * module is safe to import from client components.
 */

/**
 * A Zod issue, structurally — avoids importing zod into client bundles.
 *
 * `path` is PropertyKey[] because Zod allows symbol keys; they are rendered
 * via String() rather than excluded, so a symbol-keyed field still names
 * itself instead of vanishing from the message.
 */
type IssueLike = {
  path?: ReadonlyArray<PropertyKey>;
  message?: string;
};

/**
 * Render Zod issues as "field: message, field: message".
 *
 * Falls back to a generic string rather than returning empty, because an empty
 * error message is the failure mode this whole module exists to prevent.
 */
export function formatZodIssues(issues: readonly IssueLike[]): string {
  if (!Array.isArray(issues) || issues.length === 0) {
    return 'Validation failed';
  }
  const parts = issues.map((issue) => {
    const field = Array.isArray(issue?.path)
      ? issue.path.map((segment: PropertyKey) => String(segment)).join('.')
      : '';
    const message = issue?.message || 'is invalid';
    return field ? `${field}: ${message}` : message;
  });
  return parts.join(', ');
}

/**
 * Pull a readable message out of an error response body, whatever shape it is.
 *
 * Handles the three things routes actually return today: a plain string, an
 * array of Zod issues, and `{ error: ... }` wrapping either. Anything else
 * degrades to the caller's fallback instead of stringifying an object.
 */
export function readErrorMessage(body: unknown, fallback: string): string {
  if (typeof body === 'string' && body.trim()) return body;

  if (Array.isArray(body)) return formatZodIssues(body as IssueLike[]);

  if (body && typeof body === 'object') {
    const error = (body as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim()) return error;
    if (Array.isArray(error)) return formatZodIssues(error as IssueLike[]);
    if (error && typeof error === 'object') {
      const nested = (error as { message?: unknown }).message;
      if (typeof nested === 'string' && nested.trim()) return nested;
    }
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }

  return fallback;
}
