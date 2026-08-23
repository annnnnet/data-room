'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, File as FileIcon } from 'lucide-react';
import type { NodeDetail } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes } from '@/lib/format';

type DownloadUrlResponse = { url: string };

/**
 * A share can point straight at a file, not just a folder — this is that
 * landing page. Deliberately smaller than the owner's `FileViewerSheet`:
 * read-only, no version history (there's nothing to restore), just a
 * preview and a download.
 */
export function SharedFileView({ node, dataRoomName }: { node: NodeDetail; dataRoomName: string }) {
  const isPdf = node.mimeType === 'application/pdf';

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        Shared with you · {dataRoomName}
      </div>
      <div className="flex items-center gap-2">
        <FileIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h1 className="truncate text-base font-medium" title={node.name}>
          {node.name}
        </h1>
        <span className="shrink-0 text-sm text-muted-foreground">
          {node.sizeBytes != null ? formatBytes(node.sizeBytes) : ''}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
        {isPdf ? (
          inline.isPending ? (
            <div className="h-full w-full p-4">
              <Skeleton className="h-full min-h-64 w-full" />
            </div>
          ) : inline.isError ? (
            <div className="flex h-full items-center justify-center p-6">
              <ErrorState
                message={
                  inline.error instanceof ApiError ? inline.error.message : 'Could not load a preview.'
                }
                onRetry={() => inline.refetch()}
              />
            </div>
          ) : (
            <iframe src={inline.data.url} className="h-full min-h-[60vh] w-full border-0" title={node.name} />
          )
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
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
        )}
      </div>
    </div>
  );
}
