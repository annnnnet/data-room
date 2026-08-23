import { describe, it, expect } from 'vitest';
import { uploadReducer, initialState, type UploadTask } from './upload-queue';

const file = (name: string) => new File(['x'], name, { type: 'application/pdf' });

describe('uploadReducer', () => {
  it('adds files as queued', () => {
    const s = uploadReducer(initialState, { type: 'add', files: [file('a.pdf'), file('b.pdf')] });
    expect(s.tasks.map((t) => t.status)).toEqual(['queued', 'queued']);
  });

  it('runs at most three uploads at once', () => {
    let s = uploadReducer(initialState, {
      type: 'add',
      files: ['a', 'b', 'c', 'd'].map((n) => file(`${n}.pdf`)),
    });
    s = uploadReducer(s, { type: 'pump' });
    expect(s.tasks.filter((t) => t.status === 'uploading')).toHaveLength(3);
  });

  it('starts the next queued file when one finishes', () => {
    let s = uploadReducer(initialState, {
      type: 'add',
      files: ['a', 'b', 'c', 'd'].map((n) => file(`${n}.pdf`)),
    });
    s = uploadReducer(s, { type: 'pump' });
    s = uploadReducer(s, { type: 'done', id: s.tasks[0].id });
    s = uploadReducer(s, { type: 'pump' });
    expect(s.tasks.filter((t) => t.status === 'uploading')).toHaveLength(3);
    expect(s.tasks[3].status).toBe('uploading');
  });

  it('records progress per task', () => {
    let s = uploadReducer(initialState, { type: 'add', files: [file('a.pdf')] });
    s = uploadReducer(s, { type: 'progress', id: s.tasks[0].id, progress: 42 });
    expect(s.tasks[0].progress).toBe(42);
  });

  it('moves a task to conflict with the suggested name', () => {
    let s = uploadReducer(initialState, { type: 'add', files: [file('a.pdf')] });
    s = uploadReducer(s, { type: 'conflict', id: s.tasks[0].id, suggestedName: 'a (2).pdf' });
    expect(s.tasks[0]).toMatchObject({ status: 'conflict', suggestedName: 'a (2).pdf' });
  });

  it('requeues a failed task on retry and clears its error', () => {
    let s = uploadReducer(initialState, { type: 'add', files: [file('a.pdf')] });
    s = uploadReducer(s, { type: 'error', id: s.tasks[0].id, error: 'network' });
    s = uploadReducer(s, { type: 'retry', id: s.tasks[0].id });
    expect(s.tasks[0]).toMatchObject({ status: 'queued', error: undefined, progress: 0 });
  });

  it('keeps the queue moving when one task errors', () => {
    let s = uploadReducer(initialState, { type: 'add', files: [file('a.pdf'), file('b.pdf')] });
    s = uploadReducer(s, { type: 'pump' });
    s = uploadReducer(s, { type: 'error', id: s.tasks[0].id, error: 'network' });
    expect(s.tasks[1].status).toBe('uploading');
  });

  it('drops finished tasks on clear but keeps errors visible', () => {
    let s = uploadReducer(initialState, { type: 'add', files: [file('a.pdf'), file('b.pdf')] });
    s = uploadReducer(s, { type: 'done', id: s.tasks[0].id });
    s = uploadReducer(s, { type: 'error', id: s.tasks[1].id, error: 'network' });
    s = uploadReducer(s, { type: 'clearFinished' });
    expect(s.tasks.map((t) => t.status)).toEqual(['error']);
  });

  it('cancels a task', () => {
    let s = uploadReducer(initialState, { type: 'add', files: [file('a.pdf')] });
    s = uploadReducer(s, { type: 'cancel', id: s.tasks[0].id });
    expect(s.tasks[0].status).toBe('cancelled');
  });

  it('does not promote a cancelled task on pump', () => {
    let s = uploadReducer(initialState, { type: 'add', files: [file('a.pdf')] });
    s = uploadReducer(s, { type: 'cancel', id: s.tasks[0].id });
    s = uploadReducer(s, { type: 'pump' });
    expect(s.tasks[0].status).toBe('cancelled');
  });

  it('resolveConflict requeues with the chosen onConflict and clears the suggestion', () => {
    let s = uploadReducer(initialState, { type: 'add', files: [file('a.pdf')] });
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
    let s = uploadReducer(initialState, { type: 'add', files: [file('a.pdf')] });
    s = uploadReducer(s, { type: 'conflict', id: s.tasks[0].id, suggestedName: 'a (2).pdf' });
    s = uploadReducer(s, { type: 'resolveConflict', id: s.tasks[0].id, onConflict: 'SKIP' });
    expect(s.tasks[0].status).toBe('cancelled');
  });

  it('type-checks UploadTask shape', () => {
    const t: UploadTask = {
      id: '1',
      file: file('a.pdf'),
      name: 'a.pdf',
      status: 'queued',
      progress: 0,
    };
    expect(t.status).toBe('queued');
  });
});
