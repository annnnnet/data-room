import { Skeleton } from '@/components/ui/skeleton';

/**
 * Loading placeholder. `variant="grid"` (default) renders card-shaped
 * skeletons for the data room list; `variant="rows"` renders table-row
 * shaped skeletons for the folder browser.
 */
export function TableSkeleton({
  rows = 3,
  variant = 'grid',
  label = 'Loading',
}: {
  rows?: number;
  variant?: 'grid' | 'rows';
  label?: string;
}) {
  if (variant === 'rows') {
    return (
      <div className="divide-y" role="status" aria-label={label}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-2 py-2.5">
            <Skeleton className="size-4 shrink-0 rounded-sm" />
            <Skeleton className="h-4 w-1/3 min-w-24" />
            <Skeleton className="ml-auto h-3 w-14 shrink-0" />
            <Skeleton className="h-3 w-20 shrink-0" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      role="status"
      aria-label={label}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-9 rounded-md" />
            <Skeleton className="h-4 w-2/3" />
          </div>
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
