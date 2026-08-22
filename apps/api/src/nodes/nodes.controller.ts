import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentPrincipal } from '../auth/principal.decorator';
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
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.nodes.children(p, id, { cursor, limit: limit ? Number(limit) : undefined });
  }

  @Get(':id/stats')
  stats(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.nodes.stats(p, id);
  }
}
