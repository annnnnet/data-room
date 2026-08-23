import { useInfiniteQuery } from '@tanstack/react-query';
import type { NodeDto } from '@data-room/shared';
import { api } from '@/lib/api';

type Page = { items: NodeDto[]; nextCursor: string | null };

export function useNodeChildren(nodeId: string) {
  return useInfiniteQuery({
    queryKey: ['children', nodeId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<Page>(
        `/api/nodes/${nodeId}/children?limit=50${pageParam ? `&cursor=${pageParam}` : ''}`,
      ),
    getNextPageParam: (last) => last.nextCursor,
  });
}
