import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import type { UploadTask } from '@/hooks/upload-queue';
import { UploadItem } from './UploadItem';

afterEach(() => {
  cleanup();
});

function task(overrides: Partial<UploadTask>): UploadTask {
  return {
    id: 'upload-1',
    file: new File(['x'], 'report.pdf', { type: 'application/pdf' }),
    name: 'report.pdf',
    parentId: 'parent-1',
    status: 'uploading',
    progress: 40,
    ...overrides,
  };
}

describe('UploadItem', () => {
  it('renders exactly one progress bar for an uploading task', () => {
    render(<UploadItem task={task({ status: 'uploading', progress: 40 })} onRetry={vi.fn()} onCancel={vi.fn()} />);
    // This is the regression the double-bar bug would have failed: `Progress`
    // rendering both its children and its own default track duplicated the row.
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('renders exactly one progress bar for a queued task', () => {
    render(<UploadItem task={task({ status: 'queued', progress: 0 })} onRetry={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });

  it('renders no progress bar once the task is done', () => {
    render(<UploadItem task={task({ status: 'done', progress: 100 })} onRetry={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
  });

  it('wires the Cancel button to onCancel with the task id, for a queued task', () => {
    const onCancel = vi.fn();
    render(<UploadItem task={task({ status: 'queued', progress: 0 })} onRetry={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /Cancel report\.pdf/ }));
    expect(onCancel).toHaveBeenCalledWith('upload-1');
  });

  it('wires the Cancel button to onCancel with the task id, for an uploading task', () => {
    const onCancel = vi.fn();
    render(<UploadItem task={task({ status: 'uploading', progress: 60 })} onRetry={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /Cancel report\.pdf/ }));
    expect(onCancel).toHaveBeenCalledWith('upload-1');
  });

  it('does not show Cancel once a task is done, errored, or cancelled', () => {
    for (const status of ['done', 'error', 'cancelled'] as const) {
      const { unmount } = render(
        <UploadItem task={task({ status, progress: status === 'done' ? 100 : 0 })} onRetry={vi.fn()} onCancel={vi.fn()} />,
      );
      expect(screen.queryByRole('button', { name: /Cancel/ })).not.toBeInTheDocument();
      unmount();
    }
  });

  it('wires the Retry button to onRetry with the task id, only for errored tasks', () => {
    const onRetry = vi.fn();
    render(<UploadItem task={task({ status: 'error', progress: 0, error: 'Network error' })} onRetry={onRetry} onCancel={vi.fn()} />);

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    fireEvent.click(retryButton);
    expect(onRetry).toHaveBeenCalledWith('upload-1');
  });

  it('does not show Retry for a task that is not errored', () => {
    render(<UploadItem task={task({ status: 'uploading', progress: 10 })} onRetry={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
  });
});
