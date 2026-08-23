import { z } from 'zod';
import { nodeDtoSchema } from './node';

/**
 * Query params for GET /search. Both `dataRoomId` and `q` are required and
 * must be non-empty strings — an empty or missing value must be rejected
 * (400) rather than silently reaching Prisma as `undefined`, which would
 * omit the filter entirely and turn a scoped search into an unscoped one.
 */
export const searchQuerySchema = z.object({
  dataRoomId: z.string().min(1),
  q: z.string().min(1),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const searchHitSchema = nodeDtoSchema.extend({
  breadcrumbLabel: z.string(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;
