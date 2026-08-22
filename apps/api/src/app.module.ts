import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AccessModule } from './access/access.module';
import { NodesModule } from './nodes/nodes.module';
import { DataRoomsModule } from './data-rooms/data-rooms.module';
import { StorageModule } from './storage/storage.module';
import { FilesModule } from './files/files.module';
import { SharesModule } from './shares/shares.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccessModule,
    NodesModule,
    DataRoomsModule,
    StorageModule,
    FilesModule,
    SharesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
