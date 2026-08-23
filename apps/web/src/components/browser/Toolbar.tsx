'use client';

import { useRef, useState } from 'react';
import { FolderPlus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog';
import { useUploadContext } from '@/components/upload/UploadProvider';
import { isPdfFile, rejectionMessage } from '@/components/upload/pdf-filter';
import { toast } from '@/components/ui/toast';

/**
 * Search and share still belong to later tasks (they need real flows — a
 * results list, a link/permission form). Upload now ships for real: the
 * button here just feeds picked files into the same queue the dropzone
 * drives, via `UploadDropzone`'s context. Hidden entirely in `readOnly` —
 * there's nothing left to show.
 */
export function Toolbar({ parentId, readOnly }: { parentId: string; readOnly: boolean }) {
  if (readOnly) return null;
  return (
    <div className="flex items-center justify-end gap-2">
      <UploadButton parentId={parentId} />
      <NewFolderButton parentId={parentId} />
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
