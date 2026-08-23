'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { UploadCloud } from 'lucide-react';
import { useUpload } from '@/hooks/use-upload';
import { toast } from '@/components/ui/toast';
import { UploadQueue } from './UploadQueue';
import { ConflictDialog } from '@/components/dialogs/ConflictDialog';

type UploadContextValue = { addFiles: (files: File[]) => void };
const UploadContext = createContext<UploadContextValue | null>(null);

/** Consumed by the toolbar's Upload button to add picked (not dropped) files to the same queue. */
export function useUploadContext() {
  return useContext(UploadContext);
}

const PDF_TYPE = 'application/pdf';

function rejectionMessage(rejections: FileRejection[]): string {
  return rejections.length === 1
    ? `"${rejections[0].file.name}" isn't a PDF — only PDF files can be uploaded here.`
    : `${rejections.length} files were skipped — only PDF files can be uploaded here.`;
}

/**
 * Wraps the folder-browser content and turns it into a drop target. Uses
 * `react-dropzone`'s own drag-target tracking (not a hand-rolled counter) so
 * dragging over child rows/buttons doesn't flicker the overlay — that's the
 * whole reason this depends on the library rather than raw dragenter/leave.
 *
 * `readOnly` disables the dropzone entirely and skips mounting the upload
 * queue/context — the public share view must not accept a drop at all.
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
  const upload = useUpload(parentId);

  const onDrop = useCallback(
    (accepted: File[], rejections: FileRejection[]) => {
      if (accepted.length > 0) upload.addFiles(accepted);
      if (rejections.length > 0) {
        toast.add({ title: rejectionMessage(rejections), type: 'error' });
      }
    },
    [upload],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    noClick: true,
    noKeyboard: true,
    disabled: readOnly,
    accept: { [PDF_TYPE]: ['.pdf'] },
    onDrop,
  });

  if (readOnly) return <>{children}</>;

  const conflictTask = upload.tasks.find((t) => t.status === 'conflict');
  const conflictCount = upload.tasks.filter((t) => t.status === 'conflict').length;

  return (
    <UploadContext.Provider value={{ addFiles: upload.addFiles }}>
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

      <UploadQueue
        tasks={upload.tasks}
        retry={upload.retry}
        cancel={upload.cancel}
        clearFinished={upload.clearFinished}
      />

      {conflictTask && (
        <ConflictDialog
          key={conflictTask.id}
          fileName={conflictTask.name}
          suggestedName={conflictTask.suggestedName ?? conflictTask.name}
          remainingCount={conflictCount}
          onResolve={(choice, applyToAll) => {
            if (applyToAll) {
              for (const t of upload.tasks) {
                if (t.status === 'conflict') upload.resolveConflict(t.id, choice);
              }
            } else {
              upload.resolveConflict(conflictTask.id, choice);
            }
          }}
        />
      )}
    </UploadContext.Provider>
  );
}
