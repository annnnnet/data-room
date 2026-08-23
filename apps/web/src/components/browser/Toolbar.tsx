'use client';

import { useEffect, useRef, useState } from 'react';
import { FolderPlus, Search, Share2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog';
import { ShareDialog } from '@/components/share/ShareDialog';
import { SearchCommand } from '@/components/search/SearchCommand';
import { useUploadContext } from '@/components/upload/UploadProvider';
import { isPdfFile, rejectionMessage } from '@/components/upload/pdf-filter';
import { toast } from '@/components/ui/toast';

/**
 * Upload and Share ship for real: upload feeds picked files into the same
 * queue the dropzone drives, via `UploadDropzone`'s context; Share opens the
 * link/people dialog on the folder currently being viewed. Both are hidden
 * in `readOnly` — there's nothing left to show, and sharing is owner-only.
 *
 * Search is different: the API scopes a `link` principal's search to the
 * subtrees their share actually covers (verified in `search.service.ts`),
 * so a share recipient can search too — the button stays even when
 * `readOnly` strips everything else.
 */
export function Toolbar({
  roomId,
  basePath,
  parentId,
  nodeName,
  readOnly,
}: {
  roomId: string;
  basePath: string;
  parentId: string;
  nodeName: string;
  readOnly: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <SearchButton roomId={roomId} basePath={basePath} />
      {!readOnly && (
        <>
          <UploadButton parentId={parentId} />
          <NewFolderButton parentId={parentId} />
          <ShareButton nodeId={parentId} nodeName={nodeName} />
        </>
      )}
    </div>
  );
}

function SearchButton({ roomId, basePath }: { roomId: string; basePath: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    // The dialog can be opened from anywhere via the keyboard shortcut, not
    // just by clicking this button — returning focus here on close still
    // gives keyboard users a stable, predictable place to land.
    if (!next) triggerRef.current?.focus();
  }

  return (
    <>
      <Button ref={triggerRef} variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Search className="size-4" aria-hidden="true" />
        Search
        <kbd className="ml-1 hidden rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground sm:inline">
          Ctrl+K
        </kbd>
      </Button>
      <SearchCommand roomId={roomId} basePath={basePath} open={open} onOpenChange={handleOpenChange} />
    </>
  );
}

function UploadButton({ parentId }: { parentId: string }) {
  const upload = useUploadContext();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
        <Upload className="size-4" aria-hidden="true" />
        Upload
      </Button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length === 0) return;

          // The OS "All files" option bypasses `accept` above, so filter
          // for real here too — same rule and same toast the drop path uses.
          const accepted = files.filter(isPdfFile);
          const rejected = files.filter((f) => !isPdfFile(f));
          if (accepted.length > 0) upload?.addFiles(accepted, parentId);
          if (rejected.length > 0) {
            toast.add({ title: rejectionMessage(rejected.map((f) => f.name)), type: 'error' });
          }
        }}
      />
    </>
  );
}

function NewFolderButton({ parentId }: { parentId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderPlus className="size-4" aria-hidden="true" />
        New folder
      </Button>
      <NewFolderDialog open={open} onOpenChange={setOpen} parentId={parentId} />
    </>
  );
}

function ShareButton({ nodeId, nodeName }: { nodeId: string; nodeName: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2 className="size-4" aria-hidden="true" />
        Share
      </Button>
      <ShareDialog node={{ id: nodeId, name: nodeName }} open={open} onOpenChange={setOpen} />
    </>
  );
}
