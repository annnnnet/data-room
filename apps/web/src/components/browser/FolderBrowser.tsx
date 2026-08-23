'use client';

import { useQuery } from '@tanstack/react-query';
import type { NodeDetail } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import { PageSpinner } from '@/components/states/PageSpinner';
import { ErrorState } from '@/components/states/ErrorState';
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
  });

  if (detail.isPending) return <PageSpinner />;

  if (detail.isError) {
    if (detail.error instanceof ApiError && detail.error.code === 'NODE_GONE') {
      // `detail.data` is whatever was last fetched successfully for this id
      // — react-query keeps it around alongside the new error. That's the
      // only place a parent id can come from once the node itself 404s.
      const parentId = detail.data?.parentId ?? null;
      return (
        <ErrorState
          title="This folder was deleted"
          message="The owner removed it while you were viewing."
          action={{
            label: parentId ? 'Go to parent folder' : 'Back to data room',
            href: parentId ? `/r/${roomId}/f/${parentId}` : `/r/${roomId}/f`,
          }}
        />
      );
    }
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
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs roomId={roomId} breadcrumbs={node.breadcrumbs} />
        <Toolbar parentId={node.id} readOnly={readOnly} />
      </div>
      <NodeTable roomId={roomId} parentId={node.id} readOnly={readOnly} />
    </div>
  );
}
