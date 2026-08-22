import { z } from 'zod';

export const NodeType = z.enum(['FOLDER', 'FILE']);
export type NodeType = z.infer<typeof NodeType>;

export const Role = z.enum(['OWNER', 'VIEWER']);
export type Role = z.infer<typeof Role>;

export const nodeDtoSchema = z.object({
  id: z.string(),
  dataRoomId: z.string(),
  parentId: z.string().nullable(),
  type: NodeType,
  name: z.string(),
  updatedAt: z.string(),
  sizeBytes: z.number().nullable(),
  mimeType: z.string().nullable(),
  versionCount: z.number().nullable(),
});
export type NodeDto = z.infer<typeof nodeDtoSchema>;

export const breadcrumbSchema = z.object({ id: z.string(), name: z.string() });

export const nodeDetailSchema = nodeDtoSchema.extend({
  breadcrumbs: z.array(breadcrumbSchema),
  myRole: Role,
});
export type NodeDetail = z.infer<typeof nodeDetailSchema>;

export const nodeStatsSchema = z.object({
  fileCount: z.number(),
  folderCount: z.number(),
  totalBytes: z.number(),
});
export type NodeStats = z.infer<typeof nodeStatsSchema>;

export const createFolderSchema = z.object({
  parentId: z.string(),
  name: z.string().min(1).max(255),
});

export const updateNodeSchema = z
  .object({ name: z.string().min(1).max(255).optional(), parentId: z.string().optional() })
  .refine((v) => v.name !== undefined || v.parentId !== undefined, {
    message: 'name or parentId required',
  });

/**
 * Query params for GET /nodes/:id/children. `limit` arrives as a query
 * string, so it's coerced to a number and bounded — an out-of-range or
 * non-numeric value is rejected (400) rather than silently clamped or
 * turned into NaN/Prisma's backward-pagination reading of a negative
 * `take`. `cursor` is checked for well-formedness (not just "is a string")
 * by the service, which rejects an undecodable cursor rather than quietly
 * serving page 1.
 */
export const childrenQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type ChildrenQuery = z.infer<typeof childrenQuerySchema>;
