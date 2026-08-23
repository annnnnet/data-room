'use client';

import { useRef, useState } from 'react';
import { FolderPlus, Share2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog';
import { ShareDialog } from '@/components/share/ShareDialog';
import { useUploadContext } from '@/components/upload/UploadProvider';
import { isPdfFile, rejectionMessage } from '@/components/upload/pdf-filter';
import { toast } from '@/components/ui/toast';

/**
 * Search still belongs to a later task (it needs a real results list).
 * Upload and Share ship for real: upload feeds picked files into the same
 * queue the dropzone drives, via `UploadDropzone`'s context; Share opens the
 * link/people dialog on the folder currently being viewed. Hidden entirely
 * in `readOnly` — there's nothing left to show, and sharing is owner-only.
 */
export function Toolbar({
  parentId,
  nodeName,
  readOnly,
}: {
  parentId: string;
  nodeName: string;
  readOnly: boolean;
}) {
  if (readOnly) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      <UploadButton parentId={parentId} />
      <NewFolderButton parentId={parentId} />
      <ShareButton nodeId={parentId} nodeName={nodeName} />
    </div>
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
