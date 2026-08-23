'use client';

import { Loader2 } from 'lucide-react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { NodeDetail } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import { PageSpinner } from '@/components/states/PageSpinner';
import { ErrorState } from '@/components/states/ErrorState';
import { useNodeGoneRedirect } from '@/hooks/use-node-gone-redirect';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { UploadDropzone } from '@/components/upload/UploadDropzone';
import { Breadcrumbs } from './Breadcrumbs';
import { Toolbar } from './Toolbar';
import { NodeTable } from './NodeTable';

/**
 * The folder browser. Renders the owner view (mutating controls shown) and,
 * unchanged, the public share view in a later task (`readOnly`, mutating
 * controls not rendered at all).
 */
export function FolderBrowser({
  roomId,
  nodeId,
  readOnly = false,
}: {
  roomId: string;
  nodeId: string;
  readOnly?: boolean;
}) {
  const detail = useQuery({
    queryKey: ['node', nodeId],
    queryFn: () => api.get<NodeDetail>(`/api/nodes/${nodeId}`),
    // Keeps the previously-viewed folder's data on screen while a new
    // folder's detail loads, so navigating never has to tear the chrome
    // down to nothing first — only a genuine first load of the route (no
    // cached data at all yet) falls through to `isPending` below.
    placeholderData: keepPreviousData,
  });

  const isGone =
    detail.isError && detail.error instanceof ApiError && detail.error.code === 'NODE_GONE';
  const goneState = useNodeGoneRedirect({
    roomId,
    active: isGone,
    lastKnown: isGone ? detail.data : undefined,
  });

  useDocumentTitle(!isGone ? detail.data?.name : undefined);

  if (detail.isPending) return <PageSpinner />;

  if (isGone) {
    return (
      <div
        className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center"
        role="status"
      >
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <p className="max-w-sm text-sm text-muted-foreground">
          This folder was deleted by the owner.{' '}
          {goneState === 'checking' ? 'Looking for where to take you…' : 'Redirecting…'}
        </p>
      </div>
    );
  }

  if (detail.isError) {
    if (detail.error instanceof ApiError && detail.error.status === 404) {
      return (
        <ErrorState
          title="Not found"
          message="This item doesn't exist or you no longer have access."
        />
      );
    }
    return (
      <ErrorState
        message={detail.error instanceof ApiError ? detail.error.message : undefined}
        onRetry={() => detail.refetch()}
      />
    );
  }

  const node = detail.data;

  return (
    <UploadDropzone parentId={nodeId} readOnly={readOnly}>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        <div
          className={`flex flex-wrap items-center justify-between gap-3 transition-opacity ${
            detail.isFetching ? 'opacity-70' : ''
          }`}
        >
          <Breadcrumbs roomId={roomId} breadcrumbs={node.breadcrumbs} />
          {/* `nodeId`, not `node.id`: the folder being viewed is known from the
              route immediately, so the toolbar and table don't wait on this
              query — they mount (and, for the table, show their own loading
              treatment) right away instead of blanking with the rest of the
              page. */}
          <Toolbar parentId={nodeId} readOnly={readOnly} />
        </div>
        <NodeTable
          roomId={roomId}
          parentId={nodeId}
          readOnly={readOnly}
          root={node.breadcrumbs[0] ?? { id: nodeId, name: node.name }}
        />
      </div>
    </UploadDropzone>
  );
}
