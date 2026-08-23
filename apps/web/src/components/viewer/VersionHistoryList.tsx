'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FileVersionDto, NodeDto } from '@data-room/shared';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes, formatRelative } from '@/lib/format';

/**
 * "Who changed what, when" for a file. Only READY versions ever come back
 * from the API, so every row here is something a viewer could actually
 * restore or has actually seen download — there's no PENDING/half-uploaded
 * noise to filter client-side.
 */
export function VersionHistoryList({
  node,
  parentId,
  readOnly,
}: {
  node: NodeDto;
  parentId: string;
  readOnly: boolean;
}) {
  const qc = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<FileVersionDto | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const versions = useQuery({
    queryKey: ['versions', node.id],
    queryFn: () => api.get<FileVersionDto[]>(`/api/files/${node.id}/versions`),
  });

  // Restore is additive on the server (a new version is created pointing at
  // the old bytes) — invalidating rather than optimistically patching keeps
  // this component honest about the version numbers it doesn't yet know.
  const restore = useMutation({
    mutationFn: (versionNumber: number) =>
      api.post(`/api/files/${node.id}/versions/${versionNumber}/restore`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['versions', node.id] });
      qc.invalidateQueries({ queryKey: ['children', parentId] });
      setRestoreTarget(null);
    },
    onError: (err) => {
      setRestoreError(
        err instanceof ApiError ? err.message : 'Could not restore this version. Try again.',
      );
    },
  });

  function closeConfirm(next: boolean) {
    if (!next) {
      setRestoreTarget(null);
      setRestoreError(null);
    }
  }

  if (versions.isPending) {
    return (
      <div className="space-y-2 p-4" aria-busy="true" aria-label="Loading version history">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (versions.isError) {
    const isGone = versions.error instanceof ApiError && versions.error.code === 'NODE_GONE';
    return (
      <div className="p-4">
        <ErrorState
          title={isGone ? 'File no longer available' : undefined}
          message={
            isGone
              ? 'This file was deleted while you were viewing it.'
              : versions.error instanceof ApiError
                ? versions.error.message
                : 'Could not load version history.'
          }
          onRetry={isGone ? undefined : () => versions.refetch()}
        />
      </div>
    );
  }

  return (
    <>
      <ul aria-label="Version history" className="divide-y">
        {versions.data.map((v) => (
          <li key={v.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Version {v.versionNumber}</span>
                {v.isCurrent && <Badge variant="secondary">Current</Badge>}
              </div>
              <p className="truncate text-sm text-muted-foreground">
                {formatBytes(v.sizeBytes)} · {v.createdByName ?? 'Unknown'} ·{' '}
                <span title={new Date(v.createdAt).toLocaleString()}>{formatRelative(v.createdAt)}</span>
              </p>
            </div>
            {!readOnly && !v.isCurrent && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  setRestoreError(null);
                  setRestoreTarget(v);
                }}
              >
                Restore
              </Button>
            )}
          </li>
        ))}
      </ul>

      <AlertDialog open={restoreTarget != null} onOpenChange={closeConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version {restoreTarget?.versionNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This creates a new version with version {restoreTarget?.versionNumber}&apos;s
              contents — nothing currently in the history is deleted or overwritten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {restoreError && (
            <p role="alert" className="text-sm text-destructive">
              {restoreError}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restore.isPending}
              onClick={() => {
                if (restoreTarget) restore.mutate(restoreTarget.versionNumber);
              }}
            >
              {restore.isPending ? 'Restoring…' : 'Restore'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
