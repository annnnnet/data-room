import { Loader2 } from 'lucide-react';

/** Full-viewport loading indicator for the brief window before the initial
 * Supabase session resolves — not a list state, just enough so the screen
 * isn't blank while we decide where to route the visitor. */
export function PageSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center py-24" role="status" aria-label="Loading">
      <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  );
}
