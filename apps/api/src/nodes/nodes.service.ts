import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { encodeCursor, decodeCursor, type NodeDetail, type NodeStats } from '@data-room/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AccessService } from '../access/access.service';
import { AppError } from '../common/api-error';
import { ancestorIds, subtreePrefix } from '../common/path.util';
import { toNodeDto } from './node.mapper';
import type { Principal } from '../auth/auth.guard';

const INCLUDE = {
  currentVersion: { select: { sizeBytes: true, mimeType: true } },
  _count: { select: { versions: true } },
} as const;

/** Matches the Prisma schema's declared enum order — FOLDER sorts before FILE. */
const TYPE_ORDER = ['FOLDER', 'FILE'] as const;

@Injectable()
export class NodesService {
  constructor(
    private prisma: PrismaService,
    private access: AccessService,
  ) {}

  async detail(principal: Principal, id: string): Promise<NodeDetail> {
    const { role } = await this.access.resolve(principal, id);
    const node = await this.prisma.node.findUnique({ where: { id }, include: INCLUDE });
    if (!node) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);

    const chain = [...ancestorIds(node.path), node.id];
    const rows = await this.prisma.node.findMany({
      where: { id: { in: chain } },
      select: { id: true, name: true },
    });
    const breadcrumbs = chain.map((cid) => {
      const r = rows.find((x) => x.id === cid);
      if (!r) throw new AppError('NODE_NOT_FOUND', 'Not found', 404);
      return { id: r.id, name: r.name };
    });

    return { ...toNodeDto(node), breadcrumbs, myRole: role };
  }

  /**
   * Keyset pagination over (type, name, id) — the exact tuple the
   * (parentId, type, name) index sorts by. FOLDER sorts before FILE.
   *
   * Prisma's generated enum filter has no `gt`/`lt` (only
   * equals/in/notIn/not — enums aren't treated as ordinal), so the first OR
   * branch is expressed as `type in <types after cursor.type>` instead of
   * `type gt cursor.type`. Same tuple comparison, just phrased in a filter
   * Prisma actually accepts.
   */
  async children(
    principal: Principal,
    id: string,
    opts: { cursor?: string; limit?: number },
  ) {
    await this.access.resolve(principal, id);
    const limit = Math.min(opts.limit ?? 50, 100);

    let cursor = null as ReturnType<typeof decodeCursor>;
    if (opts.cursor) {
      cursor = decodeCursor(opts.cursor);
      if (!cursor) {
        throw new AppError('VALIDATION_FAILED', 'Invalid cursor', 400);
      }
    }

    const after = cursor
      ? {
          OR: [
            { type: { in: TYPE_ORDER.slice(TYPE_ORDER.indexOf(cursor.type) + 1) } },
            { type: cursor.type, name: { gt: cursor.name } },
            { type: cursor.type, name: cursor.name, id: { gt: cursor.id } },
          ],
        }
      : {};

    const rows = await this.prisma.node.findMany({
      where: { parentId: id, deletedAt: null, ...after },
      orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: INCLUDE,
    });

    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items[items.length - 1];

    return {
      items: items.map(toNodeDto),
      nextCursor:
        hasMore && last ? encodeCursor({ type: last.type, name: last.name, id: last.id }) : null,
    };
  }

  /** One prefix query over the materialized path — no recursive CTE. */
  async stats(principal: Principal, id: string): Promise<NodeStats> {
    const { node } = await this.access.resolve(principal, id);
    const prefix = subtreePrefix(node.path);

    const [agg] = await this.prisma.$queryRaw<
      { file_count: bigint; folder_count: bigint; total_bytes: Prisma.Decimal }[]
    >`
      SELECT
        COUNT(*) FILTER (WHERE n."type" = 'FILE')   AS file_count,
        COUNT(*) FILTER (WHERE n."type" = 'FOLDER') AS folder_count,
        COALESCE(SUM(v."sizeBytes"), 0)             AS total_bytes
      FROM "Node" n
      LEFT JOIN "FileVersion" v ON v."id" = n."currentVersionId"
      WHERE n."path" LIKE ${prefix + '%'}
        AND n."id" <> ${id}
        AND n."deletedAt" IS NULL
    `;

    return {
      fileCount: Number(agg.file_count),
      folderCount: Number(agg.folder_count),
      totalBytes: Number(agg.total_bytes),
    };
  }
}
