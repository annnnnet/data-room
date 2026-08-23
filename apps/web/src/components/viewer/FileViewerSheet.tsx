'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Download, File as FileIcon } from 'lucide-react';
import type { NodeDto } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/states/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes } from '@/lib/format';
import { VersionHistoryList } from './VersionHistoryList';

type DownloadUrlResponse = { url: string };

/**
 * Preview pane. PDFs get an iframe pointed at a short-lived signed inline
 * URL; anything else gets a download card instead — an iframe pointed at a
 * .docx (or similar) shows either a browser download prompt or nothing at
 * all, depending on the browser, and both read as broken.
 */
function FilePreview({ node }: { node: NodeDto }) {
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

export function FileViewerSheet({
  node,
  parentId,
  open,
  onOpenChange,
  readOnly,
}: {
  node: NodeDto;
  /** Parent folder id — restore invalidates this folder's listing so the row's size/date update. */
  parentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** No Restore button at all when set — reused by the public share view. */
  readOnly: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="border-b pr-10">
          <SheetTitle className="truncate" title={node.name}>
            {node.name}
          </SheetTitle>
          <SheetDescription>
            {node.sizeBytes != null ? formatBytes(node.sizeBytes) : '—'}
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-4 mt-3 w-fit shrink-0">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="versions">Versions</TabsTrigger>
          </TabsList>
          <TabsContent value="preview" className="mt-3 min-h-0 flex-1">
            <FilePreview node={node} />
          </TabsContent>
          <TabsContent value="versions" className="min-h-0 flex-1 overflow-y-auto">
            <VersionHistoryList node={node} parentId={parentId} readOnly={readOnly} />
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
