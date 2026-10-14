/**
 * Shared, dependency-free API contracts used by Web, Electron, and API.
 */
export type CatalogMediaType = "movie" | "series";

export type PlaybackSource =
  | { id: string; label: string; kind: "direct"; url: string }
  | { id: string; label: string; kind: "provider"; providerId: string; contentId: string };

/** Public subset of a configured provider. Private URL allowlists and selectors stay in server/desktop config. */
export interface PlaybackProvider {
  id: string;
  name: string;
  webEmbedUrlTemplate?: string;
  webOpenUrlTemplate?: string;
  /** Source-player readiness timeout in milliseconds (default 60000). */
  timeoutMs?: number;
}

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
  videoUrl: string | null;
  playbackSources?: PlaybackSource[];
}

export interface CatalogEpisode {
  id: string;
  episodeNumber: number;
  title: string;
  summary: string;
  videoUrl: string | null;
  playbackSources?: PlaybackSource[];
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
