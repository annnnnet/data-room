'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { NodeDto } from '@data-room/shared';
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
import { useNodeMutations } from '@/hooks/use-node-mutations';

export function RenameDialog({
  node,
  parentId,
  open,
  onOpenChange,
}: {
  node: NodeDto;
  parentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState(node.name);
  const [error, setError] = useState<string | null>(null);
  const [suggestedName, setSuggestedName] = useState<string | null>(null);
  const { rename } = useNodeMutations(parentId);

  // The field always starts from the current name, whichever node the
  // dialog is opened for — a stale value from the previously renamed node
  // must never flash before this effect runs.
  useEffect(() => {
    if (open) {
      setName(node.name);
      setError(null);
      setSuggestedName(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, node.id]);

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setError(null);
      setSuggestedName(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || trimmed === node.name || rename.isPending) return;
    setError(null);
    setSuggestedName(null);
    rename.mutate(
      { id: node.id, name: trimmed },
      {
        onSuccess: () => handleOpenChange(false),
        onError: (err) => {
          if (err instanceof ApiError && err.code === 'NAME_CONFLICT') {
            setError(err.message);
            const suggestion = err.details?.suggestedName;
            setSuggestedName(typeof suggestion === 'string' ? suggestion : null);
          } else {
            setError(err instanceof ApiError ? err.message : 'Could not rename this item. Try again.');
          }
        },
      },
    );
  }

  const trimmed = name.trim();
  const submitDisabled = rename.isPending || trimmed.length === 0 || trimmed === node.name;
  const label = node.type === 'FOLDER' ? 'folder' : 'file';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Rename {label}</DialogTitle>
            <DialogDescription>Choose a new name for &ldquo;{node.name}&rdquo;.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="rename-name">Name</Label>
            <Input
              id="rename-name"
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
                setSuggestedName(null);
              }}
              disabled={rename.isPending}
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
              {rename.isPending ? 'Renaming…' : 'Rename'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
