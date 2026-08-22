import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import {
  childrenQuerySchema,
  createFolderSchema,
  updateNodeSchema,
  type ChildrenQuery,
} from '@data-room/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentPrincipal } from '../auth/principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NodesService } from './nodes.service';
import type { Principal } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('nodes')
export class NodesController {
  constructor(private nodes: NodesService) {}

  @Get(':id')
  detail(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.nodes.detail(p, id);
  }

  @Get(':id/children')
  children(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Query(new ZodValidationPipe(childrenQuerySchema)) query: ChildrenQuery,
  ) {
    return this.nodes.children(p, id, query);
  }

  @Get(':id/stats')
  stats(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.nodes.stats(p, id);
  }

  @Patch(':id')
  update(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateNodeSchema)) body: { name?: string; parentId?: string },
  ) {
    return this.nodes.update(p, id, body);
  }

  @Delete(':id')
  remove(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.nodes.softDelete(p, id);
  }
}

@UseGuards(AuthGuard)
@Controller('folders')
export class FoldersController {
  constructor(private nodes: NodesService) {}

  @Post()
  createFolder(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(createFolderSchema)) body: { parentId: string; name: string },
  ) {
    return this.nodes.createFolder(p, body);
  }
}
