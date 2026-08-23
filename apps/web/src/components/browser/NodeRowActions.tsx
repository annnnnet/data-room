'use client';

import { useState } from 'react';
import { MoreVertical, Trash2 } from 'lucide-react';
import type { NodeDto } from '@data-room/shared';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useNodeMutations } from '@/hooks/use-node-mutations';

/**
 * Only "Delete" is wired up here — rename and move need dialogs (a name
 * input, a folder picker) that land in a later task, and this app doesn't
 * ship a menu item with no dialog behind it.
 */
export function NodeRowActions({ node, parentId }: { node: NodeDto; parentId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { remove } = useNodeMutations(parentId);
  const label = node.type === 'FOLDER' ? 'folder' : 'file';

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" />}>
          <MoreVertical aria-hidden="true" />
          <span className="sr-only">Actions for {node.name}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem variant="destructive" onClick={() => setConfirmOpen(true)}>
            <Trash2 aria-hidden="true" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              {node.type === 'FOLDER'
                ? `"${node.name}" and everything inside it will be removed. This can't be undone.`
                : `"${node.name}" will be removed. This can't be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate({ id: node.id }, { onSuccess: () => setConfirmOpen(false) });
              }}
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
