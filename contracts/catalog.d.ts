/**
 * Shared API contract for catalog data.
 * Keep this file dependency-free so both the web app and API can consume it.
 */
export interface CatalogItem {
  id: string;
  title: string;
  year: number;
  categories: string[];
  description: string;
  poster: string;
  videoUrl: string;
}

export interface ApiResponse<T> {
  data: T;
}

export interface PaginationMetadata {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export type PaginatedResponse<T> = ApiResponse<T[]> & {
  pagination: PaginationMetadata;
}

export interface CatalogListQuery {
  q?: string;
  category?: string;
  page?: string | number;
  pageSize?: string | number;
}
