'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, UploadCloud, X } from 'lucide-react';
import type { UploadTask } from '@/hooks/upload-queue';
import { Button } from '@/components/ui/button';
import { UploadItem } from './UploadItem';

/**
 * Fixed bottom-right dock, mirroring the toast viewport's responsive
 * positioning (full-width with side margins on phones, a capped card from
 * `sm` up) so it never covers the whole screen on a 375px viewport.
 * Collapsible so uploads can keep running while the user keeps browsing.
 *
 * Stacked above the toast viewport (`bottom-24` vs. the viewport's
 * `bottom-4`) rather than sharing its coordinates — otherwise a toast (e.g.
 * the non-PDF rejection fired by the very drop that populates this dock)
 * renders on top of it, hiding most of the dock on a narrow screen.
 */
export function UploadQueue({
  tasks,
  retry,
  cancel,
  clearFinished,
}: {
  tasks: UploadTask[];
  retry: (id: string) => void;
  cancel: (id: string) => void;
  clearFinished: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);

  // Conflicts are surfaced through the modal dialog, not this list — a row
  // for them here would just sit behind the modal duplicating that state.
  const visible = tasks.filter((t) => t.status !== 'conflict');
  if (visible.length === 0) return null;

  const activeCount = visible.filter((t) => t.status === 'queued' || t.status === 'uploading').length;
  const hasFinished = visible.some((t) => t.status === 'done' || t.status === 'cancelled');
  const errorCount = visible.filter((t) => t.status === 'error').length;

  return (
    <div className="fixed inset-x-4 bottom-24 z-30 mx-auto w-auto max-w-sm sm:right-4 sm:left-auto sm:mx-0 sm:w-96">
      <div className="overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <UploadCloud className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm font-medium"
            aria-expanded={!collapsed}
          >
            <span className="truncate">
              {activeCount > 0
                ? `Uploading ${activeCount} file${activeCount === 1 ? '' : 's'}…`
                : errorCount > 0
                  ? `${errorCount} upload${errorCount === 1 ? '' : 's'} failed`
                  : 'Uploads complete'}
            </span>
            {collapsed ? (
              <ChevronUp className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
          {hasFinished && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Clear finished uploads"
              onClick={clearFinished}
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
        {!collapsed && (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto p-2">
            {visible.map((task) => (
              <UploadItem key={task.id} task={task} onRetry={retry} onCancel={cancel} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
