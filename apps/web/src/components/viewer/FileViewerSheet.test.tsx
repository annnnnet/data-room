import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NodeDto } from '@data-room/shared';
import { ApiError } from '@/lib/api';
import { FileViewerSheet } from './FileViewerSheet';

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

const pdfNode: NodeDto = {
  id: 'file-pdf',
  dataRoomId: 'room-1',
  parentId: 'parent-1',
  type: 'FILE',
  name: 'MSA.pdf',
  updatedAt: new Date(0).toISOString(),
  sizeBytes: 4096,
  mimeType: 'application/pdf',
  versionCount: 1,
};

const docxNode: NodeDto = {
  id: 'file-docx',
  dataRoomId: 'room-1',
  parentId: 'parent-1',
  type: 'FILE',
  name: 'Notes.docx',
  updatedAt: new Date(0).toISOString(),
  sizeBytes: 8192,
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  versionCount: 1,
};

function renderSheet(node: NodeDto, readOnly = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <FileViewerSheet
        node={node}
        parentId="parent-1"
        open
        onOpenChange={vi.fn()}
        readOnly={readOnly}
      />
    </QueryClientProvider>,
  );
}

describe('FileViewerSheet', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a download card (no iframe) for a non-PDF file', async () => {
    const { api } = await import('@/lib/api');
    // Only the versions query should ever be requested eagerly for a
    // non-PDF file — no eager download-url fetch until Download is clicked.
    vi.mocked(api.get).mockResolvedValue([]);

    renderSheet(docxNode);

    // "Notes.docx" appears both in the sheet header and the download card —
    // assert the card's contents specifically rather than the ambiguous text.
    expect(await screen.findByRole('button', { name: /Download/ })).toBeInTheDocument();
    expect(screen.getByText(/Preview isn.t available/)).toBeInTheDocument();
    expect(document.querySelector('iframe')).not.toBeInTheDocument();
  });

  it('renders an iframe for a PDF once the inline URL resolves', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes('download-url')) return { url: 'https://storage.test/signed-inline' };
      return [];
    });

    renderSheet(pdfNode);

    await waitFor(() => expect(document.querySelector('iframe')).toBeInTheDocument());
    const iframe = document.querySelector('iframe')!;
    expect(iframe).toHaveAttribute('src', 'https://storage.test/signed-inline');
    expect(iframe).toHaveAttribute('title', 'MSA.pdf');
  });

  it('renders the error inside the sheet (not an empty frame) when the inline URL fetch fails', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes('download-url')) throw new ApiError('INTERNAL', 'Storage unavailable', 500);
      return [];
    });

    renderSheet(pdfNode);

    expect(await screen.findByText('Storage unavailable')).toBeInTheDocument();
    expect(document.querySelector('iframe')).not.toBeInTheDocument();
    // Still inside the sheet's dialog, not a bare page.
    expect(screen.getByRole('dialog')).toContainElement(screen.getByText('Storage unavailable'));
  });

  it('gives NODE_GONE its own message, distinct from a generic failure, and no retry', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes('download-url')) throw new ApiError('NODE_GONE', 'Gone', 404);
      return [];
    });

    renderSheet(pdfNode);

    expect(await screen.findByText(/deleted while you were viewing/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Try again/i })).not.toBeInTheDocument();
  });

  it('hides Restore in the Versions tab when readOnly', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes('download-url')) return { url: 'https://storage.test/signed-inline' };
      return [
        {
          id: 'v1',
          versionNumber: 1,
          sizeBytes: 1024,
          mimeType: 'application/pdf',
          createdAt: new Date(0).toISOString(),
          createdByName: 'Bob',
          isCurrent: true,
        },
      ];
    });

    renderSheet(pdfNode, true);

    fireEvent.click(screen.getByRole('tab', { name: 'Versions' }));
    await screen.findByText('Version 1');
    expect(screen.queryByRole('button', { name: /Restore/ })).not.toBeInTheDocument();
  });

  it('downloads a non-PDF file via a signed attachment URL on click', async () => {
    const { api } = await import('@/lib/api');
    vi.mocked(api.get).mockImplementation(async (path: unknown) => {
      const p = String(path);
      if (p.includes('download-url')) return { url: 'https://storage.test/signed-attachment' };
      return [];
    });

    // jsdom throws "Not implemented" navigating window.location — stub it.
    const originalLocation = window.location;
    // @ts-expect-error -- test override
    delete window.location;
    // @ts-expect-error -- test override
    window.location = { href: '' };

    renderSheet(docxNode);
    fireEvent.click(await screen.findByRole('button', { name: /Download/ }));

    await waitFor(() => expect(window.location.href).toBe('https://storage.test/signed-attachment'));
    expect(api.get).toHaveBeenCalledWith('/api/files/file-docx/download-url?disposition=attachment');

    // @ts-expect-error -- test override
    window.location = originalLocation;
  });
});
