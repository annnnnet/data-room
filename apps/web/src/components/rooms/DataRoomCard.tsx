import Link from 'next/link';
import type { DataRoomDto } from '@data-room/shared';
import { FolderClosed, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { formatRelative } from '@/lib/format';

export function DataRoomCard({ room }: { room: DataRoomDto }) {
  return (
    <Link
      href={`/r/${room.id}/f`}
      className="flex flex-col gap-3 rounded-lg border p-4 outline-none transition-colors hover:border-foreground/20 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
            <FolderClosed className="size-4.5 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="truncate text-sm font-medium">{room.name}</h3>
        </div>
        {!room.isOwner && (
          <Badge variant="secondary" className="shrink-0 gap-1">
            <Users className="size-3" aria-hidden="true" />
            Shared
          </Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground">Created {formatRelative(room.createdAt)}</p>
    </Link>
  );
}
