import { useCallback, useEffect, useReducer, useRef, type Dispatch } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { OnConflict, UploadUrlResponse } from '@data-room/shared';
import { api, ApiError } from '@/lib/api';
import {
  initialState,
  uploadReducer,
  type UploadAction,
  type UploadState,
  type UploadTask,
} from './upload-queue';

export type { UploadTask, UploadStatus } from './upload-queue';

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
    xhr.onabort = () => reject(new Error('cancelled'));
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
 */
export function useUpload(parentId: string) {
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

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ['children', parentId] }),
    [qc, parentId],
  );

  const runTask = useCallback(
    async (task: UploadTask) => {
      running.current.add(task.id);
      try {
        let res: UploadUrlResponse;
        try {
          res = await api.post<UploadUrlResponse>('/api/files/upload-url', {
            parentId,
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

        try {
          await putBytes(
            res.uploadUrl,
            task.file,
            (pct) => dispatch({ type: 'progress', id: task.id, progress: pct }),
            (abort) => aborts.current.set(task.id, abort),
          );
        } catch (err) {
          const cancelled = err instanceof Error && err.message === 'cancelled';
          if (!cancelled) {
            dispatch({ type: 'error', id: task.id, error: 'Upload interrupted. Try again.' });
          }
          return;
        } finally {
          aborts.current.delete(task.id);
        }

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

        dispatch({ type: 'done', id: task.id });
        invalidate();
      } finally {
        running.current.delete(task.id);
        dispatch({ type: 'pump' });
      }
    },
    [parentId, invalidate],
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

  const addFiles = useCallback((files: File[]) => {
    if (files.length === 0) return;
    dispatch({ type: 'add', files });
    dispatch({ type: 'pump' });
  }, []);

  const retry = useCallback((id: string) => {
    dispatch({ type: 'retry', id });
    dispatch({ type: 'pump' });
  }, []);

  const cancel = useCallback((id: string) => {
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
