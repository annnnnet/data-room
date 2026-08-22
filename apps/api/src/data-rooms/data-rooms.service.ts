import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { buildPath } from '../common/path.util';
import type { DataRoomDto } from '@data-room/shared';

@Injectable()
export class DataRoomsService {
  constructor(private prisma: PrismaService) {}

  /** Owned rooms plus rooms reachable through any non-revoked share. */
  async list(userId: string): Promise<DataRoomDto[]> {
    const owned = await this.prisma.dataRoom.findMany({
      where: { ownerId: userId },
      include: { nodes: { where: { parentId: null }, select: { id: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const shared = await this.prisma.dataRoom.findMany({
      where: {
        ownerId: { not: userId },
        nodes: {
          some: {
            shares: {
              some: {
                granteeUserId: userId,
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              },
            },
          },
        },
      },
      include: { nodes: { where: { parentId: null }, select: { id: true } } },
    });

    const map = (r: (typeof owned)[number], isOwner: boolean): DataRoomDto => ({
      id: r.id,
      name: r.name,
      rootNodeId: r.nodes[0].id,
      isOwner,
      createdAt: r.createdAt.toISOString(),
    });

    return [...owned.map((r) => map(r, true)), ...shared.map((r) => map(r, false))];
  }

  /** A room and its root node are created together — a room is never rootless. */
  async create(userId: string, name: string): Promise<DataRoomDto> {
    const rootId = randomUUID();
    const room = await this.prisma.dataRoom.create({
      data: {
        name,
        ownerId: userId,
        nodes: {
          create: {
            id: rootId,
            type: 'FOLDER',
            name,
            path: buildPath(null, rootId),
            depth: 0,
            createdById: userId,
          },
        },
      },
    });
    return {
      id: room.id,
      name: room.name,
      rootNodeId: rootId,
      isOwner: true,
      createdAt: room.createdAt.toISOString(),
    };
  }
}
