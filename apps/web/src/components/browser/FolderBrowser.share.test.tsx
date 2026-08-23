import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FolderBrowser } from './FolderBrowser';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/s/the-token/f/contracts-id',
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * Proves IMPORTANT-2/3 end to end at the component that actually renders
 * breadcrumb links: the API is stubbed to return the full, untrimmed
 * ancestor chain (as the pre-fix server always did — see IMPORTANT-4), and
 * this asserts the share view never turns any ancestor above the share root
 * into a clickable (or even visible) breadcrumb. Deleting
 * `trimBreadcrumbsToRoot`'s call site in `FolderBrowser` should make this
 * fail.
 */
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
      get: vi.fn((path: string) => {
        if (path === '/api/nodes/contracts-id') {
          return Promise.resolve({
            id: 'contracts-id',
            dataRoomId: 'room-1',
            parentId: 'legal-id',
            type: 'FOLDER',
            name: 'Contracts',
            updatedAt: new Date().toISOString(),
            sizeBytes: null,
            mimeType: null,
            versionCount: null,
            myRole: 'VIEWER',
            // The full, untrimmed chain — exactly what the API sends today
            // (IMPORTANT-4 is a server-side fix not yet made). The client
            // must trim this itself before anything reaches the DOM.
            breadcrumbs: [
              { id: 'room-id', name: 'Acme Acquisition' },
              { id: 'legal-id', name: 'Legal' },
              { id: 'contracts-id', name: 'Contracts' },
            ],
          });
        }
        if (path.startsWith('/api/nodes/contracts-id/children')) {
          return Promise.resolve({ items: [], nextCursor: null });
        }
        return Promise.reject(new Error(`unexpected path: ${path}`));
      }),
      post: vi.fn(),
      patch: vi.fn(),
      del: vi.fn(),
    },
    setShareToken: vi.fn(),
  };
});

function renderShareView() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <FolderBrowser token="the-token" nodeId="contracts-id" readOnly shareRootId="legal-id" />
    </QueryClientProvider>,
  );
}

describe('FolderBrowser share view — breadcrumb trim (IMPORTANT-2/3)', () => {
  it('never renders a breadcrumb link addressing a node above the share root', async () => {
    renderShareView();

    // The share root and the current folder are visible...
    await screen.findByText('Legal');
    expect(screen.getByText('Contracts')).toBeInTheDocument();

    // ...but the grandparent above the share root must never appear, linked
    // or otherwise.
    expect(screen.queryByText('Acme Acquisition')).not.toBeInTheDocument();
    for (const link of screen.queryAllByRole('link')) {
      expect(link.getAttribute('href') ?? '').not.toContain('room-id');
    }
  });
});
