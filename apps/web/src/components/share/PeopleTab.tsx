'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import type { ShareDto } from '@data-room/shared';
import { api, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/toast';
import { TableSkeleton } from '@/components/states/TableSkeleton';
import { ErrorState } from '@/components/states/ErrorState';
import { EmptyState } from '@/components/states/EmptyState';
import { ShareeRow } from './ShareeRow';

export function PeopleTab({ nodeId }: { nodeId: string }) {
  const qc = useQueryClient();
  const key = ['shares', nodeId];
  const shares = useQuery({
    queryKey: key,
    queryFn: () => api.get<ShareDto[]>(`/api/nodes/${nodeId}/shares`),
  });

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: (email: string) =>
      api.post<ShareDto>(`/api/nodes/${nodeId}/shares`, { kind: 'USER', email }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      setEmail('');
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not send the invite. Try again.');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/shares/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || invite.isPending) return;
    setError(null);
    invite.mutate(trimmed);
  }

  const people = (shares.data ?? []).filter((s) => s.kind === 'USER');

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSubmit} className="flex items-start gap-2">
        <div className="flex-1">
          <Label htmlFor="invite-email" className="sr-only">
            Invite by email
          </Label>
          <Input
            id="invite-email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            disabled={invite.isPending}
            aria-invalid={error ? true : undefined}
          />
        </div>
        <Button type="submit" disabled={invite.isPending || !email.trim()}>
          {invite.isPending ? 'Inviting…' : 'Invite'}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {shares.isPending ? (
        <TableSkeleton variant="rows" rows={3} label="Loading people with access" />
      ) : shares.isError ? (
        <ErrorState message="Could not load who has access." onRetry={() => shares.refetch()} />
      ) : people.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No one invited yet"
          description="Invite someone by email to give them read-only access."
        />
      ) : (
        <div className="divide-y">
          {people.map((share) => (
            <ShareeRow
              key={share.id}
              share={share}
              removing={remove.isPending && remove.variables === share.id}
              onRemove={() => {
                remove.mutate(share.id, {
                  onSuccess: () => {
                    toast.add({
                      title: `Access revoked for ${share.granteeEmail}`,
                      type: 'success',
                    });
                  },
                  onError: (err) => {
                    toast.add({
                      title:
                        err instanceof ApiError
                          ? err.message
                          : 'Could not remove access. Try again.',
                      type: 'error',
                    });
                  },
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
