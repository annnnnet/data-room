import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AccessModule } from './access/access.module';
import { NodesModule } from './nodes/nodes.module';
import { DataRoomsModule } from './data-rooms/data-rooms.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccessModule,
    NodesModule,
    DataRoomsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
