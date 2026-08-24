import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserMenu } from './UserMenu';

const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { signOut: vi.fn() } },
}));

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/ui/toast', () => ({
  toast: { add: vi.fn() },
}));

function renderMenu(queryClient = new QueryClient()) {
  render(
    <QueryClientProvider client={queryClient}>
      <UserMenu />
    </QueryClientProvider>,
  );
  return { queryClient };
}

async function openMenuAndClickSignOut() {
  const trigger = screen.getByRole('button', { name: /signed in as/i });
  fireEvent.click(trigger);
  const item = await screen.findByRole('menuitem', { name: /sign out/i });
  fireEvent.click(item);
}

describe('UserMenu', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { useAuth } = await import('@/lib/auth');
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1', email: 'anna@example.com' } as never,
      session: {} as never,
      loading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('renders nothing when there is no signed-in user', async () => {
    const { useAuth } = await import('@/lib/auth');
    vi.mocked(useAuth).mockReturnValue({ user: null, session: null, loading: false });

    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <UserMenu />
      </QueryClientProvider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the signed-in email, and the Sign out item activates via the keyboard', async () => {
    const { supabase } = await import('@/lib/supabase');
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({ error: null } as never);
    renderMenu();

    // A real, focusable, keyboard-operable trigger — not a div pretending
    // to be a button.
    const trigger = screen.getByRole('button', { name: /signed in as anna@example\.com/i });
    expect(trigger.tagName).toBe('BUTTON');
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    fireEvent.click(trigger);

    const item = await screen.findByRole('menuitem', { name: /sign out/i });
    expect(item).toBeInTheDocument();

    fireEvent.keyDown(item, { key: 'Enter' });

    await waitFor(() => expect(supabase.auth.signOut).toHaveBeenCalledTimes(1));
  });

  it('calls supabase.auth.signOut and clears the entire query cache, not just the session', async () => {
    const { supabase } = await import('@/lib/supabase');
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({ error: null } as never);

    const queryClient = new QueryClient();
    queryClient.setQueryData(['data-rooms'], [{ id: 'room-1' }]);
    queryClient.setQueryData(['node', 'node-1'], { id: 'node-1' });
    expect(queryClient.getQueryData(['data-rooms'])).toBeDefined();

    renderMenu(queryClient);
    await openMenuAndClickSignOut();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    // Assert on the cache itself, not just that a clear function was invoked:
    // no query the previous user populated may still resolve to data.
    expect(queryClient.getQueryData(['data-rooms'])).toBeUndefined();
    expect(queryClient.getQueryData(['node', 'node-1'])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it('surfaces an error when signOut() resolves with an error, but still clears the cache and redirects', async () => {
    const { supabase } = await import('@/lib/supabase');
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({
      error: new Error('network unreachable'),
    } as never);

    const queryClient = new QueryClient();
    queryClient.setQueryData(['data-rooms'], [{ id: 'room-1' }]);

    renderMenu(queryClient);
    await openMenuAndClickSignOut();

    const { toast } = await import('@/components/ui/toast');
    await waitFor(() => expect(toast.add).toHaveBeenCalledTimes(1));
    expect(toast.add).toHaveBeenCalledWith(expect.objectContaining({ type: 'error' }));

    // The user must not be left looking signed in: cache still clears and
    // the app still navigates away, even though the network call failed.
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(queryClient.getQueryData(['data-rooms'])).toBeUndefined();
  });

  it('surfaces an error when signOut() rejects outright', async () => {
    const { supabase } = await import('@/lib/supabase');
    vi.mocked(supabase.auth.signOut).mockRejectedValueOnce(new Error('offline'));

    const queryClient = new QueryClient();
    queryClient.setQueryData(['data-rooms'], [{ id: 'room-1' }]);

    renderMenu(queryClient);
    await openMenuAndClickSignOut();

    const { toast } = await import('@/components/ui/toast');
    await waitFor(() => expect(toast.add).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(queryClient.getQueryData(['data-rooms'])).toBeUndefined();
  });
});
