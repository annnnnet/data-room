'use client';

import { useRef, useState } from 'react';
import { FolderPlus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog';
import { useUploadContext } from '@/components/upload/UploadDropzone';

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
      <UploadButton />
      <NewFolderButton parentId={parentId} />
    </div>
  );
}

function UploadButton() {
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
          if (files.length > 0) upload?.addFiles(files);
          e.target.value = '';
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
