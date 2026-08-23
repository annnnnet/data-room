import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NodeDto } from '@data-room/shared';
import { ApiError } from '@/lib/api';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MoveDialog } from './MoveDialog';

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
  type: 'FILE',
  name: 'Contract.pdf',
  updatedAt: new Date(0).toISOString(),
  sizeBytes: 1024,
  mimeType: 'application/pdf',
  versionCount: 1,
};

function folder(id: string, name: string): NodeDto {
  return {
    id,
    dataRoomId: 'room-1',
    parentId: 'root',
    type: 'FOLDER',
    name,
    updatedAt: new Date(0).toISOString(),
    sizeBytes: null,
    mimeType: null,
    versionCount: null,
  };
}

function mockRootChildren() {
  return {
    items: [
      folder('parent-1', 'Current Folder'),
      folder('other', 'Other Folder'),
      folder('node-1-as-folder', 'Irrelevant'),
    ],
    nextCursor: null,
  };
}

function renderDialog(onOpenChange = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delay={0}>
        <MoveDialog
          node={node}
          parentId="parent-1"
          root={{ id: 'root', name: 'Root' }}
          open
          onOpenChange={onOpenChange}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onOpenChange };
}

describe('MoveDialog', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the current parent as disabled with "already here", and lets a valid destination be selected', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue(mockRootChildren());

    renderDialog();

    const currentRow = await screen.findByRole('treeitem', { name: 'Current Folder' });
    expect(currentRow).toBeDisabled();
    expect(currentRow).toHaveAttribute('aria-disabled', 'true');

    const otherRow = screen.getByRole('treeitem', { name: 'Other Folder' });
    expect(otherRow).not.toBeDisabled();

    // Selecting a valid destination enables the Move button.
    const moveButton = screen.getByRole('button', { name: 'Move' });
    expect(moveButton).toBeDisabled();
    fireEvent.click(otherRow);
    expect(moveButton).toBeEnabled();
  });

  it('gives the current-parent row and a self-move row distinct disabled reasons', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue({
      items: [folder('parent-1', 'Current Folder'), folder('node-1', 'Self')],
      nextCursor: null,
    });

    renderDialog();

    const currentRow = await screen.findByRole('treeitem', { name: 'Current Folder' });
    const selfRow = screen.getByRole('treeitem', { name: 'Self' });
    expect(currentRow).toBeDisabled();
    expect(selfRow).toBeDisabled();

    // Both are disabled, but for different reasons — the dialog must not
    // collapse these into one generic "invalid" message. The hover/focus
    // target base-ui attaches its listeners to is the tooltip trigger `div`
    // wrapping the row, not the (disabled, non-focusable) button itself.
    const currentTrigger = currentRow.closest('[data-base-ui-tooltip-trigger]')!;
    const selfTrigger = selfRow.closest('[data-base-ui-tooltip-trigger]')!;

    fireEvent.mouseEnter(currentTrigger);
    const alreadyHereTip = await screen.findByText("It's already here");

    fireEvent.mouseLeave(currentTrigger);
    fireEvent.mouseEnter(selfTrigger);
    const selfMoveTip = await screen.findByText("A folder can't be moved into itself");

    expect(alreadyHereTip.textContent).not.toEqual(selfMoveTip.textContent);
  });

  it('surfaces a server-side rejection inline and keeps the dialog open', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue(mockRootChildren());
    vi.mocked(api.patch).mockRejectedValueOnce(
      new ApiError('NAME_CONFLICT', '"Contract.pdf" already exists there', 409, {
        suggestedName: 'Contract (2).pdf',
      }),
    );

    const { onOpenChange } = renderDialog();

    const otherRow = await screen.findByRole('treeitem', { name: 'Other Folder' });
    fireEvent.click(otherRow);
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '"Contract.pdf" already exists there',
    );
    // The dialog must stay open on failure — no onOpenChange(false) call.
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('surfaces an INVALID_MOVE rejection inline as well', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValue(mockRootChildren());
    vi.mocked(api.patch).mockRejectedValueOnce(
      new ApiError('INVALID_MOVE', "Can't move a folder into its own subfolder", 409),
    );

    renderDialog();

    const otherRow = await screen.findByRole('treeitem', { name: 'Other Folder' });
    fireEvent.click(otherRow);
    fireEvent.click(screen.getByRole('button', { name: 'Move' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't move a folder into its own subfolder",
    );
  });
});
