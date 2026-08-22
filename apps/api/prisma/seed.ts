import { createHash } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Derives a stable UUID from a seed string so re-running the seed upserts the
 * same rows instead of creating a second copy of the demo data room.
 */
function stableId(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-');
}

const DEMO_FOLDERS = ['Financials', 'Legal', 'HR'];

async function main() {
  const demoSub = process.env.SEED_SUPABASE_SUB;
  if (!demoSub) throw new Error('Set SEED_SUPABASE_SUB to the demo user id from Supabase Auth');

  // Keyed on email, not supabaseSub: re-seeding after the real demo account
  // signs up carries the existing rows over to the new auth subject instead of
  // colliding on the unique email column.
  const user = await prisma.user.upsert({
    where: { email: 'demo@acme.test' },
    update: { supabaseSub: demoSub },
    create: { supabaseSub: demoSub, email: 'demo@acme.test', name: 'Demo Owner' },
  });

  const roomId = stableId(`room:${user.id}`);
  const rootId = stableId(`root:${user.id}`);

  const room = await prisma.dataRoom.upsert({
    where: { id: roomId },
    update: {},
    create: { id: roomId, name: 'Acme Acquisition', ownerId: user.id },
  });

  await prisma.node.upsert({
    where: { id: rootId },
    update: {},
    create: {
      id: rootId,
      dataRoomId: room.id,
      parentId: null,
      type: 'FOLDER',
      name: 'Acme Acquisition',
      path: `/${rootId}/`,
      depth: 0,
      createdById: user.id,
    },
  });

  for (const name of DEMO_FOLDERS) {
    const id = stableId(`folder:${user.id}:${name}`);
    await prisma.node.upsert({
      where: { id },
      update: {},
      create: {
        id,
        dataRoomId: room.id,
        parentId: rootId,
        type: 'FOLDER',
        name,
        path: `/${rootId}/${id}/`,
        depth: 1,
        createdById: user.id,
      },
    });
  }

  console.log(`Seeded data room ${room.id} with root ${rootId}`);
}

main().finally(() => prisma.$disconnect());
