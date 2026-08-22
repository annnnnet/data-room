import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  createShareSchema,
  shareContextQuerySchema,
  type CreateShareInput,
} from '@data-room/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentPrincipal } from '../auth/principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SharesService } from './shares.service';
import type { Principal } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller()
export class SharesController {
  constructor(private shares: SharesService) {}

  @Get('nodes/:id/shares')
  list(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.shares.list(p, id);
  }

  @Post('nodes/:id/shares')
  create(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createShareSchema)) body: CreateShareInput,
  ) {
    return this.shares.create(p, id, body);
  }

  @Delete('shares/:id')
  revoke(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.shares.revoke(p, id);
  }

  /** Backs the public /s/[token] landing page — no auth, just the token. */
  @Get('shares/context')
  context(@Query(new ZodValidationPipe(shareContextQuerySchema)) query: { token: string }) {
    return this.shares.context(query.token);
  }
}
