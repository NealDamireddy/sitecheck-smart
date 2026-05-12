import { NextResponse } from 'next/server';
import { createAuthClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';

/**
 * Extract the authenticated user from the request cookies.
 * Returns the user if authenticated, or a 401 NextResponse if not.
 *
 * Usage in API route handlers:
 *   const auth = await requireAuth();
 *   if (auth.error) return auth.error;
 *   const { user, supabase } = auth;
 */
export async function requireAuth(): Promise<
  | { user: User; supabase: Awaited<ReturnType<typeof createAuthClient>>; error?: never }
  | { user?: never; supabase?: never; error: NextResponse }
> {
  const supabase = await createAuthClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      ),
    };
  }

  return { user, supabase };
}
