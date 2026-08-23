'use client';

import Link from 'next/link';
import { File, Folder } from 'lucide-react';
import type { NodeDto } from '@data-room/shared';
import { TableCell, TableRow } from '@/components/ui/table';
import { formatBytes, formatRelative } from '@/lib/format';
import { NodeRowActions } from './NodeRowActions';

export function NodeRow({
  node,
  roomId,
  parentId,
  readOnly,
  root,
}: {
  node: NodeDto;
  roomId: string;
  parentId: string;
  readOnly: boolean;
  root: { id: string; name: string };
}) {
  const Icon = node.type === 'FOLDER' ? Folder : File;
  const size = node.sizeBytes != null ? formatBytes(node.sizeBytes) : '—';

  return (
    <TableRow>
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
            // No viewer exists yet (arrives in a later task) — a file name
            // that opened nothing would be a dead-end control, so it's
            // plain text rather than a link or button for now.
            <span className="truncate text-sm" title={node.name}>
              {node.name}
            </span>
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
    </TableRow>
  );
}
