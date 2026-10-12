import { Controller, Get, Param, Query } from '@nestjs/common';
import type {
  ApiResponse,
  CatalogEpisode,
  CatalogItem,
  CatalogListQuery,
  PaginatedResponse,
} from '@visionhub/contracts';
import { CatalogService } from './catalog.service';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get('categories')
  categories(): ApiResponse<string[]> {
    return { data: this.catalogService.getCategories() };
  }

  @Get()
  list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('mediaType') mediaType?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): PaginatedResponse<CatalogItem> {
    const query: CatalogListQuery = { q, category, mediaType, page, pageSize };
    return this.catalogService.list(query);
  }

  @Get(':id/episodes')
  episodes(@Param('id') id: string): ApiResponse<CatalogEpisode[]> {
    return { data: this.catalogService.getEpisodes(id) };
  }

  @Get(':id')
  detail(@Param('id') id: string): ApiResponse<CatalogItem> {
    return { data: this.catalogService.getById(id) };
  }
}
