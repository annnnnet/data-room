import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NodeDto } from '@data-room/shared';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/components/ui/toast';
import { markPendingPatch, renamePatch, type Pages } from './node-mutation-patches';

export type UseNodeMutationsOptions = {
  /**
   * Whether a failed rename/move/delete also raises the global error toast.
   * Defaults to `true` — callers get feedback for free. The four dialogs in
   * this folder pass `false` because they already render the same failure
   * inline next to the form; without the opt-out, React Query fires both
   * the hook-level `onError` and the dialog's call-level `onError`, so the
   * user would see one failure reported twice (a persistent inline message
   * plus a toast floating beside the open modal).
   */
  toastOnError?: boolean;
};

/**
 * Rename/move/delete are optimistic against the `['children', parentId]`
 * cache (rolled back on failure); `createFolder` has nothing worth
 * optimistically inserting (the server assigns the id) so it just
 * invalidates on success.
 */
export function useNodeMutations(parentId: string, options: UseNodeMutationsOptions = {}) {
  const { toastOnError = true } = options;
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
        if (!toastOnError) return;
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

  // Marked pending rather than removed on `onMutate` — see `markPendingPatch`
  // — so the row reads as "in flight" instead of vanishing and popping back
  // on a rollback.
  const remove = useMutation({
    mutationFn: ({ id }: { id: string }) => api.del(`/api/nodes/${id}`),
    ...optimistic<{ id: string }>(markPendingPatch),
  });

  const move = useMutation({
    mutationFn: ({ id, parentId: dest }: { id: string; parentId: string }) =>
      api.patch<NodeDto>(`/api/nodes/${id}`, { parentId: dest }),
    ...optimistic<{ id: string; parentId: string }>(markPendingPatch),
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
