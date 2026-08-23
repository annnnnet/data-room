import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { NodeDetail } from '@data-room/shared';
import { useNodeGoneRedirect } from './use-node-gone-redirect';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number) {
      super(message);
      this.code = code;
      this.status = status;
    }
  },
  api: { get: vi.fn() },
}));

vi.mock('@/components/ui/toast', () => ({ toast: { add: vi.fn() } }));

function Probe(props: Parameters<typeof useNodeGoneRedirect>[0]) {
  const state = useNodeGoneRedirect(props);
  return <div data-testid="state">{state}</div>;
}

function crumb(id: string): { id: string; name: string } {
  return { id, name: `Folder ${id}` };
}

const baseDetail: Omit<NodeDetail, 'breadcrumbs'> = {
  id: 'root-id',
  dataRoomId: 'room-1',
  parentId: null,
  type: 'FOLDER',
  name: 'Shared Root',
  updatedAt: new Date(0).toISOString(),
  sizeBytes: null,
  mimeType: null,
  versionCount: null,
  myRole: 'VIEWER',
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  replace.mockClear();
});

describe('useNodeGoneRedirect (IMPORTANT-5 regression)', () => {
  it('goes terminal instead of redirecting when the gone node is the top of the (trimmed) chain — a share root 410ing', async () => {
    // Exactly what FolderBrowser passes when the share's own root 410s:
    // trimBreadcrumbsToRoot has already cut the chain down to just the root
    // itself, so there is nothing above it to fall back to.
    const lastKnown: NodeDetail = { ...baseDetail, breadcrumbs: [crumb('root-id')] };

    render(<Probe basePath="/s/tok/f" active lastKnown={lastKnown} />);

    await waitFor(() => expect(screen.getByTestId('state')).toHaveTextContent('gone'));

    // The critical assertion: no redirect was ever issued. A redirect to
    // `basePath` here would resolve straight back to the same dead root and
    // repeat — this is exactly what used to loop.
    expect(replace).not.toHaveBeenCalled();
  });

  it('still walks outward and redirects when there is a live ancestor to fall back to', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockResolvedValueOnce({ id: 'legal-id' });

    const lastKnown: NodeDetail = {
      ...baseDetail,
      id: 'contracts-id',
      breadcrumbs: [crumb('legal-id'), crumb('contracts-id')],
    };

    render(<Probe basePath="/s/tok/f" active lastKnown={lastKnown} />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/s/tok/f/legal-id'));
  });
});
