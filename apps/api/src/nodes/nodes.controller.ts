import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { childrenQuerySchema, type ChildrenQuery } from '@data-room/shared';
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
}
