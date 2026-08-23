'use client';

import { useState } from 'react';
import { ChevronRight, Folder, Loader2 } from 'lucide-react';
import type { NodeDto } from '@data-room/shared';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useNodeChildren } from '@/hooks/use-node-children';
import { useNodeMutations } from '@/hooks/use-node-mutations';
import { isInvalidMoveDestination, moveDestinationDisabledReason } from './move-tree';

export function MoveDialog({
  node,
  parentId,
  root,
  open,
  onOpenChange,
}: {
  node: NodeDto;
  parentId: string;
  /** The data room's root folder — the tree's starting point. */
  root: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { move } = useNodeMutations(parentId, { toastOnError: false });

  function handleOpenChange(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setSelectedId(null);
      setError(null);
    }
  }

  function handleMove() {
    if (!selectedId || move.isPending) return;
    setError(null);
    move.mutate(
      { id: node.id, parentId: selectedId },
      {
        onSuccess: () => handleOpenChange(false),
        onError: (err) => {
          setError(err instanceof ApiError ? err.message : 'Could not move this item. Try again.');
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move &ldquo;{node.name}&rdquo;</DialogTitle>
          <DialogDescription>Choose a destination folder.</DialogDescription>
        </DialogHeader>
        <div
          role="tree"
          aria-label="Destination folder"
          className="max-h-64 overflow-y-auto rounded-lg border p-1"
        >
          <MoveTreeRow
            nodeId={root.id}
            name={root.name}
            path={[root.id]}
            selectedId={selectedId}
            onSelect={setSelectedId}
            movingNodeId={node.id}
            currentParentId={parentId}
            defaultExpanded
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={move.isPending} onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!selectedId || move.isPending} onClick={handleMove}>
            {move.isPending ? 'Moving…' : 'Move'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TreeGuard = { movingNodeId: string; currentParentId: string };

function MoveTreeRow({
  nodeId,
  name,
  path,
  selectedId,
  onSelect,
  movingNodeId,
  currentParentId,
  defaultExpanded = false,
}: {
  nodeId: string;
  name: string;
  path: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  defaultExpanded?: boolean;
} & TreeGuard) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const depth = path.length - 1;
  const guard = { movingNodeId, currentParentId };
  const disabled = isInvalidMoveDestination(path, guard);
  const disabledReason = disabled ? moveDestinationDisabledReason(path, guard) : null;
  const selected = selectedId === nodeId;

  const row = (
    <div
      className="flex items-center gap-1"
      style={{ paddingInlineStart: `${depth * 1.25}rem` }}
    >
      <button
        type="button"
        aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
        onClick={() => setExpanded((v) => !v)}
        className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn('size-3.5 transition-transform', expanded && 'rotate-90')}
        />
      </button>
      <button
        type="button"
        role="treeitem"
        aria-selected={selected}
        aria-disabled={disabled || undefined}
        disabled={disabled}
        onClick={() => !disabled && onSelect(nodeId)}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm',
          disabled
            ? 'cursor-not-allowed text-muted-foreground/60'
            : 'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50',
          selected && !disabled && 'bg-primary/10 font-medium text-primary',
        )}
      >
        <Folder aria-hidden="true" className="size-4 shrink-0" />
        <span className="truncate">{name}</span>
      </button>
    </div>
  );

  return (
    <div>
      {disabled ? (
        <Tooltip>
          <TooltipTrigger render={<div />}>{row}</TooltipTrigger>
          <TooltipContent side="right">{disabledReason}</TooltipContent>
        </Tooltip>
      ) : (
        row
      )}
      {expanded && (
        <MoveTreeChildren
          nodeId={nodeId}
          path={path}
          selectedId={selectedId}
          onSelect={onSelect}
          movingNodeId={movingNodeId}
          currentParentId={currentParentId}
        />
      )}
    </div>
  );
}

function MoveTreeChildren({
  nodeId,
  path,
  selectedId,
  onSelect,
  movingNodeId,
  currentParentId,
}: {
  nodeId: string;
  path: string[];
  selectedId: string | null;
  onSelect: (id: string) => void;
} & TreeGuard) {
  const query = useNodeChildren(nodeId);
  const depth = path.length;

  if (query.isPending) {
    return (
      <div
        className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground"
        style={{ paddingInlineStart: `${depth * 1.25 + 1.5}rem` }}
      >
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Loading…
      </div>
    );
  }

  if (query.isError) {
    return (
      <p
        className="py-1 text-xs text-destructive"
        style={{ paddingInlineStart: `${depth * 1.25 + 1.5}rem` }}
      >
        Couldn&apos;t load subfolders.
      </p>
    );
  }

  const folders = query.data.pages.flatMap((p) => p.items).filter((n) => n.type === 'FOLDER');

  if (folders.length === 0) {
    return (
      <p
        className="py-1 text-xs text-muted-foreground"
        style={{ paddingInlineStart: `${depth * 1.25 + 1.5}rem` }}
      >
        No subfolders
      </p>
    );
  }

  return (
    <>
      {folders.map((folder) => (
        <MoveTreeRow
          key={folder.id}
          nodeId={folder.id}
          name={folder.name}
          path={[...path, folder.id]}
          selectedId={selectedId}
          onSelect={onSelect}
          movingNodeId={movingNodeId}
          currentParentId={currentParentId}
        />
      ))}
      {query.hasNextPage && (
        <button
          type="button"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="py-1 text-xs text-primary underline disabled:opacity-50"
          style={{ paddingInlineStart: `${depth * 1.25 + 1.5}rem` }}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}
