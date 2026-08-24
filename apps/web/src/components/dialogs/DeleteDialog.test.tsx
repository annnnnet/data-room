import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NodeDto, NodeStats } from '@data-room/shared';
import { ApiError } from '@/lib/api';
import { DeleteDialog } from './DeleteDialog';

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

const folderNode: NodeDto = {
  id: 'folder-1',
  dataRoomId: 'room-1',
  parentId: 'parent-1',
  type: 'FOLDER',
  name: 'Diligence',
  updatedAt: new Date(0).toISOString(),
  sizeBytes: null,
  mimeType: null,
  versionCount: null,
};

const fileNode: NodeDto = {
  id: 'file-1',
  dataRoomId: 'room-1',
  parentId: 'parent-1',
  type: 'FILE',
  name: 'NDA.pdf',
  updatedAt: new Date(0).toISOString(),
  sizeBytes: 2048,
  mimeType: 'application/pdf',
  versionCount: 3,
};

function renderDialog(node: NodeDto, onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <DeleteDialog node={node} parentId="parent-1" open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('DeleteDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('never shows a zero count while /stats is loading, and blocks Delete until it resolves', async () => {
    const { api } = await import('@/lib/api');
    let resolveStats!: (v: NodeStats) => void;
    vi.mocked(api.get).mockReturnValueOnce(
      new Promise<NodeStats>((resolve) => {
        resolveStats = resolve;
      }),
    );

    renderDialog(folderNode);

    // While loading, the summary must not claim "0 file(s) / 0 folder(s)".
    expect(screen.getByText(/Checking what this folder contains/)).toBeInTheDocument();
    expect(screen.queryByText(/0 file/)).not.toBeInTheDocument();

    const deleteButton = screen.getByRole('button', { name: /Delete/ });
    expect(deleteButton).toBeDisabled();

    resolveStats({ fileCount: 4, folderCount: 1, totalBytes: 512 });

    await waitFor(() =>
      expect(screen.getByText(/4 file\(s\) and 1 folder\(s\)/)).toBeInTheDocument(),
    );
    expect(deleteButton).toBeEnabled();
  });

  it('keeps the destructive action blocked when /stats fails, rather than proceeding on unknown information', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError('INTERNAL', 'Stats unavailable', 500));

    renderDialog(folderNode);

    await screen.findByText(/Couldn.?t check what this folder contains/);

    const deleteButton = screen.getByRole('button', { name: /Delete/ });
    expect(deleteButton).toBeDisabled();

    // Clicking the (disabled) button must never fire the delete mutation.
    fireEvent.click(deleteButton);
    expect(api.del).not.toHaveBeenCalled();
  });

  it('offers a retry when /stats fails, and re-enables Delete once the retry succeeds', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockRejectedValueOnce(new ApiError('INTERNAL', 'Stats unavailable', 500));
    vi.mocked(api.get).mockResolvedValueOnce({ fileCount: 2, folderCount: 0, totalBytes: 100 });

    renderDialog(folderNode);

    await screen.findByText(/Couldn.?t check what this folder contains/);

    const retryButton = screen.getByRole('button', { name: /Retry/ });
    fireEvent.click(retryButton);

    await waitFor(() =>
      expect(screen.getByText(/2 file\(s\) and 0 folder\(s\)/)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /Delete/ })).toBeEnabled();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it('mentions versions in the summary for a file (not just "this file")', () => {
    renderDialog(fileNode);
    expect(screen.getByText(/versions/i)).toBeInTheDocument();
  });

  it('renders a FOLDER node while closed without throwing (regression: DeleteDialog is mounted per-row by NodeRowActions, and the disabled /stats query must never be read as if it succeeded)', async () => {
    const { api } = await import('@/lib/api');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    expect(() =>
      render(
        <QueryClientProvider client={queryClient}>
          <DeleteDialog node={folderNode} parentId="parent-1" open={false} onOpenChange={vi.fn()} />
        </QueryClientProvider>,
      ),
    ).not.toThrow();

    // The /stats query is disabled while closed — it must not be fetched, and
    // the component must not fall through to reading `stats.data!` as if the
    // (never-started) query had succeeded.
    expect(api.get).not.toHaveBeenCalled();
  });

  it('does not call /stats for a file node — only folders need the subtree check', () => {
    renderDialog(fileNode);
    // No call is made, but even a call would eventually be for the wrong
    // reason: files have no subtree stats. Assert directly.
    return import('@/lib/api').then(({ api }) => {
      expect(api.get).not.toHaveBeenCalled();
    });
  });
});
