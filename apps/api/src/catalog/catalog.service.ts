import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "../generated/prisma/client.js";
import type {
  CatalogEpisode,
  CatalogItem,
  CatalogListQuery,
  PaginatedResponse,
} from "@visionhub/contracts";
import { APP_CONFIG, type AppConfig } from "../config/app-config.js";
import { PrismaService } from "../database/prisma.service.js";

const MAX_PAGE_SIZE = 50;
const FALLBACK_PAGE_SIZE = 8;

const catalogItemInclude = {
  categoryLinks: { include: { category: true } },
  _count: { select: { episodes: true } },
} as const;

type DatabaseCatalogItem = {
  id: string;
  title: string;
  year: number;
  mediaType: "movie" | "series";
  description: string;
  posterUrl: string;
  videoUrl: string;
  categoryLinks: Array<{ category: { name: string } }>;
  _count: { episodes: number };
};

@Injectable()
export class CatalogService {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  async list(query: CatalogListQuery): Promise<PaginatedResponse<CatalogItem>> {
    const page = this.parsePositiveInteger(query.page, "page", 1);
    const pageSize = this.parsePositiveInteger(
      query.pageSize,
      "pageSize",
      this.getDefaultPageSize(),
      MAX_PAGE_SIZE,
    );
    const normalizedQuery = query.q?.trim() ?? "";
    const normalizedCategory = query.category?.trim() ?? "";
    const normalizedMediaType = query.mediaType?.trim().toLocaleLowerCase() ?? "";

    if (normalizedMediaType && !["movie", "series"].includes(normalizedMediaType)) {
      throw new BadRequestException({
        code: "INVALID_CATALOG_QUERY",
        message: "mediaType must be movie or series",
      });
    }

    const AND: Prisma.CatalogItemWhereInput[] = [];
    if (normalizedQuery) {
      AND.push({
        OR: [
          { title: { contains: normalizedQuery, mode: "insensitive" } },
          { description: { contains: normalizedQuery, mode: "insensitive" } },
          {
            categoryLinks: {
              some: {
                category: {
                  name: { contains: normalizedQuery, mode: "insensitive" },
                },
              },
            },
          },
        ],
      });
    }
    if (normalizedCategory) {
      AND.push({
        categoryLinks: {
          some: {
            category: {
              name: { equals: normalizedCategory, mode: "insensitive" },
            },
          },
        },
      });
    }
    if (normalizedMediaType) {
      AND.push({ mediaType: normalizedMediaType as "movie" | "series" });
    }

    const where: Prisma.CatalogItemWhereInput = AND.length > 0 ? { AND } : {};
    const totalItems = await this.prisma.catalogItem.count({ where });
    const totalPages = Math.ceil(totalItems / pageSize);
    const offset = (page - 1) * pageSize;
    const records =
      offset >= totalItems
        ? []
        : await this.prisma.catalogItem.findMany({
            where,
            skip: offset,
            take: pageSize,
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            include: catalogItemInclude,
          });

    return {
      data: records.map((record) => this.toContractItem(record)),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1 && totalPages > 0,
      },
    };
  }

  async getById(id: string): Promise<CatalogItem> {
    const record = await this.prisma.catalogItem.findUnique({
      where: { id },
      include: catalogItemInclude,
    });
    if (!record) {
      throw new NotFoundException({
        code: "CATALOG_ITEM_NOT_FOUND",
        message: "Catalog item not found",
      });
    }
    return this.toContractItem(record);
  }

  async getEpisodes(id: string): Promise<CatalogEpisode[]> {
    const item = await this.prisma.catalogItem.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException({
        code: "CATALOG_ITEM_NOT_FOUND",
        message: "Catalog item not found",
      });
    }

    return this.prisma.catalogEpisode.findMany({
      where: { seriesId: id },
      orderBy: { episodeNumber: "asc" },
      select: {
        id: true,
        episodeNumber: true,
        title: true,
        summary: true,
        videoUrl: true,
        durationMinutes: true,
      },
    });
  }

  async getCategories(): Promise<string[]> {
    const categories = await this.prisma.catalogCategory.findMany({
      where: { itemLinks: { some: {} } },
      orderBy: { name: "asc" },
      select: { name: true },
    });
    return categories.map((category) => category.name);
  }

  private toContractItem(record: DatabaseCatalogItem): CatalogItem {
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
    };
  }

  private getDefaultPageSize(): number {
    const configured = this.config.catalog?.pageSize ?? FALLBACK_PAGE_SIZE;
    if (!Number.isInteger(configured) || configured < 1) return FALLBACK_PAGE_SIZE;
    return Math.min(configured, MAX_PAGE_SIZE);
  }

  private parsePositiveInteger(
    value: string | number | undefined,
    name: string,
    fallback: number,
    maximum = Number.MAX_SAFE_INTEGER,
  ): number {
    if (value === undefined || value === "") return fallback;
    const textValue = String(value).trim();
    if (!/^\d+$/.test(textValue)) {
      throw new BadRequestException({
        code: "INVALID_CATALOG_QUERY",
        message: `${name} must be a positive integer`,
      });
    }

    const parsed = Number(textValue);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
      throw new BadRequestException({
        code: "INVALID_CATALOG_QUERY",
        message: `${name} must be between 1 and ${maximum}`,
      });
    }
    return parsed;
  }
}
