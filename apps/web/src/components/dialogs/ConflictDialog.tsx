'use client';

import { useState } from 'react';
import type { OnConflict } from '@data-room/shared';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Blocks on one name conflict at a time — `showCloseButton={false}` and no
 * `onOpenChange` because there's no neutral "dismiss": the caller renders
 * this only while a task is actually in `conflict`, and every button here
 * resolves that task one way or another (skip counts as a resolution).
 * `remainingCount` covers everyone still waiting so "apply to all" reads
 * accurately for the twenty-file case the brief calls out.
 */
export function ConflictDialog({
  fileName,
  suggestedName,
  remainingCount,
  onResolve,
}: {
  fileName: string;
  suggestedName: string;
  /** How many tasks (including this one) are currently in `conflict`. */
  remainingCount: number;
  onResolve: (choice: OnConflict | 'SKIP', applyToAll: boolean) => void;
}) {
  const [applyToAll, setApplyToAll] = useState(false);

  function resolve(choice: OnConflict | 'SKIP') {
    onResolve(choice, applyToAll);
    setApplyToAll(false);
  }

  return (
    <Dialog open modal>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>&ldquo;{fileName}&rdquo; already exists</DialogTitle>
          <DialogDescription>
            Choose how to handle it. Keeping both saves it as &ldquo;{suggestedName}&rdquo;.
          </DialogDescription>
        </DialogHeader>

        {remainingCount > 1 && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-input accent-primary"
              checked={applyToAll}
              onChange={(e) => setApplyToAll(e.target.checked)}
            />
            Apply to all {remainingCount} remaining conflicts
          </label>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => resolve('SKIP')}>
            Skip
          </Button>
          <Button variant="outline" onClick={() => resolve('REPLACE')}>
            Replace
          </Button>
          <Button onClick={() => resolve('KEEP_BOTH')}>Keep both</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
