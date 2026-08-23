import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ErrorState({
  title = "Couldn't load that",
  message,
  onRetry,
  action,
}: {
  title?: string;
  message?: string;
  /** Retries the failed request. Omit when there's nothing to retry (e.g. the resource is gone). */
  onRetry?: () => void;
  /** A way back to somewhere still valid, rendered as a link. */
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        {message && <p className="max-w-sm text-sm text-muted-foreground">{message}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
      {action && (
        <Button variant="outline" size="sm" render={<Link href={action.href} />} className="mt-2">
          {action.label}
        </Button>
      )}
    </div>
  );
}
