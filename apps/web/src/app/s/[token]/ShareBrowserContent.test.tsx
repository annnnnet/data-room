import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShareBrowserContent } from './ShareBrowserContent';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    code: string;
    status: number;
    details?: Record<string, unknown>;
    constructor(code: string, message: string, status: number, details?: Record<string, unknown>) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
      this.details = details;
    }
  }
  return {
    ApiError,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
    setShareToken: vi.fn(),
  };
});

function renderShare(token: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <ShareBrowserContent token={token} nodeId={null} />
    </QueryClientProvider>,
  );
}

describe('ShareBrowserContent failure states', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows a revoked/expired message for SHARE_REVOKED, and never a raw error', async () => {
    const { api, ApiError } = await import('@/lib/api');
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError('SHARE_REVOKED', 'This link is no longer active', 404),
    );

    renderShare('revoked-token');

    expect(await screen.findByText('This link is no longer active')).toBeInTheDocument();
    expect(
      screen.getByText(/It was revoked or has expired. Ask the owner for a new one\./),
    ).toBeInTheDocument();
  });

  it('shows the same not-active message for a wholly unknown token', async () => {
    const { api, ApiError } = await import('@/lib/api');
    // The API 404s SHARE_REVOKED for an unknown token too — same UI either way.
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError('SHARE_REVOKED', 'This link is no longer active', 404),
    );

    renderShare('never-issued-token');

    expect(await screen.findByText('This link is no longer active')).toBeInTheDocument();
  });

  it('shows a distinct deleted-target message for NODE_GONE', async () => {
    const { api, ApiError } = await import('@/lib/api');
    vi.mocked(api.get).mockRejectedValueOnce(
      new ApiError('NODE_GONE', 'This item was deleted by the owner', 410),
    );

    renderShare('gone-token');

    expect(await screen.findByText('This item was deleted')).toBeInTheDocument();
    expect(
      screen.getByText(/The owner removed it. Ask them for a new link\./),
    ).toBeInTheDocument();
  });

  it('never renders a sign-out control or a signed-in identity — the visitor is anonymous', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockImplementation((url: string) => {
      if (url.startsWith('/api/shares/context')) {
        return Promise.resolve({
          rootNodeId: 'node-1',
          nodeName: 'NDA.pdf',
          dataRoomName: 'Acme Diligence',
        });
      }
      if (url.startsWith('/api/nodes/')) {
        return Promise.resolve({
          id: 'node-1',
          dataRoomId: 'room-1',
          parentId: null,
          type: 'FILE',
          name: 'NDA.pdf',
          updatedAt: new Date(0).toISOString(),
          sizeBytes: 2048,
          mimeType: null,
          versionCount: 1,
          breadcrumbs: [],
          myRole: 'VIEWER',
        });
      }
      return Promise.reject(new Error(`unexpected url ${url}`));
    });

    renderShare('file-token');

    await screen.findByRole('heading', { name: 'NDA.pdf' });

    expect(screen.queryByRole('menuitem', { name: /sign out/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/sign out/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/@/)).not.toBeInTheDocument();
  });
});
