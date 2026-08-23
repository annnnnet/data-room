import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NodeDto } from '@data-room/shared';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { movePatch, removePatch, renamePatch, type Pages } from './node-mutation-patches';

/**
 * Rename/move/delete are optimistic against the `['children', parentId]`
 * cache (rolled back on failure); `createFolder` has nothing worth
 * optimistically inserting (the server assigns the id) so it just
 * invalidates on success.
 */
export function useNodeMutations(parentId: string) {
  const qc = useQueryClient();
  const key = ['children', parentId];

  /** Optimistically patch the cached pages, restoring them if the API rejects. */
  function optimistic<TVars>(patch: (pages: Pages, vars: TVars) => Pages) {
    return {
      onMutate: async (vars: TVars) => {
        await qc.cancelQueries({ queryKey: key });
        const previous = qc.getQueryData<Pages>(key);
        if (previous) qc.setQueryData<Pages>(key, patch(previous, vars));
        return { previous };
      },
      onError: (err: unknown, _vars: TVars, ctx?: { previous?: Pages }) => {
        if (ctx?.previous) qc.setQueryData(key, ctx.previous);
        const message =
          err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
        toast.add({ title: message, type: 'error' });
      },
      onSettled: () => qc.invalidateQueries({ queryKey: key }),
    };
  }

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<NodeDto>(`/api/nodes/${id}`, { name }),
    ...optimistic<{ id: string; name: string }>(renamePatch),
  });

  const remove = useMutation({
    mutationFn: ({ id }: { id: string }) => api.del(`/api/nodes/${id}`),
    ...optimistic<{ id: string }>(removePatch),
  });

  const move = useMutation({
    mutationFn: ({ id, parentId: dest }: { id: string; parentId: string }) =>
      api.patch<NodeDto>(`/api/nodes/${id}`, { parentId: dest }),
    ...optimistic<{ id: string; parentId: string }>(movePatch),
  });

  // No optimistic insert (the server assigns the id) and no toast on
  // failure — the caller (Toolbar's dialog) shows the error inline next to
  // the form, same as the "new data room" dialog.
  const createFolder = useMutation({
    mutationFn: (name: string) => api.post<NodeDto>('/api/folders', { parentId, name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { rename, move, remove, createFolder };
}
