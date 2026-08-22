import { Module } from '@nestjs/common';
import { NodesController, FoldersController } from './nodes.controller';
import { NodesService } from './nodes.service';

@Module({
  controllers: [NodesController, FoldersController],
  providers: [NodesService],
  exports: [NodesService],
})
export class NodesModule {}
