import { z } from 'zod';

export const onConflictSchema = z.enum(['KEEP_BOTH', 'REPLACE', 'FAIL']);
export type OnConflict = z.infer<typeof onConflictSchema>;

export const uploadUrlRequestSchema = z.object({
  parentId: z.string(),
  name: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
  mimeType: z.string(),
  onConflict: onConflictSchema.default('FAIL'),
});
export type UploadUrlRequest = z.infer<typeof uploadUrlRequestSchema>;

export const uploadUrlResponseSchema = z.object({
  nodeId: z.string(),
  versionId: z.string(),
  uploadUrl: z.string(),
  finalName: z.string(),
});
export type UploadUrlResponse = z.infer<typeof uploadUrlResponseSchema>;

export const fileVersionDtoSchema = z.object({
  id: z.string(),
  versionNumber: z.number(),
  sizeBytes: z.number(),
  mimeType: z.string(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  isCurrent: z.boolean(),
});
export type FileVersionDto = z.infer<typeof fileVersionDtoSchema>;

export const completeUploadSchema = z.object({
  versionId: z.string(),
});
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

export const downloadDispositionSchema = z.enum(['inline', 'attachment']);
export type DownloadDisposition = z.infer<typeof downloadDispositionSchema>;
