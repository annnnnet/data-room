'use client';

import { useCallback, type ReactNode } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { useUploadContext } from './UploadProvider';
import { PDF_TYPE, rejectionMessage } from './pdf-filter';

/**
 * Wraps the folder-browser content and turns it into a drop target. Uses
 * `react-dropzone`'s own drag-target tracking (not a hand-rolled counter) so
 * dragging over child rows/buttons doesn't flicker the overlay — that's the
 * whole reason this depends on the library rather than raw dragenter/leave.
 *
 * The upload queue itself lives one level up, in `UploadProvider` (mounted
 * in `app/r/[roomId]/layout.tsx`), so it survives this component
 * remounting on folder navigation. Each accepted file is tagged with the
 * *current* `parentId` right here, at drop time, so it always uploads into
 * the folder it was dropped into regardless of where the user browses to
 * afterward.
 *
 * `readOnly` disables the dropzone entirely — the public share view must
 * not accept a drop at all.
 */
export function UploadDropzone({
  parentId,
  readOnly,
  children,
}: {
  parentId: string;
  readOnly: boolean;
  children: ReactNode;
}) {
  const upload = useUploadContext();
  const addFiles = upload?.addFiles;

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (accepted.length > 0) addFiles?.(accepted, parentId);
      if (rejections.length > 0) {
        toast.add({
          title: rejectionMessage(rejections.map((r) => r.file.name)),
          type: 'error',
        });
      }
    },
    [addFiles, parentId],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    disabled: readOnly,
    accept: { [PDF_TYPE]: ['.pdf'] },
    onDrop,
  });

  if (readOnly) return <>{children}</>;

  return (
    <div {...getRootProps()} className="relative flex min-h-0 flex-1 flex-col">
      <input {...getInputProps()} />
      {children}
      {isDragActive && (
        <div
          role="presentation"
          className="pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary bg-primary/5 text-primary"
        >
          <UploadCloud className="size-8" aria-hidden="true" />
          <p className="text-sm font-medium">Drop PDFs to upload</p>
        </div>
      )}
    </div>
  );
}
