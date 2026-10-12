import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { CatalogListQuery } from "@visionhub/contracts";
import { AdminAuthGuard } from "./admin-auth.guard.js";
import { AdminService } from "./admin.service.js";

@Controller("admin")
@UseGuards(AdminAuthGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("dashboard")
  async dashboard() {
    return { data: await this.admin.dashboard() };
  }

  @Get("catalog")
  async listItems(
    @Query("q") q?: string,
    @Query("category") category?: string,
    @Query("mediaType") mediaType?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const query: CatalogListQuery = { q, category, mediaType, page, pageSize };
    return this.admin.listItems(query);
  }

  @Post("catalog")
  async createItem(@Body() body: unknown) {
    return { data: await this.admin.createItem(body) };
  }

  @Get("catalog/:id")
  async getItem(@Param("id") id: string) {
    return { data: await this.admin.getItem(id) };
  }

  @Put("catalog/:id")
  async updateItem(@Param("id") id: string, @Body() body: unknown) {
    return { data: await this.admin.updateItem(id, body) };
  }

  @Delete("catalog/:id")
  async deleteItem(@Param("id") id: string) {
    return { data: await this.admin.deleteItem(id) };
  }

  @Get("catalog/:id/episodes")
  async listEpisodes(@Param("id") id: string) {
    return { data: await this.admin.listEpisodes(id) };
  }

  @Post("catalog/:id/episodes")
  async createEpisode(@Param("id") id: string, @Body() body: unknown) {
    return { data: await this.admin.createEpisode(id, body) };
  }

  @Put("catalog/:id/episodes/:episodeId")
  async updateEpisode(
    @Param("id") id: string,
    @Param("episodeId") episodeId: string,
    @Body() body: unknown,
  ) {
    return { data: await this.admin.updateEpisode(id, episodeId, body) };
  }

  @Delete("catalog/:id/episodes/:episodeId")
  async deleteEpisode(@Param("id") id: string, @Param("episodeId") episodeId: string) {
    return { data: await this.admin.deleteEpisode(id, episodeId) };
  }

  @Get("categories")
  async listCategories() {
    return { data: await this.admin.listCategories() };
  }

  @Post("categories")
  async createCategory(@Body() body: unknown) {
    return { data: await this.admin.createCategory(body) };
  }

  @Patch("categories/:id")
  async updateCategory(@Param("id") id: string, @Body() body: unknown) {
    return { data: await this.admin.updateCategory(id, body) };
  }

  @Delete("categories/:id")
  async deleteCategory(@Param("id") id: string) {
    return { data: await this.admin.deleteCategory(id) };
  }
}
