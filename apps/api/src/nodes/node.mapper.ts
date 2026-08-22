import type { NodeDto } from '@data-room/shared';

type NodeWithVersion = {
  id: string; dataRoomId: string; parentId: string | null;
  type: 'FOLDER' | 'FILE'; name: string; updatedAt: Date;
  currentVersion?: { sizeBytes: bigint; mimeType: string } | null;
  _count?: { versions: number };
};

export function toNodeDto(n: NodeWithVersion): NodeDto {
  return {
    id: n.id,
    dataRoomId: n.dataRoomId,
    parentId: n.parentId,
    type: n.type,
    name: n.name,
    updatedAt: n.updatedAt.toISOString(),
    sizeBytes: n.currentVersion ? Number(n.currentVersion.sizeBytes) : null,
    mimeType: n.currentVersion?.mimeType ?? null,
    versionCount: n._count?.versions ?? null,
  };
}
