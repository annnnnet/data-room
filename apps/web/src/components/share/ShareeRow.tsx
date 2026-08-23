'use client';

import { X } from 'lucide-react';
import type { ShareDto } from '@data-room/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getInitials } from '@/lib/avatar';

/**
 * One grantee row. `share.granteeName` only populates once the invited
 * person has actually signed in (see the API's reconciliation flow) — until
 * then this reads as a pending invite by email, not an error or a blank
 * row, since that's a perfectly normal state for an invite to be in.
 */
export function ShareeRow({
  share,
  onRemove,
  removing,
}: {
  share: ShareDto;
  onRemove: () => void;
  removing: boolean;
}) {
  const email = share.granteeEmail ?? 'Unknown';
  const label = share.granteeName ?? email;
  const pending = !share.granteeName;

  return (
    <div className="flex items-center gap-3 py-2">
      <div
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
        aria-hidden="true"
      >
        {getInitials(label)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium" title={label}>
          {label}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>Viewer</span>
          {pending && (
            <>
              <span aria-hidden="true">·</span>
              <Badge variant="outline">Pending invite</Badge>
            </>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onRemove}
        disabled={removing}
        aria-label={`Remove ${email}`}
      >
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}
