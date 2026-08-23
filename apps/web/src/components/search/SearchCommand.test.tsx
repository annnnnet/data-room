import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { SearchHit } from '@data-room/shared';
import { SearchCommand } from './SearchCommand';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

// jsdom has no ResizeObserver — cmdk's CommandList uses one purely to track
// pixel height for its scroll animation, unrelated to anything under test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

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

function hit(overrides: Partial<SearchHit> = {}): SearchHit {
  return {
    id: 'file-1',
    dataRoomId: 'room-1',
    parentId: 'folder-1',
    type: 'FILE',
    name: 'MSA Final.pdf',
    updatedAt: new Date(0).toISOString(),
    sizeBytes: 1024,
    mimeType: 'application/pdf',
    versionCount: 1,
    breadcrumbLabel: 'Legal / Contracts',
    ...overrides,
  };
}

function renderCommand(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SearchCommand roomId="room-1" basePath="/r/room-1/f" open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('SearchCommand', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('shows the minimum-length hint below two characters and never calls the API', async () => {
    const { api } = await import('@/lib/api');
    renderCommand();

    fireEvent.change(screen.getByPlaceholderText('Search files and folders…'), {
      target: { value: 'a' },
    });

    expect(await screen.findByText('Type at least 2 characters to search.')).toBeInTheDocument();
    // Give the 250ms debounce plenty of room to have fired if it were going to.
    await new Promise((r) => setTimeout(r, 400));
    expect(api.get).not.toHaveBeenCalled();
  });

  it('never renders an empty palette while the debounce settles from 1 to 2 characters', async () => {
    vi.useFakeTimers();
    try {
      const { api } = await import('@/lib/api');
      vi.mocked(api.get).mockResolvedValue({ items: [], nextCursor: null });

      const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      render(
        <QueryClientProvider client={queryClient}>
          <SearchCommand roomId="room-1" basePath="/r/room-1/f" open onOpenChange={vi.fn()} />
        </QueryClientProvider>,
      );

      const input = screen.getByPlaceholderText('Search files and folders…');

      fireEvent.change(input, { target: { value: 'm' } });
      expect(screen.getByText('Type at least 2 characters to search.')).toBeInTheDocument();

      // Crossing the minimum length before the 250ms debounce has fired:
      // the hint is gated on the raw input, so it disappears immediately,
      // but `debounced` (and everything gated on it) hasn't caught up yet.
      fireEvent.change(input, { target: { value: 'ms' } });
      expect(screen.queryByText('Type at least 2 characters to search.')).not.toBeInTheDocument();
      // CommandList must not be empty during this window.
      expect(screen.getByText('Searching…')).toBeInTheDocument();

      await vi.advanceTimersByTimeAsync(300);
      await vi.waitFor(() => expect(api.get).toHaveBeenCalled(), { timeout: 2000 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders results with their breadcrumb label once the debounced query resolves', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({
      items: [hit()],
      nextCursor: null,
    });

    renderCommand();

    fireEvent.change(screen.getByPlaceholderText('Search files and folders…'), {
      target: { value: 'msa' },
    });

    await waitFor(() => expect(api.get).toHaveBeenCalled(), { timeout: 1000 });
    expect(api.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/search?dataRoomId=room-1&q=msa'),
    );

    expect(await screen.findByText('Legal / Contracts')).toBeInTheDocument();
    expect(screen.getByText('.pdf', { exact: false })).toBeInTheDocument();
  });

  it('shows a distinct no-match state naming the term', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({ items: [], nextCursor: null });

    renderCommand();

    fireEvent.change(screen.getByPlaceholderText('Search files and folders…'), {
      target: { value: 'zzz' },
    });

    expect(await screen.findByText('No files match “zzz”', { exact: false })).toBeInTheDocument();
  });

  it('selecting a folder result navigates to that folder', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({
      items: [hit({ id: 'folder-2', type: 'FOLDER', name: 'Contracts', parentId: 'folder-1' })],
      nextCursor: null,
    });
    const { onOpenChange } = renderCommand();

    fireEvent.change(screen.getByPlaceholderText('Search files and folders…'), {
      target: { value: 'contracts' },
    });

    const item = await screen.findByText('Contracts');
    fireEvent.click(item);

    expect(push).toHaveBeenCalledWith('/r/room-1/f/folder-2');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('selecting a file result navigates to its parent folder and asks it to open the viewer', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({
      items: [hit()],
      nextCursor: null,
    });
    renderCommand();

    fireEvent.change(screen.getByPlaceholderText('Search files and folders…'), {
      target: { value: 'msa' },
    });

    const item = await screen.findByText('.pdf', { exact: false });
    fireEvent.click(item);

    expect(push).toHaveBeenCalledWith('/r/room-1/f/folder-1?open=file-1');
  });
});
