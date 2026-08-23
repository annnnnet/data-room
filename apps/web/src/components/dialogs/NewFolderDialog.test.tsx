import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';
import { NewFolderDialog } from './NewFolderDialog';

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

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <NewFolderDialog open onOpenChange={onOpenChange} parentId="parent-1" />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('NewFolderDialog conflict recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // `vitest.config.ts` runs with `globals: false`, so @testing-library/react's
  // automatic afterEach cleanup never registers — without this a dialog from
  // a prior test stays mounted and later `getByRole` queries can match stale
  // nodes.
  afterEach(() => {
    cleanup();
  });

  it('shows the conflict message inline, fills the input with the suggested name on click, and clears the error on retry', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError('NAME_CONFLICT', '"Legal" already exists here', 409, {
        suggestedName: 'Legal (2)',
      }),
    );

    renderDialog();

    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'Legal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('"Legal" already exists here');
    const useSuggestion = screen.getByRole('button', { name: /Use .*Legal \(2\)/ });

    fireEvent.click(useSuggestion);

    expect(input).toHaveValue('Legal (2)');
    // The stale conflict message clears once the user has acted on it.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use / })).not.toBeInTheDocument();

    // Retrying with a fresh (non-conflicting) name succeeds and the inline
    // error/suggestion never comes back on its own.
    vi.mocked(api.post).mockResolvedValueOnce({
      id: 'new-folder',
      dataRoomId: 'room-1',
      parentId: 'parent-1',
      type: 'FOLDER',
      name: 'Legal (2)',
      updatedAt: new Date(0).toISOString(),
      sizeBytes: null,
      mimeType: null,
      versionCount: null,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the conflict error as soon as the user edits the name, before resubmitting', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.post).mockRejectedValueOnce(
      new ApiError('NAME_CONFLICT', '"Legal" already exists here', 409, {
        suggestedName: 'Legal (2)',
      }),
    );

    renderDialog();

    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'Legal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('"Legal" already exists here');

    fireEvent.change(input, { target: { value: 'Legal Team' } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Use / })).not.toBeInTheDocument();
  });
});
