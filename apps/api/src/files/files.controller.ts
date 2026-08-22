import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { completeUploadSchema, uploadUrlRequestSchema, type UploadUrlRequest } from '@data-room/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentPrincipal } from '../auth/principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ParsePositiveIntPipe } from '../common/parse-positive-int.pipe';
import { FilesService } from './files.service';
import type { Principal } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('files')
export class FilesController {
  constructor(private files: FilesService) {}

  @Post('upload-url')
  createUploadUrl(
    @CurrentPrincipal() p: Principal,
    @Body(new ZodValidationPipe(uploadUrlRequestSchema)) body: UploadUrlRequest,
  ) {
    return this.files.createUploadUrl(p, body);
  }

  @Post(':id/complete')
  complete(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(completeUploadSchema)) body: { versionId: string },
  ) {
    return this.files.complete(p, id, body.versionId);
  }

  @Get(':id/download-url')
  downloadUrl(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Query('disposition') disposition?: string,
  ) {
    const mode = disposition === 'attachment' ? 'attachment' : 'inline';
    return this.files.downloadUrl(p, id, mode);
  }

  @Get(':id/versions')
  versions(@CurrentPrincipal() p: Principal, @Param('id') id: string) {
    return this.files.versions(p, id);
  }

  @Post(':id/versions/:n/restore')
  restore(
    @CurrentPrincipal() p: Principal,
    @Param('id') id: string,
    @Param('n', ParsePositiveIntPipe) n: number,
  ) {
    return this.files.restore(p, id, n);
  }
}
