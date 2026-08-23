import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ShareDto } from '@data-room/shared';
import { PeopleTab } from './PeopleTab';

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

function renderPeopleTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <PeopleTab nodeId="folder-1" />
    </QueryClientProvider>,
  );
}

const pendingInvite: ShareDto = {
  id: 'share-2',
  nodeId: 'folder-1',
  kind: 'USER',
  token: null,
  granteeEmail: 'newcomer@acme.test',
  granteeName: null,
  role: 'VIEWER',
  expiresAt: null,
  createdAt: new Date(0).toISOString(),
};

const acceptedGrantee: ShareDto = {
  id: 'share-3',
  nodeId: 'folder-1',
  kind: 'USER',
  token: null,
  granteeEmail: 'ana@acme.test',
  granteeName: 'Ana Cole',
  role: 'VIEWER',
  expiresAt: null,
  createdAt: new Date(0).toISOString(),
};

describe('PeopleTab', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders an invite to someone who has not signed up yet as pending, not an error or empty row', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce([pendingInvite]);

    renderPeopleTab();

    expect(await screen.findByText('newcomer@acme.test')).toBeInTheDocument();
    expect(screen.getByText('Pending invite')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders an accepted grantee by name with no pending badge', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce([acceptedGrantee]);

    renderPeopleTab();

    expect(await screen.findByText('Ana Cole')).toBeInTheDocument();
    expect(screen.queryByText('Pending invite')).not.toBeInTheDocument();
  });

  it('invites by email and shows the removal toast naming who lost access', async () => {
    const { api } = await import('@/lib/api');
    const { toast } = await import('@/components/ui/toast');
    vi.mocked(api.get).mockResolvedValueOnce([]);
    vi.mocked(api.post).mockResolvedValueOnce(pendingInvite);

    renderPeopleTab();

    const input = await screen.findByLabelText('Invite by email');
    fireEvent.change(input, { target: { value: 'newcomer@acme.test' } });

    vi.mocked(api.get).mockResolvedValueOnce([pendingInvite]);
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/api/nodes/folder-1/shares', {
        kind: 'USER',
        email: 'newcomer@acme.test',
      }),
    );

    await screen.findByText('Pending invite');

    vi.mocked(api.get).mockResolvedValueOnce([]);
    vi.mocked(api.del).mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: /Remove newcomer@acme.test/ }));

    await waitFor(() => expect(api.del).toHaveBeenCalledWith('/api/shares/share-2'));
    await waitFor(() =>
      expect(toast.add).toHaveBeenCalledWith({
        title: 'Access revoked for newcomer@acme.test',
        type: 'success',
      }),
    );
  });
});
