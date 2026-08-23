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
import { trimBreadcrumbsToRoot } from './breadcrumb-utils';

/**
 * The folder browser. Renders the owner view (mutating controls shown,
 * `roomId` set) and the public share view (`readOnly`, `token` set instead
 * of `roomId`) with the same component — `readOnly` alone strips the
 * toolbar, row actions, dropzone, and Share button.
 *
 * A share is reached at `/s/[token]` (and `/s/[token]/f/[...nodeId]` when
 * browsing into a subfolder), never `/r/[roomId]/...` — so links this
 * component renders must point wherever the current route actually lives.
 * `shareRootId`, when set, also trims the breadcrumb chain (and bounds the
 * deleted-ancestor walk below) to that node: a link recipient given
 * "Contracts" must never see "Acme Acquisition › Legal" above it, since the
 * folder structure itself is sensitive in a due-diligence product.
 */
export function FolderBrowser({
  roomId,
  token,
  nodeId,
  readOnly = false,
  banner,
  shareRootId,
}: {
  roomId?: string;
  token?: string;
  nodeId: string;
  readOnly?: boolean;
  banner?: string;
  shareRootId?: string;
}) {
  const basePath = token ? `/s/${token}/f` : `/r/${roomId}/f`;

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

  // Trimmed before it ever reaches the ancestor walk, not just the display —
  // so a deleted-ancestor probe in a share can't climb past the share root
  // either.
  const lastKnownTrimmed =
    isGone && detail.data
      ? {
          ...detail.data,
          breadcrumbs: shareRootId
            ? trimBreadcrumbsToRoot(detail.data.breadcrumbs, shareRootId)
            : detail.data.breadcrumbs,
        }
      : undefined;

  const goneState = useNodeGoneRedirect({
    basePath,
    active: isGone,
    lastKnown: lastKnownTrimmed,
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
  const breadcrumbs = shareRootId
    ? trimBreadcrumbsToRoot(node.breadcrumbs, shareRootId)
    : node.breadcrumbs;

  return (
    <UploadDropzone parentId={nodeId} readOnly={readOnly}>
      <div className="flex min-h-0 flex-1 flex-col gap-4">
        {banner && (
          <div className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
            {banner}
          </div>
        )}
        <div
          className={`flex flex-wrap items-center justify-between gap-3 transition-opacity ${
            detail.isFetching ? 'opacity-70' : ''
          }`}
        >
          <Breadcrumbs basePath={basePath} breadcrumbs={breadcrumbs} />
          {/* `nodeId`, not `node.id`: the folder being viewed is known from the
              route immediately, so the toolbar and table don't wait on this
              query — they mount (and, for the table, show their own loading
              treatment) right away instead of blanking with the rest of the
              page. */}
          <Toolbar parentId={nodeId} nodeName={node.name} readOnly={readOnly} />
        </div>
        <NodeTable
          basePath={basePath}
          parentId={nodeId}
          readOnly={readOnly}
          root={breadcrumbs[0] ?? { id: nodeId, name: node.name }}
        />
      </div>
    </UploadDropzone>
  );
}
