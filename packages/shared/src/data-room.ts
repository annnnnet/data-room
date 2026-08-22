import { z } from 'zod';

export const dataRoomDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  rootNodeId: z.string(),
  isOwner: z.boolean(),
  createdAt: z.string(),
});
export type DataRoomDto = z.infer<typeof dataRoomDtoSchema>;

export const createDataRoomSchema = z.object({ name: z.string().min(1).max(120) });
