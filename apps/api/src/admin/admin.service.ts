import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type {
  CatalogEpisode,
  CatalogItem,
  CatalogListQuery,
  PaginatedResponse,
  PlaybackSource,
} from "@visionhub/contracts";
import { parsePlaybackSources, readStoredPlaybackSources } from "../catalog/playback-sources.js";
import type { Prisma } from "../generated/prisma/client.js";
import { CatalogService } from "../catalog/catalog.service.js";
import { PrismaService } from "../database/prisma.service.js";

const itemInclude = {
  categoryLinks: { include: { category: true } },
  _count: { select: { episodes: true } },
} as const;

type ItemRecord = {
  id: string;
  title: string;
  year: number;
  mediaType: "movie" | "series";
  description: string;
  posterUrl: string;
  videoUrl: string | null;
  playbackSources: unknown;
  sortOrder: number;
  categoryLinks: Array<{ category: { name: string } }>;
  _count: { episodes: number };
};

type ItemInput = {
  title: string;
  year: number;
  mediaType: "movie" | "series";
  description: string;
  posterUrl: string;
  videoUrl: string | null;
  playbackSources: PlaybackSource[];
  sortOrder: number;
  categories: string[];
};

type EpisodeInput = {
  episodeNumber: number;
  title: string;
  summary: string;
  videoUrl: string | null;
  playbackSources: PlaybackSource[];
  durationMinutes: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function requiredText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string") throw new BadRequestException(`${field} 必须是文本。`);
  const result = value.trim();
  if (!result || result.length > maximum) {
    throw new BadRequestException(`${field} 不能为空且不能超过 ${maximum} 个字符。`);
  }
  return result;
}

function optionalText(value: unknown, field: string, maximum: number): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.length > maximum) {
    throw new BadRequestException(`${field} 不能超过 ${maximum} 个字符。`);
  }
  return value.trim();
}

function positiveInteger(value: unknown, field: string, minimum: number, maximum: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new BadRequestException(`${field} 必须是 ${minimum} 到 ${maximum} 之间的整数。`);
  }
  return parsed;
}

function safeHttpUrl(value: unknown, field: string, required = true): string {
  if ((value === undefined || value === null || value === "") && !required) return "";
  const result = requiredText(value, field, 4000);
  try {
    const parsed = new URL(result);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("protocol");
    return result;
  } catch {
    throw new BadRequestException(`${field} 必须是有效的 HTTP 或 HTTPS URL。`);
  }
}

function parseItemInput(value: unknown): ItemInput {
  if (!isRecord(value)) throw new BadRequestException("作品数据格式无效。");
  if (value.mediaType !== "movie" && value.mediaType !== "series") {
    throw new BadRequestException("作品类型必须是 movie 或 series。");
  }
  if (!Array.isArray(value.categories) ||
      value.categories.some((category) => typeof category !== "string")) {
    throw new BadRequestException("分类必须是名称数组。");
  }
  const categories = [...new Set(value.categories.map((category) => category.trim()).filter(Boolean))];
  if (categories.length > 20 || categories.some((category) => category.length > 60)) {
    throw new BadRequestException("分类最多 20 个，每个名称不超过 60 个字符。");
  }
  const mediaType = value.mediaType;
  const playbackSources = parsePlaybackSources(value.playbackSources);
  const videoUrl = safeHttpUrl(value.videoUrl, "视频源地址", false) || null;
  if (mediaType === "movie" && !videoUrl && playbackSources.length === 0) {
    throw new BadRequestException("电影必须配置默认视频源或至少一个播放源。");
  }
  return {
    title: requiredText(value.title, "作品标题", 200),
    year: positiveInteger(value.year, "发行年份", 1888, 2200),
    mediaType,
    description: optionalText(value.description, "作品简介", 12000),
    posterUrl: safeHttpUrl(value.posterUrl, "海报地址"),
    videoUrl,
    playbackSources,
    sortOrder: value.sortOrder === undefined ? 0 : positiveInteger(value.sortOrder, "排序值", 0, 100000000),
    categories,
  };
}

