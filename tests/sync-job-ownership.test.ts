/**
 * SEC-05 — sync-job routes must refuse jobs the caller does not own.
 *
 * requireAuth and the job store are mocked at the module boundary; the
 * real route handlers run end-to-end otherwise.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const requireAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  requireAuth: (...args: unknown[]) => requireAuth(...args),
}));

const getSyncJob = vi.fn();
const resolveJobScreenshot = vi.fn();
vi.mock('@/lib/smarts/sync-job', () => ({
  getSyncJob: (...args: unknown[]) => getSyncJob(...args),
  resolveJobScreenshot: (...args: unknown[]) => resolveJobScreenshot(...args),
}));

import { GET as statusGET } from '@/app/api/smarts/sync/[jobId]/route';
import { GET as screenshotGET } from '@/app/api/smarts/sync/[jobId]/screenshot/route';

const OWNER = 'user-owner';
const STRANGER = 'user-stranger';

function jobFixture(userId: string) {
  return {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    eventId: 'evt-1',
    projectId: 'proj-1',
    userId,
    status: 'filled',
    pid: null,
    startedAt: '2026-07-27T00:00:00.000Z',
    finishedAt: '2026-07-27T00:05:00.000Z',
    exitCode: 0,
    reason: null,
    screenshots: { samples: [], dataSummary: null, certification: null, halt: null },
    logTail: [],
  };
}

function authedAs(userId: string) {
  requireAuth.mockResolvedValue({
    user: { id: userId },
    supabase: {},
  });
}

function ctx() {
  return { params: Promise.resolve({ jobId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/smarts/sync/[jobId] ownership (SEC-05)', () => {
  it('returns the job to its owner', async () => {
    authedAs(OWNER);
    getSyncJob.mockResolvedValue(jobFixture(OWNER));
    const res = await statusGET(new NextRequest('http://test/api/smarts/sync/x'), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it("returns 404 for another user's job — indistinguishable from missing", async () => {
    authedAs(STRANGER);
    getSyncJob.mockResolvedValue(jobFixture(OWNER));
    const res = await statusGET(new NextRequest('http://test/api/smarts/sync/x'), ctx());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toEqual({ error: 'Sync job not found' });
  });

  it('returns 401 untouched when unauthenticated', async () => {
    requireAuth.mockResolvedValue({
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const res = await statusGET(new NextRequest('http://test/api/smarts/sync/x'), ctx());
    expect(res.status).toBe(401);
    expect(getSyncJob).not.toHaveBeenCalled();
  });
});

describe('GET /api/smarts/sync/[jobId]/screenshot ownership (SEC-05)', () => {
  it("returns 404 for another user's job and never resolves a path", async () => {
    authedAs(STRANGER);
    getSyncJob.mockResolvedValue(jobFixture(OWNER));
    const res = await screenshotGET(
      new NextRequest('http://test/api/smarts/sync/x/screenshot?key=certification'),
      ctx()
    );
    expect(res.status).toBe(404);
    expect(resolveJobScreenshot).not.toHaveBeenCalled();
  });

  it('still 404s for the owner when the screenshot key resolves nothing', async () => {
    authedAs(OWNER);
    getSyncJob.mockResolvedValue(jobFixture(OWNER));
    resolveJobScreenshot.mockReturnValue(null);
    const res = await screenshotGET(
      new NextRequest('http://test/api/smarts/sync/x/screenshot?key=halt'),
      ctx()
    );
    expect(res.status).toBe(404);
    expect(resolveJobScreenshot).toHaveBeenCalledWith(
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      'halt'
    );
  });
});
