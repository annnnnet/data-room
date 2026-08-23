import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { Toolbar } from './Toolbar';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), del: vi.fn() },
}));

// jsdom has no ResizeObserver — cmdk's CommandList uses one for its scroll
// animation only, unrelated to what these tests check.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

function renderToolbar(readOnly: boolean) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <Toolbar
        roomId="room-1"
        basePath="/s/tok-1/f"
        parentId="folder-1"
        nodeName="Contracts"
        readOnly={readOnly}
      />
    </QueryClientProvider>,
  );
}

describe('Toolbar', () => {
  afterEach(() => {
    cleanup();
  });

  it('shows only Search for a share (readOnly) view — the API scopes search for a link principal too', () => {
    renderToolbar(true);

    expect(screen.getByRole('button', { name: /Search/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upload/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /New folder/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Share/ })).not.toBeInTheDocument();
  });

  it('ignores Ctrl+K while focus is in an unrelated text input', () => {
    renderToolbar(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const outsideInput = document.createElement('input');
    document.body.appendChild(outsideInput);
    outsideInput.focus();

    fireEvent.keyDown(outsideInput, { key: 'k', ctrlKey: true });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    document.body.removeChild(outsideInput);
  });

  it('still opens on Ctrl+K when nothing text-editable has focus', () => {
    renderToolbar(false);

    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows Search alongside every mutating control for the owner view', () => {
    renderToolbar(false);

    expect(screen.getByRole('button', { name: /Search/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upload/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /New folder/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Share/ })).toBeInTheDocument();
  });
});
