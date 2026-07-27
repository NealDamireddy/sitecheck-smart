/**
 * /api/smarts/credentials — per-inspector SMARTS login management.
 *
 * GET    → status only: { configured, source, username, updatedAt }.
 *          The password is never returned, in any form.
 * PUT    → { username, password } — encrypts the password (AES-256-GCM,
 *          server-side key) and upserts the caller's row.
 * DELETE → removes the caller's saved credentials (the server-env
 *          fallback, if configured, then applies again).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import {
  deleteSmartsCredentials,
  saveSmartsCredentials,
  smartsCredentialStatus,
} from '@/lib/smarts/credentials';
import { log } from '@/lib/logger';

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const status = await smartsCredentialStatus(auth.supabase, auth.user.id);
    return NextResponse.json(status);
  } catch (err: unknown) {
    log.error('SMARTS credentials status error', { err });
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to read credential status' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;

    const body = (await request.json().catch(() => null)) as {
      username?: string;
      password?: string;
    } | null;
    const username = body?.username?.trim();
    const password = body?.password ?? '';
    if (!username || password.length === 0) {
      return NextResponse.json(
        { error: 'Both username and password are required.' },
        { status: 400 }
      );
    }

    await saveSmartsCredentials(auth.supabase, auth.user.id, username, password);
    const status = await smartsCredentialStatus(auth.supabase, auth.user.id);
    return NextResponse.json(status);
  } catch (err: unknown) {
    log.error('SMARTS credentials save error', { err });
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to save credentials' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    await deleteSmartsCredentials(auth.supabase, auth.user.id);
    const status = await smartsCredentialStatus(auth.supabase, auth.user.id);
    return NextResponse.json(status);
  } catch (err: unknown) {
    log.error('SMARTS credentials delete error', { err });
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to remove credentials' }, { status: 500 });
  }
}
