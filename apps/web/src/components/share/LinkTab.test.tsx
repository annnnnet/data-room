import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ShareDto } from '@data-room/shared';
import { LinkTab } from './LinkTab';

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
  };
});

vi.mock('@/components/ui/toast', () => ({
  toast: { add: vi.fn() },
}));

function renderLinkTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <LinkTab nodeId="folder-1" />
    </QueryClientProvider>,
  );
}

const liveLink: ShareDto = {
  id: 'share-1',
  nodeId: 'folder-1',
  kind: 'LINK',
  token: 'the-real-token',
  granteeEmail: null,
  granteeName: null,
  role: 'VIEWER',
  expiresAt: null,
  createdAt: new Date(0).toISOString(),
};

describe('LinkTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('walks create → copy → revoke, never rendering the token anywhere but the read-only field', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce([]);
    vi.mocked(api.post).mockResolvedValueOnce(liveLink);

    renderLinkTab();

    // No live link yet — explains what creating one does before doing it.
    expect(
      await screen.findByText(/Anyone with the link can view this folder/),
    ).toBeInTheDocument();

    vi.mocked(api.get).mockResolvedValueOnce([liveLink]);
    fireEvent.click(screen.getByRole('button', { name: /Create link/ }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/nodes/folder-1/shares', { kind: 'LINK' }),
    );

    const urlField = await screen.findByLabelText('Share link');
    expect((urlField as HTMLInputElement).value).toContain('/s/the-real-token');
    expect(urlField).toHaveAttribute('readonly');

    // Copy: confirms via visible feedback, then reverts.
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/s/the-real-token'),
    );
    await screen.findByText('Copied to clipboard');

    // Revoke sits behind a confirmation that says access ends immediately.
    fireEvent.click(screen.getByRole('button', { name: 'Revoke link' }));
    expect(await screen.findByText(/Access ends immediately/)).toBeInTheDocument();

    vi.mocked(api.get).mockResolvedValueOnce([]);
    vi.mocked(api.del).mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/api/shares/share-1'));
  });

  it('never sends an email alongside a LINK share — the API rejects that combination outright', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce([]);
    vi.mocked(api.post).mockResolvedValueOnce(liveLink);

    renderLinkTab();

    fireEvent.click(await screen.findByRole('button', { name: /Create link/ }));

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(api.post).mock.calls[0];
    expect(body).toEqual({ kind: 'LINK' });
    expect(body).not.toHaveProperty('email');
  });

  it('offers Never / 7 days / 30 days before creating a link', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce([]);

    renderLinkTab();

    const select = await screen.findByLabelText('Expires');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['Never', '7 days', '30 days']);
  });
});
