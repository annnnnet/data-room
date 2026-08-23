'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useUpload } from '@/hooks/use-upload';
import { UploadQueue } from './UploadQueue';
import { ConflictDialog } from '@/components/dialogs/ConflictDialog';

type UploadContextValue = ReturnType<typeof useUpload>;
const UploadContext = createContext<UploadContextValue | null>(null);

/** Consumed by the dropzone (drops) and the toolbar's Upload button (picked files) — same queue either way. */
export function useUploadContext() {
  return useContext(UploadContext);
}

/**
 * Owns the single `useUpload` instance for the room, plus the dock and the
 * conflict dialog that render off its state. Mounted once in
 * `app/r/[roomId]/layout.tsx`, above the routed folder segment, so none of
 * this — the reducer state, the in-flight XHRs' abort handles — gets torn
 * down when the user navigates between folders mid-upload.
 */
export function UploadProvider({ children }: { children: ReactNode }) {
  const upload = useUpload();

  const conflictTask = upload.tasks.find((t) => t.status === 'conflict');
  const conflictCount = upload.tasks.filter((t) => t.status === 'conflict').length;

  return (
    <UploadContext.Provider value={upload}>
      {children}

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
