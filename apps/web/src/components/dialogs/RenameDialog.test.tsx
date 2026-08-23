import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NodeDto } from '@data-room/shared';
import { ApiError } from '@/lib/api';
import { RenameDialog } from './RenameDialog';

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
  id: 'node-1',
  dataRoomId: 'room-1',
  parentId: 'parent-1',
  type: 'FOLDER',
  name: 'Ops',
  updatedAt: new Date(0).toISOString(),
  sizeBytes: null,
  mimeType: null,
  versionCount: null,
};

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <RenameDialog node={node} parentId="parent-1" open onOpenChange={onOpenChange} />
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('RenameDialog conflict recovery', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  // `vitest.config.ts` runs with `globals: false`, so @testing-library/react's
  // automatic afterEach cleanup (which relies on a global `afterEach`) never
  // registers — without this, a dialog from a prior test stays mounted and
  // later `getByRole` queries can match stale nodes.
  afterEach(() => {
    cleanup();
  });

  it('shows the conflict message inline and fills the input with the suggested name on click', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.patch).mockRejectedValueOnce(
      new ApiError('NAME_CONFLICT', '"Legal" already exists here', 409, {
        suggestedName: 'Legal (2)',
      }),
    );

    renderDialog();

    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'Legal' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('"Legal" already exists here');
    const useSuggestion = screen.getByRole('button', { name: /Use .*Legal \(2\)/ });

    fireEvent.click(useSuggestion);

    expect(input).toHaveValue('Legal (2)');
    // The stale conflict message clears once the user has acted on it.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('disables submit until the name actually changes', () => {
    renderDialog();
    const submit = screen.getByRole('button', { name: 'Rename' });
    expect(submit).toBeDisabled();

    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'Ops!' } });
    expect(submit).toBeEnabled();

    fireEvent.change(input, { target: { value: '' } });
    expect(submit).toBeDisabled();
  });

  it('renders a generic inline error for a non-conflict failure, without a suggestion button', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.patch).mockRejectedValueOnce(new ApiError('INTERNAL', 'Something broke', 500));

    renderDialog();

    const input = screen.getByLabelText('Name');
    fireEvent.change(input, { target: { value: 'Ops & Compliance' } });
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Something broke');
    expect(screen.queryByRole('button', { name: /Use / })).not.toBeInTheDocument();
  });
});
