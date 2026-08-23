'use client';

import { useState, type FormEvent } from 'react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useNodeMutations } from '@/hooks/use-node-mutations';

/**
 * Controlled from the toolbar's "New folder" button — this component owns
 * no trigger of its own so it can be opened the same way Rename/Move/Delete
 * are (state flips, dialog appears), keeping all four dialogs in this
 * folder consistent with each other.
 */
export function NewFolderDialog({
  open,
  onOpenChange,
  parentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string;
}) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const { createFolder } = useNodeMutations(parentId);

  function reset() {
    setName('');
    setError(null);
    setSuggestedName(null);
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) reset();
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || createFolder.isPending) return;
    setError(null);
    setSuggestedName(null);
    createFolder.mutate(trimmed, {
      onSuccess: () => {
        toast.add({ title: 'Folder created', type: 'success' });
        handleOpenChange(false);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'NAME_CONFLICT') {
          setError(err.message);
          const suggestion = err.details?.suggestedName;
          setSuggestedName(typeof suggestion === 'string' ? suggestion : null);
        } else {
          setError(err instanceof ApiError ? err.message : 'Could not create the folder. Try again.');
        }
      },
    });
  }

  const trimmed = name.trim();
  const submitDisabled = createFolder.isPending || trimmed.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Give it a name. You can rename it later.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="new-folder-name">Name</Label>
            <Input
              id="new-folder-name"
              autoFocus
              placeholder="Financials"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
                setSuggestedName(null);
              }}
              disabled={createFolder.isPending}
              aria-invalid={error ? true : undefined}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            {suggestedName && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                className="justify-self-start"
                onClick={() => {
                  setName(suggestedName);
                  setError(null);
                  setSuggestedName(null);
                }}
              >
                Use &ldquo;{suggestedName}&rdquo;
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitDisabled}>
              {createFolder.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
