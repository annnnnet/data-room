import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { useEffect } from 'react';

// Only the Supabase client is stubbed — unrelated to the bug this test
// proves fixed, and constructing a real client would throw in this test
// environment (no Supabase env vars in the test run). Everything else that
// matters — `Providers`, `ShareTokenProvider`, and the real (unmocked)
// `api` module's request(), including the module-level token it reads —
// runs for real. Mocking `@/lib/api` wholesale (as other share tests do) is
// what hid CRITICAL-1 in the first place: it replaces the exact code path
// the bug lived in.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));

import { Providers } from '@/app/providers';
import { ShareTokenProvider } from './share-token';
import { api } from './api';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * Stands in for a real descendant that fires a query on mount — the same
 * shape as React Query's `useQuery`, which kicks its first fetch from an
 * effect of its own, deeper in the tree than any provider wrapping it (e.g.
 * `FolderBrowser`'s `useQuery(['node', nodeId], ...)`).
 */
function FetchesOnMount({ path }: { path: string }) {
  useEffect(() => {
    void api.get(path).catch(() => {});
  }, [path]);
  return null;
}

function mockFetchOk() {
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } }),
    );
}

function headerFromFirstCall(fetchSpy: ReturnType<typeof mockFetchOk>) {
  const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
  return new Headers(init.headers).get('X-Share-Token');
}

describe('share token wiring end-to-end (CRITICAL-1 regression)', () => {
  /**
   * Renders the actual root `Providers` (the same component every route,
   * including `/s`, mounts) with the `/s/[token]` layout's
   * `ShareTokenProvider` nested inside it, exactly as the real route tree
   * composes them, then a descendant that fires a real request the way a
   * page component does.
   *
   * Before the fix, `Providers` itself mounted a second, competing
   * `<ShareTokenProvider token={null}>` around everything — so this exact
   * composition (a real-token provider nested inside root `Providers`) is
   * precisely what regressed: React flushes passive effects child-first, so
   * the inner provider's real token was armed only for `Providers`' own
   * later-flushing effect to null it right back out, permanently, for the
   * life of the page. This test fails against that code and passes against
   * the fix, where `Providers` no longer touches the share token at all.
   */
  it('a request fired after mount still carries the token — Providers does not clobber it', async () => {
    const fetchSpy = mockFetchOk();

    render(
      <Providers>
        <ShareTokenProvider token="the-real-token">
          <FetchesOnMount path="/api/nodes/root-id" />
        </ShareTokenProvider>
      </Providers>,
    );

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    expect(headerFromFirstCall(fetchSpy)).toBe('the-real-token');
  });

  it('a second request issued well after the initial commit also carries the token', async () => {
    mockFetchOk(); // drain the initial request the effects below trigger
    render(
      <Providers>
        <ShareTokenProvider token="the-real-token">
          <div />
        </ShareTokenProvider>
      </Providers>,
    );

    const fetchSpy = mockFetchOk();
    await api.get('/api/nodes/some-other-id');

    expect(headerFromFirstCall(fetchSpy)).toBe('the-real-token');
  });

  it('clears the token on unmount so it never leaks into a later authenticated request', async () => {
    mockFetchOk();
    const { unmount } = render(
      <Providers>
        <ShareTokenProvider token="the-real-token">
          <div />
        </ShareTokenProvider>
      </Providers>,
    );
    unmount();

    const fetchSpy = mockFetchOk();
    await api.get('/api/nodes/some-id');

    expect(headerFromFirstCall(fetchSpy)).toBeNull();
  });
});
