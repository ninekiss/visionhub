/**
 * Shared, dependency-free API contracts used by the web and API workspaces.
 */
export type CatalogMediaType = 'movie' | 'series';

export interface CatalogItem {
  id: string;
  title: string;
  year: number;
  categories: string[];
  mediaType: CatalogMediaType;
  episodeCount: number;
  description: string;
  poster: string;
  /** Default preview/playback URL for movies and fallback playback. */
  videoUrl: string;
}

export interface CatalogEpisode {
  id: string;
  episodeNumber: number;
  title: string;
  summary: string;
  videoUrl: string;
  durationMinutes: number;
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
};

export interface CatalogListQuery {
  q?: string;
  category?: string;
  mediaType?: string;
  page?: string | number;
  pageSize?: string | number;
}
