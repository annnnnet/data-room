'use client';

import { useQuery } from '@tanstack/react-query';
import type { NodeDetail } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import { useShareContext } from '@/hooks/use-share-context';
import { PageSpinner } from '@/components/states/PageSpinner';
import { ErrorState } from '@/components/states/ErrorState';
import { FolderBrowser } from '@/components/browser/FolderBrowser';
import { SharedFileView } from '@/components/share/SharedFileView';

/**
 * Backs both `/s/[token]` (`nodeId: null` — the share's own root) and
 * `/s/[token]/f/[...nodeId]` (browsing into a subfolder of it). Every
 * failure state here is the only impression a stranger following a bad or
 * dead link ever gets, so each gets its own clear message — never a raw
 * error or a blank frame.
 */
export function ShareBrowserContent({ token, nodeId }: { token: string; nodeId: string | null }) {
  const ctx = useShareContext(token);

  if (ctx.isPending) return <PageSpinner />;

  if (ctx.isError) {
    const gone = ctx.error instanceof ApiError && ctx.error.code === 'NODE_GONE';
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <ErrorState
          title={gone ? 'This item was deleted' : 'This link is no longer active'}
          message={
            gone
              ? 'The owner removed it. Ask them for a new link.'
              : 'It was revoked or has expired. Ask the owner for a new one.'
          }
        />
      </div>
    );
  }

  const context = ctx.data;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      {nodeId === null ? (
        <ShareRoot token={token} rootNodeId={context.rootNodeId} dataRoomName={context.dataRoomName} />
      ) : (
        <FolderBrowser
          token={token}
          nodeId={nodeId}
          readOnly
          shareRootId={context.rootNodeId}
          banner={`Shared with you · ${context.dataRoomName}`}
        />
      )}
    </div>
  );
}

/**
 * The share's own root can be a file, not just a folder — `ShareContext`
 * doesn't carry the node type, so this checks it the same way
 * `FolderBrowser` would (`GET /api/nodes/:id`, same query key, so this
 * never doubles the request) and branches before deciding what to render.
 */
function ShareRoot({
  token,
  rootNodeId,
  dataRoomName,
}: {
  token: string;
  rootNodeId: string;
  dataRoomName: string;
}) {
  const detail = useQuery({
    queryKey: ['node', rootNodeId],
    queryFn: () => api.get<NodeDetail>(`/api/nodes/${rootNodeId}`),
  });

  if (detail.data?.type === 'FILE') {
    return <SharedFileView node={detail.data} dataRoomName={dataRoomName} />;
  }

  return (
    <FolderBrowser
      token={token}
      nodeId={rootNodeId}
      readOnly
      shareRootId={rootNodeId}
      banner={`Shared with you · ${dataRoomName}`}
    />
  );
}
