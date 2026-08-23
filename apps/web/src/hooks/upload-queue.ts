import type { OnConflict } from '@data-room/shared';

/** How many uploads run over the wire at the same time. */
export const MAX_CONCURRENT = 3;

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'conflict' | 'cancelled';

export type UploadTask = {
  id: string;
  file: File;
  /** The name currently being requested — starts as `file.name`, may change on a "keep both" resolution. */
  name: string;
  status: UploadStatus;
  /** 0–100. */
  progress: number;
  error?: string;
  suggestedName?: string;
  onConflict?: OnConflict;
};

export type UploadState = {
  tasks: UploadTask[];
};

export const initialState: UploadState = { tasks: [] };

export type UploadAction =
  | { type: 'add'; files: File[] }
  | { type: 'pump' }
  | { type: 'progress'; id: string; progress: number }
  | { type: 'done'; id: string }
  | { type: 'error'; id: string; error: string }
  | { type: 'conflict'; id: string; suggestedName: string }
  | { type: 'resolveConflict'; id: string; onConflict: OnConflict | 'SKIP' }
  | { type: 'retry'; id: string }
  | { type: 'cancel'; id: string }
  | { type: 'clearFinished' };

let nextId = 0;
/** Exposed so `useUpload` can create ids the same way tasks it adds do, if ever needed. */
export function makeTaskId(): string {
  nextId += 1;
  return `upload-${Date.now()}-${nextId}`;
}

function mapTask(state: UploadState, id: string, fn: (t: UploadTask) => UploadTask): UploadState {
  return { tasks: state.tasks.map((t) => (t.id === id ? fn(t) : t)) };
}

export function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'add': {
      const added: UploadTask[] = action.files.map((file) => ({
        id: makeTaskId(),
        file,
        name: file.name,
        status: 'queued',
        progress: 0,
      }));
      return { tasks: [...state.tasks, ...added] };
    }

    case 'pump': {
      const inFlight = state.tasks.filter((t) => t.status === 'uploading').length;
      let slots = MAX_CONCURRENT - inFlight;
      if (slots <= 0) return state;
      return {
        tasks: state.tasks.map((t) => {
          if (slots > 0 && t.status === 'queued') {
            slots -= 1;
            return { ...t, status: 'uploading' };
          }
          return t;
        }),
      };
    }

    case 'progress':
      return mapTask(state, action.id, (t) => ({ ...t, progress: action.progress }));

    case 'done':
      return mapTask(state, action.id, (t) => ({ ...t, status: 'done', progress: 100 }));

    case 'error':
      return mapTask(state, action.id, (t) => ({ ...t, status: 'error', error: action.error }));

    case 'conflict':
      return mapTask(state, action.id, (t) => ({
        ...t,
        status: 'conflict',
        suggestedName: action.suggestedName,
      }));

    case 'resolveConflict':
      return mapTask(state, action.id, (t) => {
        if (action.onConflict === 'SKIP') {
          return { ...t, status: 'cancelled', suggestedName: undefined };
        }
        return {
          ...t,
          status: 'queued',
          progress: 0,
          error: undefined,
          suggestedName: undefined,
          onConflict: action.onConflict,
        };
      });

    case 'retry':
      return mapTask(state, action.id, (t) => ({
        ...t,
        status: 'queued',
        progress: 0,
        error: undefined,
      }));

    case 'cancel':
      return mapTask(state, action.id, (t) => ({ ...t, status: 'cancelled' }));

    case 'clearFinished':
      return { tasks: state.tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled') };

    default:
      return state;
  }
}
