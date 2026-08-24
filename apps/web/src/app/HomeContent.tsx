'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { FolderPlus } from 'lucide-react';
import type { DataRoomDto } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { DataRoomCard } from '@/components/rooms/DataRoomCard';
import { NewDataRoomDialog } from '@/components/rooms/NewDataRoomDialog';
import { UserMenu } from '@/components/nav/UserMenu';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { PageSpinner } from '@/components/states/PageSpinner';
import { TableSkeleton } from '@/components/states/TableSkeleton';

function RoomSection({ title, rooms }: { title: string; rooms: DataRoomDto[] }) {
  if (rooms.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rooms.map((room) => (
          <DataRoomCard key={room.id} room={room} />
        ))}
      </div>
    </section>
  );
}

export function HomeContent() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  const {
    data: rooms,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['data-rooms'],
    queryFn: () => api.get<DataRoomDto[]>('/api/data-rooms'),
    enabled: !!user,
  });

  // Loading the session: show a spinner rather than a blank screen or a flash of /login.
  if (authLoading) return <PageSpinner />;
  // Redirecting an unauthenticated visitor to /login: render nothing while that happens.
  if (!user) return null;

  const owned = rooms?.filter((r) => r.isOwner) ?? [];
  const shared = rooms?.filter((r) => !r.isOwner) ?? [];
  const isEmpty = !isPending && !isError && owned.length === 0 && shared.length === 0;

  return (
    <div className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8 sm:px-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Data rooms</h1>
        </div>
        <div className="flex items-center gap-2">
          <NewDataRoomDialog />
          <UserMenu />
        </div>
      </header>

      {isPending && <TableSkeleton rows={6} label="Loading data rooms" />}

      {isError && (
        <ErrorState
          message={error instanceof ApiError ? error.message : 'Could not load your data rooms.'}
          onRetry={() => refetch()}
        />
      )}

      {isEmpty && (
        <EmptyState
          icon={FolderPlus}
          title="No data rooms yet"
          description="Create your first data room to start organizing and sharing documents securely."
          action={<NewDataRoomDialog />}
        />
      )}

      {!isPending && !isError && !isEmpty && (
        <div className="space-y-8">
          <RoomSection title="Your data rooms" rooms={owned} />
          <RoomSection title="Shared with you" rooms={shared} />
        </div>
      )}
    </div>
  );
}
