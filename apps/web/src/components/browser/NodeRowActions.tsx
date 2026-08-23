'use client';

import { useState } from 'react';
import { FolderInput, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import type { NodeDto } from '@data-room/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RenameDialog } from '@/components/dialogs/RenameDialog';
import { DeleteDialog } from '@/components/dialogs/DeleteDialog';
import { MoveDialog } from '@/components/dialogs/MoveDialog';

type DialogKind = 'rename' | 'move' | 'delete' | null;

export function NodeRowActions({
  node,
  parentId,
  root,
}: {
  node: NodeDto;
  parentId: string;
  /** The data room's root folder — the Move dialog's tree starts here. */
  root: { id: string; name: string };
}) {
  const [openDialog, setOpenDialog] = useState<DialogKind>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreVertical aria-hidden="true" />
          <span className="sr-only">Actions for {node.name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setOpenDialog('rename')}>
            <Pencil aria-hidden="true" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOpenDialog('move')}>
            <FolderInput aria-hidden="true" />
            Move
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => setOpenDialog('delete')}>
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenameDialog
        node={node}
        parentId={parentId}
        open={openDialog === 'rename'}
        onOpenChange={(next) => setOpenDialog(next ? 'rename' : null)}
      />
      <MoveDialog
        node={node}
        parentId={parentId}
        root={root}
        open={openDialog === 'move'}
        onOpenChange={(next) => setOpenDialog(next ? 'move' : null)}
      />
      <DeleteDialog
        node={node}
        parentId={parentId}
        open={openDialog === 'delete'}
        onOpenChange={(next) => setOpenDialog(next ? 'delete' : null)}
      />
    </>
  );
}
