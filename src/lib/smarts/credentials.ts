/**
 * Per-user SMARTS credential storage — SERVER ONLY. Never import from a
 * client component.
 *
 * Each inspector saves their own SMARTS username + password from the
 * account page. The password is encrypted with AES-256-GCM before it
 * touches the database; the key (SMARTS_CREDENTIALS_KEY in .env.local)
 * exists only on the app server, so DB access alone cannot recover a
 * password. Decryption happens in exactly one place: resolving
 * credentials for a sync launch.
 *
 * The API contract is write-only for the secret — status reads return
 * the username and timestamps, never the password in any form.
 *
 * SMARTS_USERNAME / SMARTS_PASSWORD env vars remain as a server-wide
 * fallback for accounts that haven't saved their own credentials.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';
import type { createAuthClient } from '@/lib/supabase/server';

type AuthedSupabase = Awaited<ReturnType<typeof createAuthClient>>;

const ALG = 'aes-256-gcm';
const IV_BYTES = 12;

function encryptionKey(): Buffer {
  const hex = process.env.SMARTS_CREDENTIALS_KEY?.trim();
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      'SMARTS_CREDENTIALS_KEY is missing or malformed — set a 64-char hex key (openssl rand -hex 32) in .env.local and restart.'
    );
  }
  return Buffer.from(hex, 'hex');
}

/** iv:tag:ciphertext, each base64. */
export function encryptPassword(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decryptPassword(ciphertext: string): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Stored SMARTS password is malformed — re-save it on the account page.');
  }
  const decipher = createDecipheriv(ALG, encryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

// ──────────────────────────────────────────────────────
// Resolution
// ──────────────────────────────────────────────────────

export type CredentialSource = 'account' | 'server-env';

export interface ResolvedSmartsCredentials {
  username: string;
  password: string;
  source: CredentialSource;
}

export interface SmartsCredentialStatus {
  configured: boolean;
  source: CredentialSource | null;
  /** Saved SMARTS username (safe to show); null when not configured. */
  username: string | null;
  updatedAt: string | null;
}

interface CredentialRow {
  username: string;
  password_ciphertext: string;
  updated_at: string;
}

async function fetchRow(
  supabase: AuthedSupabase,
  userId: string
): Promise<CredentialRow | null> {
  const { data, error } = await supabase
    .from('smarts_credentials')
    .select('username, password_ciphertext, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as CredentialRow | null) ?? null;
}

function envCredentials(): { username: string; password: string } | null {
  // SEC-08: the server-env pair is a SHARED SMARTS account. Silently
  // submitting it for any inspector who hasn't saved their own login
  // means filings under the wrong identity in multi-tenant use. The
  // fallback is therefore opt-in: set SMARTS_ALLOW_ENV_FALLBACK=1 only
  // on single-tenant/dev deployments where the shared account is the
  // intended identity.
  if (process.env.SMARTS_ALLOW_ENV_FALLBACK !== '1') return null;
  const username = process.env.SMARTS_USERNAME?.trim();
  const password = process.env.SMARTS_PASSWORD?.trim();
  return username && password ? { username, password } : null;
}

/**
 * Credentials for a sync launch: the user's saved pair when present,
 * else the server-env fallback, else null.
 */
export async function resolveSmartsCredentials(
  supabase: AuthedSupabase,
  userId: string
): Promise<ResolvedSmartsCredentials | null> {
  const row = await fetchRow(supabase, userId);
  if (row) {
    return {
      username: row.username,
      password: decryptPassword(row.password_ciphertext),
      source: 'account',
    };
  }
  const env = envCredentials();
  return env ? { ...env, source: 'server-env' } : null;
}

/** Status for UI — no secret material, in any form. */
export async function smartsCredentialStatus(
  supabase: AuthedSupabase,
  userId: string
): Promise<SmartsCredentialStatus> {
  const row = await fetchRow(supabase, userId);
  if (row) {
    return {
      configured: true,
      source: 'account',
      username: row.username,
      updatedAt: row.updated_at,
    };
  }
  const env = envCredentials();
  if (env) {
    return {
      configured: true,
      source: 'server-env',
      username: env.username,
      updatedAt: null,
    };
  }
  return { configured: false, source: null, username: null, updatedAt: null };
}

export async function saveSmartsCredentials(
  supabase: AuthedSupabase,
  userId: string,
  username: string,
  password: string
): Promise<void> {
  const { error } = await supabase.from('smarts_credentials').upsert(
    {
      user_id: userId,
      username,
      password_ciphertext: encryptPassword(password),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message);
}

export async function deleteSmartsCredentials(
  supabase: AuthedSupabase,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('smarts_credentials')
    .delete()
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
