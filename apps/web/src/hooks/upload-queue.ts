import type { OnConflict } from '@data-room/shared';

/** How many uploads run over the wire at the same time. */
export const MAX_CONCURRENT = 3;

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'conflict' | 'cancelled';

/** A status a task never leaves once reached — see the reducer's terminal-state guard. */
const TERMINAL_STATUSES: ReadonlySet<UploadStatus> = new Set(['cancelled']);

export type UploadTask = {
  id: string;
  file: File;
  /** The name currently being requested — starts as `file.name`, may change on a "keep both" resolution. */
  name: string;
  /**
   * The folder this task uploads into, captured at `add` time. Using this
   * (never the hook's live `parentId`) is what keeps an in-flight upload
   * landing in the folder it was dropped into even if the user has since
   * navigated elsewhere.
   */
  parentId: string;
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

/** One task's id plus the identity it's minted with — computed by the caller so `add` stays pure. */
export type NewTask = { id: string; file: File; parentId: string };

export type UploadAction =
  | { type: 'add'; tasks: NewTask[] }
  | { type: 'pump' }
  | { type: 'progress'; id: string; progress: number }
  | { type: 'done'; id: string; name?: string }
  | { type: 'error'; id: string; error: string }
  | { type: 'conflict'; id: string; suggestedName: string }
  | { type: 'resolveConflict'; id: string; onConflict: OnConflict | 'SKIP' }
  | { type: 'retry'; id: string }
  | { type: 'cancel'; id: string }
  | { type: 'clearFinished' };

let nextId = 0;
/** Called from `addFiles`, outside the reducer, so ids are stable if React replays the `add` action. */
export function makeTaskId(): string {
  nextId += 1;
  return `upload-${Date.now()}-${nextId}`;
}

function mapTask(state: UploadState, id: string, fn: (t: UploadTask) => UploadTask): UploadState {
  return { tasks: state.tasks.map((t) => (t.id === id ? fn(t) : t)) };
}

/**
 * Applies `fn` to the task unless it has already reached a terminal status
 * (currently just `cancelled`) — a `progress`/`done`/`error`/`conflict`
 * dispatch that loses a race with a cancel must not resurrect the row.
 */
function mapUnlessTerminal(
  state: UploadState,
  id: string,
  fn: (t: UploadTask) => UploadTask,
): UploadState {
  return mapTask(state, id, (t) => (TERMINAL_STATUSES.has(t.status) ? t : fn(t)));
}

export function uploadReducer(state: UploadState, action: UploadAction): UploadState {
  switch (action.type) {
    case 'add': {
      const added: UploadTask[] = action.tasks.map(({ id, file, parentId }) => ({
        id,
        file,
        parentId,
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
      return mapUnlessTerminal(state, action.id, (t) => ({ ...t, progress: action.progress }));

    case 'done':
      return mapUnlessTerminal(state, action.id, (t) => ({
        ...t,
        status: 'done',
        progress: 100,
        name: action.name ?? t.name,
      }));

    case 'error':
      return mapUnlessTerminal(state, action.id, (t) => ({
        ...t,
        status: 'error',
        error: action.error,
      }));

    case 'conflict':
      return mapUnlessTerminal(state, action.id, (t) => ({
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
