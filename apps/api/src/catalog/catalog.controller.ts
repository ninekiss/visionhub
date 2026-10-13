import { Controller, Get, Inject, Param, Query } from "@nestjs/common";
import type {
  ApiResponse,
  CatalogEpisode,
  CatalogItem,
  CatalogListQuery,
  PaginatedResponse,
} from "@visionhub/contracts";
import { CatalogService } from "./catalog.service.js";

@Controller("catalog")
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalogService: CatalogService) {}

  @Get("playback-providers")
  playbackProviders() {
    return { data: this.catalogService.getPlaybackProviders() };
  }

  @Get("categories")
  async categories(): Promise<ApiResponse<string[]>> {
    return { data: await this.catalogService.getCategories() };
  }

  @Get()
  async list(
    @Query("q") q?: string,
    @Query("category") category?: string,
    @Query("mediaType") mediaType?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ): Promise<PaginatedResponse<CatalogItem>> {
    const query: CatalogListQuery = { q, category, mediaType, page, pageSize };
    return this.catalogService.list(query);
  }

  @Get(":id/episodes")
  async episodes(@Param("id") id: string): Promise<ApiResponse<CatalogEpisode[]>> {
    return { data: await this.catalogService.getEpisodes(id) };
  }

  @Get(":id")
  async detail(@Param("id") id: string): Promise<ApiResponse<CatalogItem>> {
    return { data: await this.catalogService.getById(id) };
  }
}
