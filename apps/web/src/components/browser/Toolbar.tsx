'use client';

import { useState, type FormEvent } from 'react';
import { FolderPlus } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { useNodeMutations } from '@/hooks/use-node-mutations';

/**
 * Upload, search, and share all belong to later tasks (they need real
 * flows — a drop zone with progress, a results list, a link/permission
 * form) so this only ships "New folder", which is a complete flow start to
 * finish. Hidden entirely in `readOnly` — there's nothing left to show.
 */
export function Toolbar({ parentId, readOnly }: { parentId: string; readOnly: boolean }) {
  if (readOnly) return null;
  return <NewFolderButton parentId={parentId} />;
}

function NewFolderButton({ parentId }: { parentId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { createFolder } = useNodeMutations(parentId);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give the folder a name.');
      return;
    }
    setError(null);
    createFolder.mutate(trimmed, {
      onSuccess: () => {
        toast.add({ title: 'Folder created', type: 'success' });
        setOpen(false);
        setName('');
      },
      onError: (err) => {
        setError(err instanceof ApiError ? err.message : 'Could not create the folder. Try again.');
      },
    });
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setError(null);
            setName('');
          }
        }}
      >
        <DialogTrigger render={<Button variant="outline" size="sm" />}>
          <FolderPlus className="size-4" aria-hidden="true" />
          New folder
        </DialogTrigger>
        <DialogContent>
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>New folder</DialogTitle>
              <DialogDescription>Give it a name. You can rename it later.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              <Label htmlFor="folder-name">Name</Label>
              <Input
                id="folder-name"
                autoFocus
                placeholder="Financials"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={createFolder.isPending}
                aria-invalid={error ? true : undefined}
              />
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={createFolder.isPending}>
                {createFolder.isPending ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
