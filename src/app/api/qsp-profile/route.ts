/**
 * Per-user QSP profile — workflow step 2 ("Manage his account").
 *
 * GET  /api/qsp-profile  — returns the current user's profile, creating
 *                          a blank row on first read (get-or-create).
 * PUT  /api/qsp-profile  — partial update of the current user's profile.
 *
 * The row is keyed by auth.uid(); RLS (migration 013) blocks any
 * cross-user access regardless of what we send here.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { requireAuth } from '@/lib/auth';
import { qspProfileUpdate } from '@/lib/validations';

interface DbQspProfileRow {
  user_id: string;
  name: string;
  license_number: string;
  company: string;
  phone: string;
  email: string;
  created_at: string;
  updated_at: string;
}

function transformProfile(row: DbQspProfileRow) {
  return {
    userId: row.user_id,
    name: row.name,
    licenseNumber: row.license_number,
    company: row.company,
    phone: row.phone,
    email: row.email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { user, supabase } = auth;

    const { data: existing, error: fetchError } = await supabase
      .from('qsp_profiles')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchError && fetchError.code !== 'PGRST116') {
      throw new Error(fetchError.message);
    }

    if (existing) {
      return NextResponse.json(transformProfile(existing as DbQspProfileRow));
    }

    // First read for this user — seed a blank row so subsequent PUTs are
    // a straight update path. Email defaults to the auth email so the
    // form has a sensible starting value.
    const { data: inserted, error: insertError } = await supabase
      .from('qsp_profiles')
      .insert({
        user_id: user.id,
        email: user.email ?? '',
      })
      .select()
      .single();

    if (insertError || !inserted) {
      throw new Error(insertError?.message ?? 'Failed to seed profile');
    }

    return NextResponse.json(transformProfile(inserted as DbQspProfileRow));
  } catch (err: unknown) {
    console.error('QSP profile GET error:', err);
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if (auth.error) return auth.error;
    const { user, supabase } = auth;
    const body = qspProfileUpdate.parse(await request.json());

    const updateRow: Record<string, string> = {};
    if (body.name !== undefined) updateRow.name = body.name;
    if (body.licenseNumber !== undefined) updateRow.license_number = body.licenseNumber;
    if (body.company !== undefined) updateRow.company = body.company;
    if (body.phone !== undefined) updateRow.phone = body.phone;
    if (body.email !== undefined) updateRow.email = body.email;

    // Upsert so the first PUT also works even if GET was never called.
    const { data, error } = await supabase
      .from('qsp_profiles')
      .upsert(
        { user_id: user.id, ...updateRow },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error || !data) {
      throw new Error(error?.message ?? 'Update returned no row');
    }

    return NextResponse.json(transformProfile(data as DbQspProfileRow));
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    console.error('QSP profile PUT error:', err);
    // SEC-09: never echo internal error text to the client.
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
