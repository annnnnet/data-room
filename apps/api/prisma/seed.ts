import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const demoSub = process.env.SEED_SUPABASE_SUB;
  if (!demoSub) throw new Error('Set SEED_SUPABASE_SUB to the demo user id from Supabase Auth');

  const user = await prisma.user.upsert({
    where: { supabaseSub: demoSub },
    update: {},
    create: { supabaseSub: demoSub, email: 'demo@acme.test', name: 'Demo Owner' },
  });

  const room = await prisma.dataRoom.create({
    data: { name: 'Acme Acquisition', ownerId: user.id },
  });

  const rootId = crypto.randomUUID();
  await prisma.node.create({
    data: {
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

  for (const name of ['Financials', 'Legal', 'HR']) {
    const id = crypto.randomUUID();
    await prisma.node.create({
      data: {
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
