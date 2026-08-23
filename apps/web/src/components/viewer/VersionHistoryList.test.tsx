import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { FileVersionDto, NodeDto } from '@data-room/shared';
import { ApiError } from '@/lib/api';
import { VersionHistoryList } from './VersionHistoryList';

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

const node: NodeDto = {
  id: 'file-1',
  dataRoomId: 'room-1',
  parentId: 'parent-1',
  type: 'FILE',
  name: 'MSA.pdf',
  updatedAt: new Date(0).toISOString(),
  sizeBytes: 2048,
  mimeType: 'application/pdf',
  versionCount: 2,
};

const versions: FileVersionDto[] = [
  {
    id: 'v2',
    versionNumber: 2,
    sizeBytes: 2048,
    mimeType: 'application/pdf',
    createdAt: new Date('2024-01-02T00:00:00.000Z').toISOString(),
    createdByName: 'Alice Owner',
    isCurrent: true,
  },
  {
    id: 'v1',
    versionNumber: 1,
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    createdAt: new Date('2024-01-01T00:00:00.000Z').toISOString(),
    createdByName: 'Alice Owner',
    isCurrent: false,
  },
];

function renderList(readOnly = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <VersionHistoryList node={node} parentId="parent-1" readOnly={readOnly} />
    </QueryClientProvider>,
  );
  return { queryClient };
}

describe('VersionHistoryList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('marks exactly one version as Current', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce(versions);

    renderList();

    await screen.findByText('Version 2');
    expect(screen.getByText('Version 1')).toBeInTheDocument();

    const currentBadges = screen.getAllByText('Current');
    expect(currentBadges).toHaveLength(1);

    const v2Row = screen.getByText('Version 2').closest('li')!;
    expect(within(v2Row).getByText('Current')).toBeInTheDocument();
    const v1Row = screen.getByText('Version 1').closest('li')!;
    expect(within(v1Row).queryByText('Current')).not.toBeInTheDocument();
  });

  it('shows author name and a legible relative date per row', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce(versions);

    renderList();

    await screen.findByText('Version 2');
    expect(screen.getAllByText(/Alice Owner/).length).toBe(2);
  });

  it('hides the Restore button entirely in readOnly mode', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce(versions);

    renderList(true);

    await screen.findByText('Version 2');
    expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument();
  });

  it('shows Restore for a non-owner-hidden (owner) view only on non-current versions', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce(versions);

    renderList(false);

    await screen.findByText('Version 2');
    const restoreButtons = screen.getAllByRole('button', { name: /Restore/ });
    expect(restoreButtons).toHaveLength(1);
    const v1Row = screen.getByText('Version 1').closest('li')!;
    expect(within(v1Row).getByRole('button', { name: /Restore/ })).toBeInTheDocument();
  });

  it('confirms before restoring, then invalidates versions and the folder listing', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce(versions);
    vi.mocked(api.post).mockResolvedValueOnce({});

    const { queryClient } = renderList(false);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    await screen.findByText('Version 2');
    fireEvent.click(screen.getByRole('button', { name: /Restore/ }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/Restore version 1/)).toBeInTheDocument();
    expect(within(dialog).getByText(/new version/i)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/files/file-1/versions/1/restore'));
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['versions', 'file-1'] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['children', 'parent-1'] });
  });

  it('renders a distinct message for NODE_GONE instead of a generic failure', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError('NODE_GONE', 'Gone', 404));

    renderList();

    expect(await screen.findByText(/deleted while you were viewing/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/i })).not.toBeInTheDocument();
  });

  it('renders a generic error state with retry for a non-NODE_GONE failure', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError('INTERNAL', 'Server exploded', 500));

    renderList();

    expect(await screen.findByText('Server exploded')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/i })).toBeInTheDocument();
  });
});
