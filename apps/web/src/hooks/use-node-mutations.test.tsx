import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { useNodeMutations } from './use-node-mutations';

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

vi.mock('@/components/ui/toast', () => ({
  toast: { add: vi.fn() },
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useNodeMutations toast behaviour on failure', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('raises the global error toast by default — the only feedback for callers with no dialog', async () => {
    const { api } = await import('@/lib/api');
    const { toast } = await import('@/components/ui/toast');
    vi.mocked(api.patch).mockRejectedValueOnce(new ApiError('INTERNAL', 'Rename failed', 500));

    const { result } = renderHook(() => useNodeMutations('parent-1'), { wrapper });

    result.current.rename.mutate({ id: 'node-1', name: 'New name' });

    await waitFor(() => expect(result.current.rename.isError).toBe(true));

    expect(toast.add).toHaveBeenCalledTimes(1);
    expect(toast.add).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Rename failed', type: 'error' }),
    );
  });

  it('suppresses the toast when the caller opts out — the dialogs render the same failure inline instead', async () => {
    const { api } = await import('@/lib/api');
    const { toast } = await import('@/components/ui/toast');
    vi.mocked(api.patch).mockRejectedValueOnce(new ApiError('INTERNAL', 'Rename failed', 500));

    const { result } = renderHook(() => useNodeMutations('parent-1', { toastOnError: false }), {
      wrapper,
    });

    result.current.rename.mutate({ id: 'node-1', name: 'New name' });

    await waitFor(() => expect(result.current.rename.isError).toBe(true));

    expect(toast.add).not.toHaveBeenCalled();
  });
});
