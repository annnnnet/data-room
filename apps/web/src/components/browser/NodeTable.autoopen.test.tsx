import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NodeDto } from '@data-room/shared';
import { NodeTable } from './NodeTable';

const replace = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/r/room-1/f/folder-1',
  useSearchParams: () => new URLSearchParams(search),
}));

vi.mock('@/lib/api', () => {
  class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.name = 'ApiError';
      this.code = code;
      this.status = status;
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

const fileNode: NodeDto = {
  id: 'file-1',
  dataRoomId: 'room-1',
  parentId: 'folder-1',
  type: 'FILE',
  name: 'MSA.docx',
  updatedAt: new Date(0).toISOString(),
  sizeBytes: 2048,
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  versionCount: 1,
};

function renderTable() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NodeTable
        basePath="/r/room-1/f"
        parentId="folder-1"
        readOnly={false}
        root={{ id: 'root-1', name: 'Room Root' }}
      />
    </QueryClientProvider>,
  );
}

describe('NodeTable — search deep-link (?open=)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    search = '';
  });

  afterEach(() => {
    cleanup();
  });

  it('opens the viewer for the node named by ?open= and strips it from the URL', async () => {
    search = 'open=file-1';
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ items: [fileNode], nextCursor: null });

    renderTable();

    // Auto-opened viewer renders as a dialog containing the file's name.
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('MSA.docx');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/r/room-1/f/folder-1', { scroll: false }));
  });

  it('does not open any viewer when there is no ?open= param', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ items: [fileNode], nextCursor: null });

    renderTable();

    expect(await screen.findByText('MSA.docx')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('opens the viewer for ?open= even when the folder was already fetched (warm cache)', async () => {
    // Reproduces the bug: browsing to this folder within the last 10s (this
    // app's staleTime) leaves its children cached, so `useInfiniteQuery`
    // returns that data synchronously on mount — `isPending` is already
    // false on NodeTable's very first render, so NodeRow mounts on its
    // first render too, same render pass as everything else. That's the
    // one case `NodeTable`'s own effect (which flips `autoOpenId` from
    // `null` to the real id) cannot have run before NodeRow reads its
    // `autoOpen` prop for the first time. A fresh QueryClient per test (as
    // the other tests in this file use) can never hit this: there's nothing
    // to serve synchronously, so `isPending` is always true on first render
    // and NodeRow only ever mounts once `autoOpenId` is already correct.
    search = 'open=file-1';
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ items: [fileNode], nextCursor: null });

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['children', 'folder-1'], {
      pages: [{ items: [fileNode], nextCursor: null }],
      pageParams: [null],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <NodeTable
          basePath="/r/room-1/f"
          parentId="folder-1"
          readOnly={false}
          root={{ id: 'root-1', name: 'Room Root' }}
        />
      </QueryClientProvider>,
    );

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('MSA.docx');

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/r/room-1/f/folder-1', { scroll: false }));
  });
});
