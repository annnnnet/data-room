'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NodeDto, NodeStats } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
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
import { formatBytes } from '@/lib/format';
import { useNodeMutations } from '@/hooks/use-node-mutations';

/**
 * The subtree warning: a folder delete calls `/stats` when the dialog opens
 * and states concretely what disappears (file/folder counts, total size)
 * rather than ever showing a count of zero while that's still loading —
 * a zero here would actively mislead about what's about to be destroyed.
 */
export function DeleteDialog({
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
  const [error, setError] = useState<string | null>(null);
  const { remove } = useNodeMutations(parentId);

  const stats = useQuery({
    queryKey: ['stats', node.id],
    queryFn: () => api.get<NodeStats>(`/api/nodes/${node.id}/stats`),
    enabled: open && node.type === 'FOLDER',
  });

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) setError(null);
  }

  const summary =
    node.type === 'FILE'
      ? 'This file and all of its versions will be permanently removed.'
      : stats.isLoading
        ? 'Checking what this folder contains…'
        : stats.isError
          ? "Couldn't check what this folder contains."
          : `${stats.data!.fileCount} file(s) and ${stats.data!.folderCount} folder(s) (${formatBytes(stats.data!.totalBytes)}) will be permanently removed.`;

  const statsBlocking = node.type === 'FOLDER' && (stats.isLoading || stats.isError);

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{node.name}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            {summary} Anyone you shared it with will lose access immediately. This can&apos;t be
            undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={statsBlocking || remove.isPending}
            onClick={() => {
              setError(null);
              remove.mutate(
                { id: node.id },
                {
                  onSuccess: () => handleOpenChange(false),
                  onError: (err) => {
                    setError(
                      err instanceof ApiError ? err.message : 'Could not delete this item. Try again.',
                    );
                  },
                },
              );
            }}
          >
            {remove.isPending ? 'Deleting…' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
