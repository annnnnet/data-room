'use client';

import { useEffect, useRef } from 'react';
import { FolderOpen } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { useNodeChildren } from '@/hooks/use-node-children';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/states/EmptyState';
import { ErrorState } from '@/components/states/ErrorState';
import { TableSkeleton } from '@/components/states/TableSkeleton';
import { NodeRow } from './NodeRow';

export function NodeTable({
  roomId,
  parentId,
  readOnly,
  root,
}: {
  roomId: string;
  parentId: string;
  readOnly: boolean;
  root: { id: string; name: string };
}) {
  const query = useNodeChildren(parentId);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const hasNextPage = query.hasNextPage;
  const isFetchingNextPage = query.isFetchingNextPage;
  const fetchNextPage = query.fetchNextPage;

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (query.isPending) {
    return (
      <div className="rounded-lg border">
        <TableSkeleton variant="rows" rows={6} label="Loading folder contents" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <ErrorState
        message={query.error instanceof ApiError ? query.error.message : 'Could not load this folder.'}
        onRetry={() => query.refetch()}
      />
    );
  }

  const items = query.data.pages.flatMap((p) => p.items);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="This folder is empty"
        description={
          readOnly ? 'Nothing has been shared here yet.' : 'Upload files or create a folder to get started.'
        }
      />
    );
  }

  return (
    <div className="rounded-lg border">
      <Table className="w-full min-w-[640px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-24 text-right">Size</TableHead>
            <TableHead className="w-32">Modified</TableHead>
            {!readOnly && (
              <TableHead className="w-10">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((node) => (
            <NodeRow
              key={node.id}
              node={node}
              roomId={roomId}
              parentId={parentId}
              readOnly={readOnly}
              root={root}
            />
          ))}
        </TableBody>
      </Table>

      {/* Intersection-observer sentinel — fetches the next page as it scrolls into view. */}
      <div ref={sentinelRef} aria-hidden="true" className="h-px" />

      {isFetchingNextPage && <TableSkeleton variant="rows" rows={2} label="Loading more" />}
    </div>
  );
}
