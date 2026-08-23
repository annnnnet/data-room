'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Link2 } from 'lucide-react';
import type { ShareDto } from '@data-room/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { TableSkeleton } from '@/components/states/TableSkeleton';
import { ErrorState } from '@/components/states/ErrorState';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ExpiryChoice = 'never' | '7' | '30';

const EXPIRY_OPTIONS: { value: ExpiryChoice; label: string; days: number | null }[] = [
  { value: 'never', label: 'Never', days: null },
  { value: '7', label: '7 days', days: 7 },
  { value: '30', label: '30 days', days: 30 },
];

/**
 * The money screen: creating a link, copying it, and revoking it. There is
 * no "update" endpoint on the API — a link's expiry is fixed at creation —
 * so the expiry choice is offered before creating, and a live link shows
 * its expiry as read-only fact; changing it means revoking and creating a
 * fresh one (a new token), never a silent swap.
 */
export function LinkTab({ nodeId }: { nodeId: string }) {
  const qc = useQueryClient();
  const key = ['shares', nodeId];
  const shares = useQuery({
    queryKey: key,
    queryFn: () => api.get<ShareDto[]>(`/api/nodes/${nodeId}/shares`),
  });

  const [copied, setCopied] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expiry, setExpiry] = useState<ExpiryChoice>('never');
  const [createError, setCreateError] = useState<string | null>(null);

  // The UI only ever offers to create one link share per node (the "create"
  // form below is hidden once any exists), but nothing server-side actually
  // enforces that as an invariant, so this must tolerate more than one
  // somehow existing (e.g. two racing "Create link" clicks). `shares.data`
  // is already ordered newest-first (see the API), so this manages the most
  // recently created one — any older extra survives as a live, functioning
  // link, just not one this tab surfaces a Revoke button for.
  const link = shares.data?.find((s) => s.kind === 'LINK');

  const create = useMutation({
    mutationFn: (expiresAt: string | undefined) =>
      api.post<ShareDto>(`/api/nodes/${nodeId}/shares`, {
        kind: 'LINK',
        ...(expiresAt ? { expiresAt } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setCreateError(null);
    },
    onError: (err) => {
      setCreateError(err instanceof ApiError ? err.message : 'Could not create the link. Try again.');
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/api/shares/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setConfirmOpen(false);
      toast.add({ title: 'Link revoked', type: 'success' });
    },
    onError: (err) => {
      toast.add({
        title: err instanceof ApiError ? err.message : 'Could not revoke the link. Try again.',
        type: 'error',
      });
    },
  });

  function handleCreate() {
    setCreateError(null);
    const opt = EXPIRY_OPTIONS.find((o) => o.value === expiry);
    const expiresAt = opt?.days ? new Date(Date.now() + opt.days * 86_400_000).toISOString() : undefined;
    create.mutate(expiresAt);
  }

  if (shares.isPending) return <TableSkeleton variant="rows" rows={2} label="Loading link" />;
  if (shares.isError) {
    return (
      <ErrorState message="Could not load this folder's link." onRetry={() => shares.refetch()} />
    );
  }

  if (!link) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Anyone with the link can view this folder and everything inside it — no sign-in
          required.
        </p>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="link-expiry">Expires</Label>
          <select
            id="link-expiry"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value as ExpiryChoice)}
            disabled={create.isPending}
            className="h-8 w-40 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" onClick={handleCreate} disabled={create.isPending} className="self-start">
          <Link2 aria-hidden="true" />
          {create.isPending ? 'Creating…' : 'Create link'}
        </Button>
        {createError && (
          <p role="alert" className="text-sm text-destructive">
            {createError}
          </p>
        )}
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = `${origin}/s/${link.token}`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.add({ title: 'Could not copy the link', type: 'error' });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Anyone with this link can view this folder and everything inside it.
      </p>

      <div className="flex items-center gap-2">
        <Label htmlFor="share-link-url" className="sr-only">
          Share link
        </Label>
        <Input
          id="share-link-url"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={handleCopy}
          aria-label="Copy link"
        >
          {copied ? (
            <Check className="text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          ) : (
            <Copy aria-hidden="true" />
          )}
        </Button>
      </div>
      {/* A fixed-height live region, not a text node holding a literal
          space — the height (one line of `text-xs`) is what reserves the
          layout slot; the content itself stays genuinely empty until
          there's something to announce. */}
      <p role="status" className="-mt-2 h-4 text-xs text-muted-foreground">
        {copied ? 'Copied to clipboard' : null}
      </p>

      <p className="text-sm text-muted-foreground">
        {link.expiresAt
          ? `Expires ${new Date(link.expiresAt).toLocaleDateString()}`
          : 'Never expires'}
      </p>

      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="self-start"
        onClick={() => setConfirmOpen(true)}
      >
        Revoke link
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke this link?</AlertDialogTitle>
            <AlertDialogDescription>
              Access ends immediately for anyone holding this link. This can&apos;t be undone —
              sharing again means a brand new link.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revoke.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => revoke.mutate(link.id)}
            >
              {revoke.isPending ? 'Revoking…' : 'Revoke'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
