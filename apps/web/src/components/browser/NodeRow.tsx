'use client';

import { useState } from 'react';
import Link from 'next/link';
import { File, Folder } from 'lucide-react';
import type { PendingNode } from '@/hooks/node-mutation-patches';
import { TableCell, TableRow } from '@/components/ui/table';
import { FileViewerSheet } from '@/components/viewer/FileViewerSheet';
import { formatBytes, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NodeRowActions } from './NodeRowActions';

export function NodeRow({
  node,
  roomId,
  parentId,
  readOnly,
  root,
}: {
  node: PendingNode;
  roomId: string;
  parentId: string;
  readOnly: boolean;
  root: { id: string; name: string };
}) {
  const Icon = node.type === 'FOLDER' ? Folder : File;
  const size = node.sizeBytes != null ? formatBytes(node.sizeBytes) : '—';
  const [viewerOpen, setViewerOpen] = useState(false);

  // A move/delete in flight — see `markPendingPatch` — is shown as a
  // dimmed, non-interactive row rather than removed outright, so a failure
  // rolling back doesn't read as the row vanishing and popping back.
  return (
    <TableRow
      aria-busy={node._pending || undefined}
      className={cn(node._pending && 'pointer-events-none opacity-50')}
    >
      <TableCell className="overflow-hidden">
        <div className="flex min-w-0 items-center gap-2">
          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {node.type === 'FOLDER' ? (
            <Link
              href={`/r/${roomId}/f/${node.id}`}
              className="truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
              title={node.name}
            >
              {node.name}
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setViewerOpen(true)}
              className="truncate rounded-sm text-left text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
              title={node.name}
            >
              {node.name}
            </button>
          )}
        </div>
      </TableCell>
      <TableCell className="text-right text-muted-foreground">{size}</TableCell>
      <TableCell className="text-muted-foreground" title={new Date(node.updatedAt).toLocaleString()}>
        {formatRelative(node.updatedAt)}
      </TableCell>
      {!readOnly && (
        <TableCell>
          <NodeRowActions node={node} parentId={parentId} root={root} />
        </TableCell>
      )}
      {node.type === 'FILE' && (
        <FileViewerSheet
          node={node}
          parentId={parentId}
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          readOnly={readOnly}
        />
      )}
    </TableRow>
  );
}
