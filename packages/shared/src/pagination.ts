import { z } from 'zod';
import { NodeType } from './node';

export const cursorSchema = z.object({
  type: NodeType,
  name: z.string(),
  id: z.string(),
});
export type Cursor = z.infer<typeof cursorSchema>;

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const json = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    const parsed = cursorSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function pageSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
