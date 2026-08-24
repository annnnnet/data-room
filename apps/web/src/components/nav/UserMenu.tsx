'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { toast } from '@/components/ui/toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * The only sign-out affordance in the app. Rendered wherever a signed-in
 * user works (data room list, folder browser) — never in `/s/[token]`,
 * which is anonymous and has no session to sign out of.
 *
 * Clearing the TanStack Query cache on sign-out isn't optional cleanup:
 * without it, the previous user's cached rooms/folders/files stay in
 * memory and flash on screen for whoever signs in next on this browser.
 * That has to happen even if `supabase.auth.signOut()` itself fails —
 * a network hiccup or an already-expired session must never leave the
 * button looking like it did nothing, and must never leave stale data
 * sitting in the cache under a session that's gone either way.
 */
export function UserMenu() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);

  if (!user) return null;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (err) {
      toast.add({
        title: "Couldn't fully sign out",
        description:
          err instanceof Error
            ? err.message
            : 'Signed you out on this device, but the server may still see your session as active.',
        type: 'error',
      });
    } finally {
      // Always run, even after a failed signOut() call: a stale session
      // must never leave another user's cached data visible to whoever
      // signs in next, and the user must never be stuck looking signed in
      // when the button visibly did something.
      queryClient.clear();
      setSigningOut(false);
      router.replace('/login');
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
        Signed in as {user.email}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleSignOut()} disabled={signingOut}>
          <LogOut aria-hidden="true" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
