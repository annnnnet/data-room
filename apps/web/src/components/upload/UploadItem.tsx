'use client';

import { CheckCircle2, FileText, TriangleAlert, X } from 'lucide-react';
import type { UploadTask } from '@/hooks/upload-queue';
import { Button } from '@/components/ui/button';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

function StatusIcon({ status }: { status: UploadTask['status'] }) {
  if (status === 'done') return <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />;
  if (status === 'error') return <TriangleAlert className="size-4 shrink-0 text-destructive" aria-hidden="true" />;
  if (status === 'uploading' || status === 'queued')
    return (
      <FileText
        className={cn('size-4 shrink-0', status === 'queued' ? 'text-muted-foreground/60' : 'text-muted-foreground')}
        aria-hidden="true"
      />
    );
  return <FileText className="size-4 shrink-0 text-muted-foreground/60" aria-hidden="true" />;
}

/**
 * One row in the upload dock. `conflict` tasks aren't rendered here — the
 * modal `ConflictDialog` owns that state, and once resolved the task goes
 * straight back to `queued`/`cancelled` and shows up (or doesn't) as usual.
 */
export function UploadItem({
  task,
  onRetry,
  onCancel,
}: {
  task: UploadTask;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const statusText =
    task.status === 'queued'
      ? 'Waiting…'
      : task.status === 'uploading'
        ? `${task.progress}%`
        : task.status === 'done'
          ? 'Done'
          : task.status === 'cancelled'
            ? 'Cancelled'
            : (task.error ?? 'Failed');

  return (
    <li
      className={cn(
        'flex items-start gap-2 rounded-lg border px-2.5 py-2 text-sm',
        task.status === 'error' && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <StatusIcon status={task.status} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" title={task.name}>
          {task.name}
        </p>
        {task.status === 'uploading' || task.status === 'queued' ? (
          <Progress value={task.status === 'uploading' ? task.progress : 0} className="mt-1 gap-1">
            <ProgressTrack className="h-1">
              <ProgressIndicator />
            </ProgressTrack>
          </Progress>
        ) : null}
        <p
          className={cn(
            'mt-0.5 text-xs',
            task.status === 'error' ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {statusText}
        </p>
      </div>
      {task.status === 'error' && (
        <Button variant="outline" size="xs" onClick={() => onRetry(task.id)}>
          Retry
        </Button>
      )}
      {(task.status === 'queued' || task.status === 'uploading') && (
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Cancel ${task.name}`}
          onClick={() => onCancel(task.id)}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </li>
  );
}
