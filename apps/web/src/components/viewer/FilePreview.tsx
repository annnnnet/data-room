'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, File as FileIcon } from 'lucide-react';
import type { NodeDto } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes } from '@/lib/format';

type DownloadUrlResponse = { url: string };

/**
 * Preview pane shared by the owner's `FileViewerSheet` and the public
 * `SharedFileView` — used to be two near-identical copies that had already
 * drifted (the mime-normalisation fix below was applied to only one of
 * them, so a parameterised PDF type previewed for the owner and silently
 * fell to the download card for a share recipient). One component now,
 * used by both.
 *
 * PDFs get an iframe pointed at a short-lived signed inline URL; anything
 * else gets a download card instead — an iframe pointed at a .docx (or
 * similar) shows either a browser download prompt or nothing at all,
 * depending on the browser, and both read as broken.
 */
export function FilePreview({ node }: { node: NodeDto }) {
  // Storage may hand back a parameterised or differently-cased type
  // ('application/pdf; charset=binary'), and mimeType is nullable. Strip the
  // parameters before comparing — anything that is not clearly a PDF falls to
  // the download card, which is the safe branch.
  const isPdf = node.mimeType?.split(';')[0].trim().toLowerCase() === 'application/pdf';

  const inline = useQuery({
    queryKey: ['download-url', node.id, 'inline'],
    queryFn: () =>
      api.get<DownloadUrlResponse>(`/api/files/${node.id}/download-url?disposition=inline`),
    enabled: isPdf,
    retry: false,
  });

  const download = useMutation({
    mutationFn: () =>
      api.get<DownloadUrlResponse>(`/api/files/${node.id}/download-url?disposition=attachment`),
    onSuccess: (data) => {
      window.location.href = data.url;
    },
  });

  if (isPdf) {
    if (inline.isPending) {
      return (
        <div className="h-full w-full p-4">
          <Skeleton className="h-full w-full" />
        </div>
      );
    }

    if (inline.isError) {
      const isGone = inline.error instanceof ApiError && inline.error.code === 'NODE_GONE';
      return (
        <div className="flex h-full items-center justify-center p-6">
          <ErrorState
            title={isGone ? 'File no longer available' : undefined}
            message={
              isGone
                ? 'This file was deleted while you were viewing it.'
                : inline.error instanceof ApiError
                  ? inline.error.message
                  : 'Could not load a preview.'
            }
            onRetry={isGone ? undefined : () => inline.refetch()}
          />
        </div>
      );
    }

    return <iframe src={inline.data.url} className="h-full w-full border-0" title={node.name} />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-muted">
        <FileIcon className="size-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="max-w-xs space-y-1">
        <p className="truncate text-sm font-medium" title={node.name}>
          {node.name}
        </p>
        <p className="text-sm text-muted-foreground">
          {node.sizeBytes != null ? formatBytes(node.sizeBytes) : '—'}
        </p>
      </div>
      <p className="max-w-xs text-sm text-muted-foreground">
        Preview isn&apos;t available for this file type.
      </p>
      <Button type="button" onClick={() => download.mutate()} disabled={download.isPending}>
        <Download aria-hidden="true" />
        {download.isPending ? 'Preparing download…' : 'Download'}
      </Button>
      {download.isError && (
        <p role="alert" className="text-sm text-destructive">
          {download.error instanceof ApiError
            ? download.error.message
            : 'Could not download this file. Try again.'}
        </p>
      )}
    </div>
  );
}
