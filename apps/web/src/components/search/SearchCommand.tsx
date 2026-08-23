'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { File, Folder, Loader2, SearchX } from 'lucide-react';
import type { SearchHit } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { splitHighlight } from './highlight';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

/**
 * ⌘K / Ctrl+K command palette, searching everything the current principal
 * (owner or share-link recipient — the API scopes both) can see in this
 * data room. Navigation is built off `basePath` so the same component works
 * for the owner route (`/r/{roomId}/f`) and the share route (`/s/{token}/f`)
 * — a share recipient never gets sent anywhere outside their share root
 * because the API itself never returns hits outside it.
 */
export function SearchCommand({
  roomId,
  basePath,
  open,
  onOpenChange,
}: {
  roomId: string;
  basePath: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [debounced, setDebounced] = useState('');

  // Reset on close so reopening the palette always starts from a blank slate.
  useEffect(() => {
    if (!open) {
      setInput('');
      setDebounced('');
    }
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(input.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const enabled = open && debounced.length >= MIN_QUERY_LENGTH;

  const query = useQuery({
    queryKey: ['search', roomId, debounced],
    queryFn: () =>
      api.get<{ items: SearchHit[]; nextCursor: string | null }>(
        `/api/search?dataRoomId=${encodeURIComponent(roomId)}&q=${encodeURIComponent(debounced)}&limit=20`,
      ),
    enabled,
  });

  function select(hit: SearchHit) {
    onOpenChange(false);
    if (hit.type === 'FOLDER') {
      router.push(`${basePath}/${hit.id}`);
      return;
    }
    // No parentId means the hit is a top-level child of whatever root the
    // caller can see — `basePath` alone (no trailing id) already means
    // "that root" everywhere else in the app.
    const parentPath = hit.parentId ? `${basePath}/${hit.parentId}` : basePath;
    router.push(`${parentPath}?open=${encodeURIComponent(hit.id)}`);
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Search this data room"
      description="Search files and folders by name"
    >
      <Command shouldFilter={false}>
        <CommandInput value={input} onValueChange={setInput} placeholder="Search files and folders…" />
        <CommandList>
          {input.trim().length < MIN_QUERY_LENGTH && (
            <CommandEmpty>Type at least {MIN_QUERY_LENGTH} characters to search.</CommandEmpty>
          )}

          {enabled && query.isFetching && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Searching…
            </div>
          )}

          {enabled && query.isError && (
            <div className="flex flex-col items-center gap-1 py-6 text-center text-sm">
              <p className="text-destructive">Search failed.</p>
              <p className="text-muted-foreground">
                {query.error instanceof ApiError ? query.error.message : 'Something went wrong.'}
              </p>
            </div>
          )}

          {enabled && !query.isFetching && !query.isError && query.data?.items.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
              <SearchX className="size-5" aria-hidden="true" />
              No files match &ldquo;{debounced}&rdquo;
            </div>
          )}

          {enabled &&
            !query.isFetching &&
            !query.isError &&
            query.data &&
            query.data.items.length > 0 && (
              <CommandGroup heading="Results">
                {query.data.items.map((hit) => {
                  const Icon = hit.type === 'FOLDER' ? Folder : File;
                  return (
                    <CommandItem
                      key={hit.id}
                      value={hit.id}
                      onSelect={() => select(hit)}
                      className="items-start gap-2"
                    >
                      <Icon
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                        <span className="truncate">
                          {splitHighlight(hit.name, debounced).map((part, i) =>
                            part.match ? (
                              <mark key={i} className="rounded-sm bg-primary/20 text-inherit">
                                {part.text}
                              </mark>
                            ) : (
                              <span key={i}>{part.text}</span>
                            ),
                          )}
                        </span>
                        {hit.breadcrumbLabel && (
                          <span className="shrink-0 truncate text-xs text-muted-foreground">
                            {hit.breadcrumbLabel}
                          </span>
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
