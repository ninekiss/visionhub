import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CatalogItem,
  CatalogListQuery,
  PaginatedResponse,
} from '@visionhub/contracts';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { MOCK_CATALOG } from './mock/catalog.mock-data';

const MAX_PAGE_SIZE = 50;
const FALLBACK_PAGE_SIZE = 8;

@Injectable()
export class CatalogService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  list(query: CatalogListQuery): PaginatedResponse<CatalogItem> {
    this.ensureMockProviderEnabled();

    const page = this.parsePositiveInteger(query.page, 'page', 1);
    const pageSize = this.parsePositiveInteger(
      query.pageSize,
      'pageSize',
      this.getDefaultPageSize(),
      MAX_PAGE_SIZE,
    );
    const normalizedQuery = query.q?.trim().toLocaleLowerCase() ?? '';
    const normalizedCategory = query.category?.trim().toLocaleLowerCase() ?? '';

    const matchingItems = MOCK_CATALOG.filter((item) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [item.title, item.description, ...item.categories]
          .join(' ')
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      const matchesCategory =
        normalizedCategory.length === 0 ||
        item.categories.some(
          (category) => category.toLocaleLowerCase() === normalizedCategory,
        );

      return matchesQuery && matchesCategory;
    });

    const totalItems = matchingItems.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const offset = (page - 1) * pageSize;

    return {
      data: matchingItems.slice(offset, offset + pageSize),
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

  getById(id: string): CatalogItem {
    this.ensureMockProviderEnabled();
    const item = MOCK_CATALOG.find((entry) => entry.id === id);

    if (!item) {
      throw new NotFoundException({
        code: 'CATALOG_ITEM_NOT_FOUND',
        message: 'Catalog item not found',
      });
    }

    return item;
  }

  getCategories(): string[] {
    this.ensureMockProviderEnabled();
    return [...new Set(MOCK_CATALOG.flatMap((item) => item.categories))].sort(
      (a, b) => a.localeCompare(b, 'zh-CN'),
    );
  }

  private getDefaultPageSize(): number {
    const configured = this.config.catalog?.pageSize ?? FALLBACK_PAGE_SIZE;

    if (!Number.isInteger(configured) || configured < 1) {
      return FALLBACK_PAGE_SIZE;
    }

    return Math.min(configured, MAX_PAGE_SIZE);
  }

  private parsePositiveInteger(
    value: string | number | undefined,
    name: string,
    fallback: number,
    maximum = Number.MAX_SAFE_INTEGER,
  ): number {
    if (value === undefined || value === '') {
      return fallback;
    }

    const textValue = String(value).trim();
    if (!/^\d+$/.test(textValue)) {
      throw new BadRequestException({
        code: 'INVALID_CATALOG_QUERY',
        message: `${name} must be a positive integer`,
      });
    }

    const parsed = Number(textValue);
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
      throw new BadRequestException({
        code: 'INVALID_CATALOG_QUERY',
        message: `${name} must be between 1 and ${maximum}`,
      });
    }

    return parsed;
  }

  private ensureMockProviderEnabled(): void {
    if (this.config.catalog?.mockData === false) {
      throw new ServiceUnavailableException({
        code: 'CATALOG_PROVIDER_NOT_CONFIGURED',
        message:
          'The live catalog provider is not configured yet. Set catalog.mockData to true while using the Mock API.',
      });
    }
  }
}