function parseEpisodeInput(value: unknown): EpisodeInput {
  if (!isRecord(value)) throw new BadRequestException("分集数据格式无效。");
  const playbackSources = parsePlaybackSources(value.playbackSources);
  const videoUrl = safeHttpUrl(value.videoUrl, "视频源地址", false) || null;
  if (!videoUrl && playbackSources.length === 0) {
    throw new BadRequestException("分集必须配置视频源地址或至少一个播放源。");
  }
  return {
    episodeNumber: positiveInteger(value.episodeNumber, "集数", 1, 100000),
    title: requiredText(value.title, "分集标题", 200),
    summary: optionalText(value.summary, "分集简介", 12000),
    videoUrl,
    playbackSources,
    durationMinutes: positiveInteger(value.durationMinutes, "时长", 1, 10000),
  };
}

function databaseConflict(error: unknown): boolean {
  return isRecord(error) && error.code === "P2002";
}

@Injectable()
export class AdminService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CatalogService) private readonly catalog: CatalogService,
  ) {}

  listItems(query: CatalogListQuery): Promise<PaginatedResponse<CatalogItem>> {
    return this.catalog.list(query);
  }

  async dashboard(): Promise<{
    items: number;
    movies: number;
    series: number;
    episodes: number;
    categories: number;
    recentItems: Array<CatalogItem & { updatedAt: string; sortOrder: number }>;
  }> {
    const [items, movies, series, episodes, categories, latest] = await Promise.all([
      this.prisma.catalogItem.count(),
      this.prisma.catalogItem.count({ where: { mediaType: "movie" } }),
      this.prisma.catalogItem.count({ where: { mediaType: "series" } }),
      this.prisma.catalogEpisode.count(),
      this.prisma.catalogCategory.count(),
      this.prisma.catalogItem.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        include: itemInclude,
      }),
    ]);
    return {
      items, movies, series, episodes, categories,
      recentItems: latest.map((record) => ({
        ...this.toCatalogItem(record),
        updatedAt: record.updatedAt.toISOString(),
        sortOrder: record.sortOrder,
      })),
    };
  }

  async getItem(id: string): Promise<CatalogItem & { sortOrder: number }> {
    const record = await this.prisma.catalogItem.findUnique({
      where: { id },
      include: itemInclude,
    });
    if (!record) throw new NotFoundException("没有找到这部作品。");
    return { ...this.toCatalogItem(record), sortOrder: record.sortOrder };
  }

  async createItem(body: unknown): Promise<CatalogItem & { sortOrder: number }> {
    const input = parseItemInput(body);
    const record = await this.prisma.$transaction(async (tx) => {
      const categoryIds = await this.resolveCategoryIds(tx, input.categories);
      return tx.catalogItem.create({
        data: {
          id: randomUUID(),
          title: input.title,
          year: input.year,
          mediaType: input.mediaType,
          description: input.description,
          posterUrl: input.posterUrl,
          videoUrl: input.videoUrl,
          playbackSources: input.playbackSources as Prisma.InputJsonValue,
          sortOrder: input.sortOrder,
          categoryLinks: {
            create: categoryIds.map((categoryId) => ({ category: { connect: { id: categoryId } } })),
          },
        },
        include: itemInclude,
      });
    });
    return { ...this.toCatalogItem(record), sortOrder: record.sortOrder };
  }

  async updateItem(id: string, body: unknown): Promise<CatalogItem & { sortOrder: number }> {
    const input = parseItemInput(body);
    try {
      const record = await this.prisma.$transaction(async (tx) => {
        const current = await tx.catalogItem.findUnique({
          where: { id },
          select: { id: true, _count: { select: { episodes: true } } },
        });
        if (!current) throw new NotFoundException("没有找到这部作品。");
        if (input.mediaType === "movie" && current._count.episodes > 0) {
          throw new ConflictException("请先删除这部剧集的全部分集，再将作品类型改为电影。");
        }

        const categoryIds = await this.resolveCategoryIds(tx, input.categories);
        return tx.catalogItem.update({
          where: { id },
          data: {
            title: input.title,
            year: input.year,
            mediaType: input.mediaType,
            description: input.description,
            posterUrl: input.posterUrl,
            videoUrl: input.videoUrl,
            playbackSources: input.playbackSources as Prisma.InputJsonValue,
            sortOrder: input.sortOrder,
            categoryLinks: {
              deleteMany: {},
              create: categoryIds.map((categoryId) => ({ category: { connect: { id: categoryId } } })),
            },
          },
          include: itemInclude,
        });
      });
      return { ...this.toCatalogItem(record), sortOrder: record.sortOrder };
    } catch (error) {
      if (isRecord(error) && error.code === "P2025") throw new NotFoundException("没有找到这部作品。");
      throw error;
    }
  }

  async deleteItem(id: string): Promise<{ success: true }> {
    try {
      await this.prisma.catalogItem.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      if (isRecord(error) && error.code === "P2025") throw new NotFoundException("没有找到这部作品。");
      throw error;
    }
  }

  async listEpisodes(seriesId: string): Promise<CatalogEpisode[]> {
    await this.requireSeries(seriesId);
    const records = await this.prisma.catalogEpisode.findMany({
      where: { seriesId },
      orderBy: { episodeNumber: "asc" },
      select: {
        id: true, episodeNumber: true, title: true, summary: true,
        videoUrl: true, playbackSources: true, durationMinutes: true,
      },
    });
    return records.map((record) => this.toCatalogEpisode(record));
  }

  async createEpisode(seriesId: string, body: unknown): Promise<CatalogEpisode> {
    await this.requireSeries(seriesId);
    const input = parseEpisodeInput(body);
    try {
      const { playbackSources, ...storedInput } = input;
      const record = await this.prisma.catalogEpisode.create({
        data: { id: randomUUID(), seriesId, ...storedInput, playbackSources: playbackSources as Prisma.InputJsonValue },
        select: {
          id: true, episodeNumber: true, title: true, summary: true,
          videoUrl: true, playbackSources: true, durationMinutes: true,
        },
      });
      return this.toCatalogEpisode(record);
    } catch (error) {
      if (databaseConflict(error)) throw new ConflictException("该剧集已经存在这个集数，请更换集数。");
      throw error;
    }
  }

  async updateEpisode(seriesId: string, episodeId: string, body: unknown): Promise<CatalogEpisode> {
    await this.requireSeries(seriesId);
    const existing = await this.prisma.catalogEpisode.findFirst({
      where: { id: episodeId, seriesId }, select: { id: true },
    });
    if (!existing) throw new NotFoundException("没有找到这集内容。");
    const input = parseEpisodeInput(body);
    try {
      const { playbackSources, ...storedInput } = input;
      const record = await this.prisma.catalogEpisode.update({
        where: { id: episodeId },
        data: { ...storedInput, playbackSources: playbackSources as Prisma.InputJsonValue },
        select: {
          id: true, episodeNumber: true, title: true, summary: true,
          videoUrl: true, playbackSources: true, durationMinutes: true,
        },
      });
      return this.toCatalogEpisode(record);
    } catch (error) {
      if (databaseConflict(error)) throw new ConflictException("该剧集已经存在这个集数，请更换集数。");
      throw error;
    }
  }

  async deleteEpisode(seriesId: string, episodeId: string): Promise<{ success: true }> {
    const result = await this.prisma.catalogEpisode.deleteMany({ where: { id: episodeId, seriesId } });
    if (result.count === 0) throw new NotFoundException("没有找到这集内容。");
    return { success: true };
  }

  async listCategories(): Promise<Array<{ id: string; name: string; itemCount: number }>> {
    const records = await this.prisma.catalogCategory.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { itemLinks: true } } },
    });
    return records.map((record) => ({
      id: record.id, name: record.name, itemCount: record._count.itemLinks,
    }));
  }

  async createCategory(body: unknown): Promise<{ id: string; name: string; itemCount: number }> {
    if (!isRecord(body)) throw new BadRequestException("分类数据格式无效。");
    const name = requiredText(body.name, "分类名称", 60);
    try {
      const record = await this.prisma.catalogCategory.create({
        data: { id: randomUUID(), name },
        include: { _count: { select: { itemLinks: true } } },
      });
      return { id: record.id, name: record.name, itemCount: record._count.itemLinks };
    } catch (error) {
      if (databaseConflict(error)) throw new ConflictException("这个分类名称已经存在。");
      throw error;
    }
  }

  async updateCategory(id: string, body: unknown): Promise<{ id: string; name: string; itemCount: number }> {
    if (!isRecord(body)) throw new BadRequestException("分类数据格式无效。");
    const name = requiredText(body.name, "分类名称", 60);
    try {
      const record = await this.prisma.catalogCategory.update({
        where: { id },
        data: { name },
        include: { _count: { select: { itemLinks: true } } },
      });
      return { id: record.id, name: record.name, itemCount: record._count.itemLinks };
    } catch (error) {
      if (isRecord(error) && error.code === "P2025") throw new NotFoundException("没有找到这个分类。");
      if (databaseConflict(error)) throw new ConflictException("这个分类名称已经存在。");
      throw error;
    }
  }

  async deleteCategory(id: string): Promise<{ success: true }> {
    const linkedItems = await this.prisma.catalogItemCategory.count({ where: { categoryId: id } });
    if (linkedItems > 0) {
      throw new ConflictException("这个分类仍被作品使用，请先从作品中移除分类。");
    }
    try {
      await this.prisma.catalogCategory.delete({ where: { id } });
      return { success: true };
    } catch (error) {
      if (isRecord(error) && error.code === "P2025") throw new NotFoundException("没有找到这个分类。");
      throw error;
    }
  }

  private async requireSeries(id: string): Promise<void> {
    const record = await this.prisma.catalogItem.findUnique({
      where: { id }, select: { mediaType: true },
    });
    if (!record) throw new NotFoundException("没有找到这部作品。");
    if (record.mediaType !== "series") throw new BadRequestException("只有剧集作品可以管理分集。");
  }

  private async resolveCategoryIds(
    tx: Prisma.TransactionClient,
    names: string[],
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const name of names) {
      const record = await tx.catalogCategory.upsert({
        where: { name },
        create: { id: randomUUID(), name },
        update: {},
        select: { id: true },
      });
      ids.push(record.id);
    }
    return ids;
  }

  private toCatalogItem(record: ItemRecord): CatalogItem {
    return {
      id: record.id,
      title: record.title,
      year: record.year,
      categories: record.categoryLinks.map((link) => link.category.name),
      mediaType: record.mediaType,
      episodeCount: record._count.episodes,
      description: record.description,
      poster: record.posterUrl,
      videoUrl: record.videoUrl,
      playbackSources: readStoredPlaybackSources(record.playbackSources),
    };
  }

  private toCatalogEpisode(record: {
    id: string;
    episodeNumber: number;
    title: string;
    summary: string;
    videoUrl: string | null;
    playbackSources: unknown;
    durationMinutes: number;
  }): CatalogEpisode {
    return {
      id: record.id,
      episodeNumber: record.episodeNumber,
      title: record.title,
      summary: record.summary,
      videoUrl: record.videoUrl,
      playbackSources: readStoredPlaybackSources(record.playbackSources),
      durationMinutes: record.durationMinutes,
    };
  }
}
