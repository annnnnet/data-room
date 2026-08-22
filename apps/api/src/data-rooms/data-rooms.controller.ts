import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { createDataRoomSchema } from '@data-room/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentPrincipal } from '../auth/principal.decorator';
import { AppError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DataRoomsService } from './data-rooms.service';
import type { Principal } from '../auth/auth.guard';

function requireUser(p: Principal): string {
  if (p.kind !== 'user') throw new AppError('UNAUTHORIZED', 'Sign in required', 401);
  return p.userId;
}

@UseGuards(AuthGuard)
@Controller('data-rooms')
export class DataRoomsController {
  constructor(private rooms: DataRoomsService) {}

  @Get()
  list(@CurrentPrincipal() p: Principal) {
    return this.rooms.list(requireUser(p));
  }

  @Post()
  create(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(createDataRoomSchema)) body: { name: string },
  ) {
    return this.rooms.create(requireUser(p), body.name);
  }
}
