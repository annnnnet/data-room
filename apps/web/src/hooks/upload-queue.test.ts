import { describe, it, expect } from 'vitest';
import { uploadReducer, initialState, makeTaskId, type NewTask } from './upload-queue';

const file = (name: string) => new File(['x'], name, { type: 'application/pdf' });

/** Builds an `add` action the way `addFiles` does: ids minted outside the reducer. */
function addAction(names: string[], parentId = 'parent-1') {
  const tasks: NewTask[] = names.map((n) => ({ id: makeTaskId(), file: file(n), parentId }));
  return { type: 'add' as const, tasks };
}

describe('uploadReducer', () => {
  it('adds files as queued, tagged with the parentId supplied at add time', () => {
    const s = uploadReducer(initialState, addAction(['a.pdf', 'b.pdf'], 'folder-A'));
    expect(s.tasks.map((t) => t.status)).toEqual(['queued', 'queued']);
    expect(s.tasks.map((t) => t.parentId)).toEqual(['folder-A', 'folder-A']);
  });

  it('runs at most three uploads at once', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']));
    s = uploadReducer(s, { type: 'pump' });
    expect(s.tasks.filter((t) => t.status === 'uploading')).toHaveLength(3);
  });

  it('starts the next queued file when one finishes', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']));
    s = uploadReducer(s, { type: 'pump' });
    s = uploadReducer(s, { type: 'done', id: s.tasks[0].id });
    s = uploadReducer(s, { type: 'pump' });
    expect(s.tasks.filter((t) => t.status === 'uploading')).toHaveLength(3);
    expect(s.tasks[3].status).toBe('uploading');
  });

  it('records progress per task', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf']));
    s = uploadReducer(s, { type: 'progress', id: s.tasks[0].id, progress: 42 });
    expect(s.tasks[0].progress).toBe(42);
  });

  it('moves a task to conflict with the suggested name', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf']));
    s = uploadReducer(s, { type: 'conflict', id: s.tasks[0].id, suggestedName: 'a (2).pdf' });
    expect(s.tasks[0]).toMatchObject({ status: 'conflict', suggestedName: 'a (2).pdf' });
  });

  it('requeues a failed task on retry and clears its error', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf']));
    s = uploadReducer(s, { type: 'error', id: s.tasks[0].id, error: 'network' });
    s = uploadReducer(s, { type: 'retry', id: s.tasks[0].id });
    expect(s.tasks[0]).toMatchObject({ status: 'queued', error: undefined, progress: 0 });
  });

  it('keeps the queue moving when one task errors, promoting the next queued task on pump', () => {
    // Four files against MAX_CONCURRENT = 3, so one is genuinely still
    // `queued` (not just `uploading` regardless) when the first errors —
    // this is what actually exercises the "error frees a slot" path.
    let s = uploadReducer(initialState, addAction(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']));
    s = uploadReducer(s, { type: 'pump' });
    expect(s.tasks[3].status).toBe('queued');
    s = uploadReducer(s, { type: 'error', id: s.tasks[0].id, error: 'network' });
    s = uploadReducer(s, { type: 'pump' });
    expect(s.tasks[3].status).toBe('uploading');
  });

  it('conflict frees a slot for the next queued task on pump', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']));
    s = uploadReducer(s, { type: 'pump' });
    s = uploadReducer(s, { type: 'conflict', id: s.tasks[0].id, suggestedName: 'a (2).pdf' });
    s = uploadReducer(s, { type: 'pump' });
    expect(s.tasks[3].status).toBe('uploading');
  });

  it('cancelled frees a slot and the next queued task is promoted on pump', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']));
    s = uploadReducer(s, { type: 'pump' });
    s = uploadReducer(s, { type: 'cancel', id: s.tasks[0].id });
    s = uploadReducer(s, { type: 'pump' });
    expect(s.tasks[0].status).toBe('cancelled');
    expect(s.tasks[3].status).toBe('uploading');
  });

  it('pump does not over-promote when several tasks finish in the same tick', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf']));
    s = uploadReducer(s, { type: 'pump' });
    // Two of the three uploading tasks finish before the next pump — only
    // two slots should open up, not all five queued/finishing tasks moving.
    s = uploadReducer(s, { type: 'done', id: s.tasks[0].id });
    s = uploadReducer(s, { type: 'done', id: s.tasks[1].id });
    s = uploadReducer(s, { type: 'pump' });
    const statuses = s.tasks.map((t) => t.status);
    expect(statuses.filter((st) => st === 'uploading')).toHaveLength(3);
    expect(statuses.filter((st) => st === 'done')).toHaveLength(2);
    expect(statuses.filter((st) => st === 'queued')).toHaveLength(0);
  });

  it('drops finished tasks on clear but keeps errors, conflicts, and queued tasks visible', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf']));
    s = uploadReducer(s, { type: 'done', id: s.tasks[0].id });
    s = uploadReducer(s, { type: 'error', id: s.tasks[1].id, error: 'network' });
    s = uploadReducer(s, { type: 'conflict', id: s.tasks[2].id, suggestedName: 'c (2).pdf' });
    // s.tasks[3] stays queued.
    s = uploadReducer(s, { type: 'clearFinished' });
    expect(s.tasks.map((t) => t.status)).toEqual(['error', 'conflict', 'queued']);
  });

  it('cancels a task', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf']));
    s = uploadReducer(s, { type: 'cancel', id: s.tasks[0].id });
    expect(s.tasks[0].status).toBe('cancelled');
  });

  it('does not promote a cancelled task on pump', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf']));
    s = uploadReducer(s, { type: 'cancel', id: s.tasks[0].id });
    s = uploadReducer(s, { type: 'pump' });
    expect(s.tasks[0].status).toBe('cancelled');
  });

  it('resolveConflict requeues with the chosen onConflict and clears the suggestion', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf']));
    s = uploadReducer(s, { type: 'conflict', id: s.tasks[0].id, suggestedName: 'a (2).pdf' });
    s = uploadReducer(s, {
      type: 'resolveConflict',
      id: s.tasks[0].id,
      onConflict: 'KEEP_BOTH',
    });
    expect(s.tasks[0]).toMatchObject({
      status: 'queued',
      onConflict: 'KEEP_BOTH',
      suggestedName: undefined,
    });
  });

  it('resolveConflict with SKIP cancels the task instead of requeuing it', () => {
    let s = uploadReducer(initialState, addAction(['a.pdf']));
    s = uploadReducer(s, { type: 'conflict', id: s.tasks[0].id, suggestedName: 'a (2).pdf' });
    s = uploadReducer(s, { type: 'resolveConflict', id: s.tasks[0].id, onConflict: 'SKIP' });
    expect(s.tasks[0].status).toBe('cancelled');
  });

  describe('terminal-state safety', () => {
    it('ignores a late progress dispatch for an already-cancelled task', () => {
      let s = uploadReducer(initialState, addAction(['a.pdf']));
      s = uploadReducer(s, { type: 'cancel', id: s.tasks[0].id });
      s = uploadReducer(s, { type: 'progress', id: s.tasks[0].id, progress: 55 });
      expect(s.tasks[0]).toMatchObject({ status: 'cancelled', progress: 0 });
    });

    it('ignores a late done dispatch for an already-cancelled task — it does not flip back to green', () => {
      let s = uploadReducer(initialState, addAction(['a.pdf']));
      s = uploadReducer(s, { type: 'cancel', id: s.tasks[0].id });
      s = uploadReducer(s, { type: 'done', id: s.tasks[0].id, name: 'a.pdf' });
      expect(s.tasks[0].status).toBe('cancelled');
    });

    it('ignores a late error dispatch for an already-cancelled task', () => {
      let s = uploadReducer(initialState, addAction(['a.pdf']));
      s = uploadReducer(s, { type: 'cancel', id: s.tasks[0].id });
      s = uploadReducer(s, { type: 'error', id: s.tasks[0].id, error: 'network' });
      expect(s.tasks[0].status).toBe('cancelled');
      expect(s.tasks[0].error).toBeUndefined();
    });

    it('ignores a late conflict dispatch for an already-cancelled task', () => {
      let s = uploadReducer(initialState, addAction(['a.pdf']));
      s = uploadReducer(s, { type: 'cancel', id: s.tasks[0].id });
      s = uploadReducer(s, {
        type: 'conflict',
        id: s.tasks[0].id,
        suggestedName: 'a (2).pdf',
      });
      expect(s.tasks[0].status).toBe('cancelled');
      expect(s.tasks[0].suggestedName).toBeUndefined();
    });
  });

  describe('reducer determinism', () => {
    it('dispatching the same add action twice against the same starting state produces identical output', () => {
      const action = addAction(['a.pdf', 'b.pdf']);
      const s1 = uploadReducer(initialState, action);
      const s2 = uploadReducer(initialState, action);
      expect(s2).toEqual(s1);
    });
  });

  it('done applies the server-confirmed finalName', () => {
    let s = uploadReducer(initialState, addAction(['report.pdf']));
    s = uploadReducer(s, { type: 'done', id: s.tasks[0].id, name: 'report (2).pdf' });
    expect(s.tasks[0].name).toBe('report (2).pdf');
  });
});
