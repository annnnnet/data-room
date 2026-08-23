'use client';

import { useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewFolderDialog } from '@/components/dialogs/NewFolderDialog';

/**
 * Upload, search, and share all belong to later tasks (they need real
 * flows — a drop zone with progress, a results list, a link/permission
 * form) so this only ships "New folder", which is a complete flow start to
 * finish. Hidden entirely in `readOnly` — there's nothing left to show.
 */
export function Toolbar({ parentId, readOnly }: { parentId: string; readOnly: boolean }) {
  if (readOnly) return null;
  return <NewFolderButton parentId={parentId} />;
}

function NewFolderButton({ parentId }: { parentId: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderPlus className="size-4" aria-hidden="true" />
        New folder
      </Button>
      <NewFolderDialog open={open} onOpenChange={setOpen} parentId={parentId} />
    </div>
  );
}
