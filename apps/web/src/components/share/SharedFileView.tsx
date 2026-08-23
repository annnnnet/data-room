'use client';

import { File as FileIcon } from 'lucide-react';
import type { NodeDetail } from '@data-room/shared';
import { formatBytes } from '@/lib/format';
import { FilePreview } from '@/components/viewer/FilePreview';

/**
 * A share can point straight at a file, not just a folder — this is that
 * landing page. Deliberately smaller than the owner's `FileViewerSheet`:
 * read-only, no version history (there's nothing to restore, and edit
 * history is owner metadata the sharing requirement never asks a link
 * recipient to see — see the design note on `VersionHistoryList`), just a
 * preview and a download. The preview itself is the exact same
 * `FilePreview` the owner's viewer sheet uses, not a copy — the two had
 * already drifted once (a mime-normalisation fix landed in only one of
 * them) before being unified here.
 */
export function SharedFileView({ node, dataRoomName }: { node: NodeDetail; dataRoomName: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="rounded-lg border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
        Shared with you · {dataRoomName}
      </div>
      <div className="flex items-center gap-2">
        <FileIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <h1 className="truncate text-base font-medium" title={node.name}>
          {node.name}
        </h1>
        <span className="shrink-0 text-sm text-muted-foreground">
          {node.sizeBytes != null ? formatBytes(node.sizeBytes) : ''}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
        <FilePreview node={node} />
      </div>
    </div>
  );
}
