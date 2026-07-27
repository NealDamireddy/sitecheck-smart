/**
 * The logger is a security boundary: every server log line goes through
 * it, and log sinks are widely readable inside a company. A secret that
 * reaches a log is a leak even though it never left the building.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDACTED, buildRecord, sanitize, log } from '@/lib/logger';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('sanitize redacts secret-shaped keys', () => {
  const cases = [
    'password',
    'passwd',
    'SMARTS_PASSWORD',
    'apiKey',
    'api_key',
    'ANTHROPIC_API_KEY',
    'token',
    'accessToken',
    'authorization',
    'Cookie',
    'sessionId',
    'credentials',
    'password_ciphertext',
    'privateKey',
  ];
  for (const key of cases) {
    it(`redacts "${key}"`, () => {
      const out = sanitize({ [key]: 'super-secret-value' }) as Record<string, unknown>;
      expect(out[key]).toBe(REDACTED);
      expect(JSON.stringify(out)).not.toContain('super-secret-value');
    });
  }

  it('keeps ordinary operational fields', () => {
    const out = sanitize({
      userId: 'uuid-1',
      route: '/api/samples',
      durationMs: 42,
    }) as Record<string, unknown>;
    expect(out).toEqual({ userId: 'uuid-1', route: '/api/samples', durationMs: 42 });
  });

  it('redacts nested secrets', () => {
    const out = sanitize({
      job: { id: 'j1', env: { SMARTS_PASSWORD: 'hunter2' } },
    });
    expect(JSON.stringify(out)).not.toContain('hunter2');
    expect(JSON.stringify(out)).toContain(REDACTED);
  });

  it('unwraps Errors instead of spreading them', () => {
    const err = new Error('boom') as Error & { config?: unknown };
    // HTTP clients hang request config (with auth headers) off errors.
    err.config = { headers: { authorization: 'Bearer super-secret-value' } };
    const out = sanitize(err) as Record<string, unknown>;
    expect(out.name).toBe('Error');
    expect(out.message).toBe('boom');
    expect(JSON.stringify(out)).not.toContain('super-secret-value');
  });

  it('bounds recursion on deeply nested input', () => {
    let deep: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 20; i++) deep = { nested: deep };
    expect(() => JSON.stringify(sanitize(deep))).not.toThrow();
    expect(JSON.stringify(sanitize(deep))).toContain('[truncated]');
  });

  it('caps very large arrays', () => {
    const out = sanitize(Array.from({ length: 500 }, (_, i) => i)) as unknown[];
    expect(out.length).toBeLessThanOrEqual(50);
  });
});

describe('record shape', () => {
  it('emits level, ISO time and message', () => {
    const record = buildRecord('info', 'Sync started', { userId: 'u1' });
    expect(record.level).toBe('info');
    expect(record.message).toBe('Sync started');
    expect(() => new Date(record.time).toISOString()).not.toThrow();
    expect(record.userId).toBe('u1');
  });

  it('is JSON-serializable in one line', () => {
    const line = JSON.stringify(buildRecord('error', 'Failed', { err: new Error('x') }));
    expect(line.includes('\n')).toBe(false);
    expect(JSON.parse(line).message).toBe('Failed');
  });
});

describe('production output is machine-parseable', () => {
  it('writes a single JSON object per line', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('Upload failed', { route: '/api/x', password: 'hunter2' });
    expect(spy).toHaveBeenCalledOnce();
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('error');
    expect(parsed.route).toBe('/api/x');
    expect(parsed.password).toBe(REDACTED);
    expect(line).not.toContain('hunter2');
  });

  it('honors LOG_LEVEL', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('LOG_LEVEL', 'warn');
    const info = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.info('should be filtered');
    log.warn('should pass');
    expect(info).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('server code uses the logger, not bare console', () => {
  it('API routes emit structured logs', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');

    function walk(dir: string): string[] {
      const out: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) out.push(...walk(full));
        else if (entry === 'route.ts') out.push(full);
      }
      return out;
    }

    const offenders: string[] = [];
    for (const file of walk(join(process.cwd(), 'src/app/api'))) {
      const src = readFileSync(file, 'utf8');
      if (/\bconsole\.(log|error|warn|info)\s*\(/.test(src)) {
        offenders.push(file.replace(process.cwd() + '/', ''));
      }
    }
    expect(
      offenders,
      `These routes still use console.* — cloud log aggregators cannot index ` +
        `free text, and console bypasses secret redaction:\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
