'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import type { DataRoomDto } from '@data-room/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageSpinner } from '@/components/states/PageSpinner';
import { ErrorState } from '@/components/states/ErrorState';
import { FolderBrowser } from '@/components/browser/FolderBrowser';

/**
 * The URL only ever carries a node id when the visitor has navigated into a
 * subfolder — `/r/[roomId]/f` with no id means "show the room's root". That
 * root id isn't in the URL, so it's resolved from `GET /api/data-rooms`
 * (there's no single-room-by-id endpoint), same list the "/" page already
 * fetches and caches under `['data-rooms']`.
 */
export function RoomBrowserContent({ roomId, nodeId }: { roomId: string; nodeId: string | null }) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const rooms = useQuery({
    queryKey: ['data-rooms'],
    queryFn: () => api.get<DataRoomDto[]>('/api/data-rooms'),
    enabled: !!user && nodeId === null,
  });

  if (authLoading) return <PageSpinner />;
  if (!user) return null;

  let resolvedNodeId = nodeId;
  let body: React.ReactNode = null;

  if (resolvedNodeId === null) {
    if (rooms.isPending) {
      body = <PageSpinner />;
    } else if (rooms.isError) {
      body = <ErrorState message="Could not load this data room." onRetry={() => rooms.refetch()} />;
    } else {
      const room = rooms.data.find((r) => r.id === roomId);
      if (!room) {
        body = (
          <ErrorState
            title="Not found"
            message="This data room doesn't exist or you no longer have access."
          />
        );
      } else {
        resolvedNodeId = room.rootNodeId;
      }
    }
  }

  if (resolvedNodeId !== null) {
    body = <FolderBrowser roomId={roomId} nodeId={resolvedNodeId} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <Link
        href="/"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Data rooms
      </Link>
      {body}
    </div>
  );
}
