import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = fs.readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/024_harden_site_record_rpc_acl.sql'
  ),
  'utf8'
);

describe('Phase 4 site-record RPC ACL hardening migration', () => {
  it('removes both inherited and explicit anonymous execution', () => {
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_site_record_with_detail\([\s\S]*?FROM PUBLIC, anon/
    );
  });

  it('retains execution for authenticated callers and the service role', () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_site_record_with_detail\([\s\S]*?TO authenticated, service_role/
    );
  });
});
