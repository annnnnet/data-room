'use client';

import type { NodeDto } from '@data-room/shared';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatBytes } from '@/lib/format';
import { FilePreview } from './FilePreview';
import { VersionHistoryList } from './VersionHistoryList';

export function FileViewerSheet({
  node,
  parentId,
  open,
  onOpenChange,
  readOnly,
}: {
  node: NodeDto;
  /** Parent folder id — restore invalidates this folder's listing so the row's size/date update. */
  parentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** No Restore button at all when set — reused by the public share view. */
  readOnly: boolean;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full flex-col gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl"
      >
        <SheetHeader className="border-b pr-10">
          <SheetTitle className="truncate" title={node.name}>
            {node.name}
          </SheetTitle>
          <SheetDescription>
            {node.sizeBytes != null ? formatBytes(node.sizeBytes) : '—'}
          </SheetDescription>
        </SheetHeader>
        <Tabs defaultValue="preview" className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="mx-4 mt-3 w-fit shrink-0">
            <TabsTrigger value="preview">Preview</TabsTrigger>
            {/* Version history is owner edit metadata (who uploaded each
                version, when) — the API itself is owner-only for it now, so
                a read-only viewer never gets a tab whose content would just
                403. No dead UI: the tab plus its query simply don't exist
                for them, not merely a hidden Restore button inside it. */}
            {!readOnly && <TabsTrigger value="versions">Versions</TabsTrigger>}
          </TabsList>
          <TabsContent value="preview" className="mt-3 min-h-0 flex-1">
            <FilePreview node={node} />
          </TabsContent>
          {!readOnly && (
            <TabsContent value="versions" className="min-h-0 flex-1 overflow-y-auto">
              <VersionHistoryList node={node} parentId={parentId} readOnly={readOnly} />
            </TabsContent>
          )}
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
