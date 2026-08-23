import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { searchQuerySchema, type SearchQuery } from '@data-room/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentPrincipal } from '../auth/principal.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SearchService } from './search.service';
import type { Principal } from '../auth/auth.guard';

@UseGuards(AuthGuard)
@Controller('search')
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get()
  search(
    @CurrentPrincipal() p: Principal,
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
  ) {
    return this.searchService.search(p, query);
  }
}
