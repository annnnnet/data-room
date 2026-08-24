'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { DataRoomDto } from '@data-room/shared';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';

export function NewDataRoomDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (name: string) => api.post<DataRoomDto>('/api/data-rooms', { name }),
    onSuccess: async (room) => {
      // `invalidateQueries` alone can lose this race: if the list's own
      // mount fetch is still in flight when this runs, TanStack Query
      // dedupes the invalidated refetch onto that same in-flight promise
      // (see `Query.fetch` — a fetch already underway is joined, not
      // restarted, unless nothing is in flight) rather than issuing a new
      // request, so the room this just created can silently fail to appear
      // until something else re-triggers the query. Cancelling first
      // aborts that stale in-flight fetch so the invalidated refetch is
      // guaranteed to be a fresh request made after this mutation settled.
      await queryClient.cancelQueries({ queryKey: ['data-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['data-rooms'] });
      toast.add({ title: 'Data room created', description: room.name, type: 'success' });
      setOpen(false);
      setName('');
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not create the data room. Try again.');
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Give your data room a name.');
      return;
    }
    setError(null);
    create.mutate(trimmed);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setName('');
        }
      }}
    >
      <DialogTrigger render={<Button />}>
        <Plus className="size-4" aria-hidden="true" />
        New data room
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>New data room</DialogTitle>
            <DialogDescription>
              Give it a name you&apos;ll recognize later. You can rename it any time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            <Label htmlFor="room-name">Name</Label>
            <Input
              id="room-name"
              autoFocus
              placeholder="Series B diligence"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={create.isPending}
              aria-invalid={error ? true : undefined}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
