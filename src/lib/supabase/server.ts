import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Create a Supabase client that uses the authenticated user's JWT from cookies.
 * This client respects RLS policies — queries are scoped to the user's org.
 *
 * Use this in all API route handlers and server components.
 */
export async function createAuthClient() {
  const cookieStore = await cookies();

  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll can fail in Server Components where cookies are read-only.
            // This is expected — the middleware handles session refresh.
          }
        },
      },
    }
  );
}

/**
 * Create a Supabase client with the service role key.
 * This bypasses RLS — use ONLY for admin/system operations:
 *   - Migration runner
 *   - System-level AI analysis (SWPPP parsing)
 *   - Storage uploads (service role writes)
 *
 * NEVER use in user-facing API route handlers.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * @deprecated Use createAuthClient() for user-scoped queries or createAdminClient() for system operations.
 * Kept temporarily during migration to avoid breaking all routes at once.
 */
export function createServerClient() {
  return createAdminClient();
}
