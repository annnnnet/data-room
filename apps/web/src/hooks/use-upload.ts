import { useCallback, useEffect, useReducer, useRef, type Dispatch } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OnConflict, UploadUrlResponse } from '@data-room/shared';
import { api, ApiError } from '@/lib/api';
import {
  initialState,
  makeTaskId,
  uploadReducer,
  type NewTask,
  type UploadAction,
  type UploadState,
  type UploadTask,
} from './upload-queue';

export type { UploadTask, UploadStatus } from './upload-queue';

/** Rejects with this — never a bare `Error` — so a cancel can never be confused with a real network/HTTP failure. */
class UploadCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'UploadCancelledError';
  }
}

/**
 * Uploads bytes for one task over XHR (not `fetch`) so `upload.onprogress`
 * can drive the per-file progress bar — `fetch` has no upload-progress
 * event. Resolves/rejects instead of throwing structured errors: the caller
 * only needs to know "ok" vs. "failed", `complete`'s own error reporting
 * handles the interesting cases (name conflict, expired upload).
 */
function putBytes(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void,
  registerAbort: (abort: () => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    registerAbort(() => xhr.abort());
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new UploadCancelledError());
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.send(file);
  });
}

/**
 * Drives the upload reducer end to end: requests a signed URL, PUTs the
 * bytes with real progress, then marks the version ready. One task at a
 * time is driven per effect run, gated by the reducer's own `uploading`
 * status (set by `pump`, capped at `MAX_CONCURRENT`), so at most three of
 * these run concurrently without any extra bookkeeping here.
 *
 * Not parameterised by `parentId` — each task carries its own `parentId`
 * from the moment it's added (see `upload-queue.ts`), so a task keeps
 * uploading into the folder it was dropped into even if the user has since
 * navigated to a different one. This hook is meant to be instantiated once
 * (by `UploadProvider`) and shared across every folder in the room.
 */
export function useUpload() {
  const [state, dispatch]: [UploadState, Dispatch<UploadAction>] = useReducer(
    uploadReducer,
    initialState,
  );
  const qc = useQueryClient();
  const aborts = useRef(new Map<string, () => void>());
  // Tracks which task ids currently have an in-flight run of `runTask`, so
  // the effect below (which re-runs on every dispatch) never starts a
  // second XHR for a task that's already uploading.
  const running = useRef(new Set<string>());
  // Tracks ids cancelled by the user so `runTask` can bail between steps
  // even when there's no live XHR to abort — e.g. cancelling while the
  // upload-url request or the /complete call is still in flight.
  const cancelledIds = useRef(new Set<string>());

  const invalidate = useCallback(
    // `cancelQueries` first: if the folder's own mount fetch for
    // `['children', parentId]` is still in flight when an upload finishes,
    // `invalidateQueries`'s refetch would otherwise dedupe onto that
    // already-in-flight promise (TanStack Query only starts a new fetch
    // when the query is idle) and resolve with pre-upload data, leaving
    // the just-uploaded file invisible until something else re-triggers
    // the query. See the identical fix in `NewDataRoomDialog`.
    async (parentId: string) => {
      await qc.cancelQueries({ queryKey: ['children', parentId] });
      qc.invalidateQueries({ queryKey: ['children', parentId] });
    },
    [qc],
  );

  const runTask = useCallback(
    async (task: UploadTask) => {
      running.current.add(task.id);
      try {
        let res: UploadUrlResponse;
        try {
          res = await api.post<UploadUrlResponse>('/api/files/upload-url', {
            parentId: task.parentId,
            name: task.name,
            sizeBytes: task.file.size,
            mimeType: task.file.type || 'application/pdf',
            onConflict: task.onConflict ?? 'FAIL',
          });
        } catch (err) {
          if (err instanceof ApiError && err.code === 'NAME_CONFLICT') {
            const suggested = err.details?.suggestedName;
            dispatch({
              type: 'conflict',
              id: task.id,
              suggestedName: typeof suggested === 'string' ? suggested : task.name,
            });
            return;
          }
          dispatch({
            type: 'error',
            id: task.id,
            error: err instanceof ApiError ? err.message : 'Could not start the upload.',
          });
          return;
        }

        if (cancelledIds.current.has(task.id)) return;

        try {
          await putBytes(
            res.uploadUrl,
            task.file,
            (pct) => dispatch({ type: 'progress', id: task.id, progress: pct }),
            (abort) => aborts.current.set(task.id, abort),
          );
        } catch (err) {
          if (!(err instanceof UploadCancelledError)) {
            dispatch({ type: 'error', id: task.id, error: 'Upload interrupted. Try again.' });
          }
          return;
        } finally {
          aborts.current.delete(task.id);
        }

        if (cancelledIds.current.has(task.id)) return;

        try {
          await api.post(`/api/files/${res.nodeId}/complete`, { versionId: res.versionId });
        } catch (err) {
          const message =
            err instanceof ApiError && err.code === 'UPLOAD_EXPIRED'
              ? 'Upload expired before it could be confirmed. Try again.'
              : err instanceof ApiError
                ? err.message
                : 'Could not confirm the upload.';
          dispatch({ type: 'error', id: task.id, error: message });
          return;
        }

        if (cancelledIds.current.has(task.id)) return;

        dispatch({ type: 'done', id: task.id, name: res.finalName });
        invalidate(task.parentId);
      } finally {
        running.current.delete(task.id);
        dispatch({ type: 'pump' });
      }
    },
    [invalidate],
  );

  // Kicks off any task the reducer just promoted to `uploading` and hasn't
  // already got a run in flight for. Runs after every dispatch — cheap,
  // since `running` makes re-entry a no-op for tasks already underway.
  useEffect(() => {
    for (const task of state.tasks) {
      if (task.status === 'uploading' && !running.current.has(task.id)) {
        void runTask(task);
      }
    }
  }, [state.tasks, runTask]);

  const addFiles = useCallback((files: File[], parentId: string) => {
    if (files.length === 0) return;
    const tasks: NewTask[] = files.map((file) => ({ id: makeTaskId(), file, parentId }));
    dispatch({ type: 'add', tasks });
    dispatch({ type: 'pump' });
  }, []);

  const retry = useCallback((id: string) => {
    cancelledIds.current.delete(id);
    dispatch({ type: 'retry', id });
    dispatch({ type: 'pump' });
  }, []);

  const cancel = useCallback((id: string) => {
    cancelledIds.current.add(id);
    aborts.current.get(id)?.();
    dispatch({ type: 'cancel', id });
  }, []);

  const resolveConflict = useCallback((id: string, onConflict: OnConflict | 'SKIP') => {
    dispatch({ type: 'resolveConflict', id, onConflict });
    dispatch({ type: 'pump' });
  }, []);

  const clearFinished = useCallback(() => dispatch({ type: 'clearFinished' }), []);

  return { tasks: state.tasks, addFiles, retry, cancel, resolveConflict, clearFinished };
}
