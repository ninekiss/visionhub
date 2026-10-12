import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Compass,
  Film,
  Play,
  Search,
  Sparkles,
  Tv2,
  X,
} from 'lucide-react';
import { Button, ChoiceChip, MediaCard, NavigationItem, SearchField } from '@visionhub/ui';
import type {
  ApiResponse,
  CatalogEpisode,
  CatalogItem,
  PaginatedResponse,
  PaginationMetadata,
} from '@visionhub/contracts';
import PlyrPlayer, { type PlaybackState } from './player/PlyrPlayer';

const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');
const PAGE_SIZE = 8;

const CATEGORY_FILTERS = [
  { label: '全部', value: '' },
  { label: '科幻', value: '科幻' },
  { label: '剧情', value: '剧情' },
  { label: '悬疑', value: '悬疑' },
  { label: '电影', value: '电影' },
  { label: '短剧', value: '短剧' },
  { label: '纪录', value: '纪录' },
  { label: '海洋', value: '海洋' },
];

const DEMO_VIDEO_URL =
  'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4';

const fallback: CatalogItem[] = [
  {
    id: '1',
    title: '星际回响',
    year: 2026,
    categories: ['科幻', '剧情'],
    mediaType: 'movie',
    episodeCount: 0,
    description: '一段来自深空的微弱信号，改变了所有人对人类起源的认知。',
    poster: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1400&q=85',
    videoUrl: DEMO_VIDEO_URL,
  },
  {
    id: '2',
    title: '无声海岸',
    year: 2025,
    categories: ['悬疑', '电影'],
    mediaType: 'movie',
    episodeCount: 0,
    description: '潮汐退去之后，海岸小镇出现了一段无法解释的影像。',
    poster: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=800&q=80',
    videoUrl: DEMO_VIDEO_URL,
  },
  {
    id: '3',
    title: '最后的日光',
    year: 2025,
    categories: ['科幻', '短剧'],
    mediaType: 'series',
    episodeCount: 2,
    description: '在日落永不结束的城市里，一个信使开始寻找黎明。',
    poster: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=800&q=80',
    videoUrl: DEMO_VIDEO_URL,
  },
  {
    id: '4',
    title: '深蓝档案',
    year: 2024,
    categories: ['纪录', '海洋'],
    mediaType: 'movie',
    episodeCount: 0,
    description: '潜入深海，记录尚未被人类看见的生命。',
    poster: 'https://images.unsplash.com/photo-1518467166778-b88f373ffec7?auto=format&fit=crop&w=800&q=80',
    videoUrl: DEMO_VIDEO_URL,
  },
];

const initialPagination: PaginationMetadata = {
  page: 1,
  pageSize: PAGE_SIZE,
  totalItems: fallback.length,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

type Route =
  | { page: 'home' }
  | { page: 'series' }
  | { page: 'detail'; id: string }
  | { page: 'watch'; id: string; episodeId?: string };

type WatchProgress = {
  item: CatalogItem;
  episodeId?: string;
  episodeTitle?: string;
  currentTime: number;
  duration: number;
  updatedAt: number;
};

const WATCH_HISTORY_KEY = 'visionhub.watch-history.v1';
const WATCH_HISTORY_LIMIT = 12;

function readWatchHistory(): WatchProgress[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(WATCH_HISTORY_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((entry): entry is WatchProgress => {
        if (!entry || typeof entry !== 'object') return false;
        const progress = entry as Partial<WatchProgress>;
        return Boolean(
          progress.item &&
          typeof progress.item === 'object' &&
          typeof progress.item.id === 'string' &&
          typeof progress.item.title === 'string' &&
          typeof progress.item.poster === 'string' &&
          Number.isFinite(progress.currentTime) &&
          Number.isFinite(progress.duration) &&
          Number.isFinite(progress.updatedAt) &&
          (progress.episodeId === undefined || typeof progress.episodeId === 'string') &&
          (progress.episodeTitle === undefined || typeof progress.episodeTitle === 'string'),
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, WATCH_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function formatPlaybackTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainder = safeSeconds % 60;
  return hours > 0
    ? hours + ':' + String(minutes).padStart(2, '0') + ':' + String(remainder).padStart(2, '0')
    : minutes + ':' + String(remainder).padStart(2, '0');
}

function playbackPercent(progress: WatchProgress): number {
  if (progress.duration <= 0) return 0;
  return Math.min(100, Math.max(0, (progress.currentTime / progress.duration) * 100));
}

function resumePath(progress: WatchProgress): string {
  const basePath = '/watch/' + encodeURIComponent(progress.item.id);
  return progress.episodeId ? basePath + '/' + encodeURIComponent(progress.episodeId) : basePath;
}

function parseRoute(pathname: string): Route {
  let parts: string[];
  try {
    parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    return { page: 'home' };
  }

  if (parts.length === 1 && parts[0] === 'series') return { page: 'series' };
  if (parts.length === 2 && parts[0] === 'title') {
    return { page: 'detail', id: parts[1] };
  }
  if (parts.length >= 2 && parts[0] === 'watch') {
    return { page: 'watch', id: parts[1], episodeId: parts[2] };
  }
  return { page: 'home' };
}

function useAppRouter() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(parseRoute(window.location.pathname));
      const nextHash = window.location.hash;
      setHash(nextHash);
      if (nextHash) {
        window.setTimeout(() => {
          document.getElementById(decodeURIComponent(nextHash.slice(1)))?.scrollIntoView({ behavior: 'auto' });
        }, 0);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = useCallback((path: string) => {
    const target = new URL(path, window.location.origin);
    const current = window.location.pathname + window.location.search + window.location.hash;
    const next = target.pathname + target.search + target.hash;
    if (current !== next) window.history.pushState({}, '', next);
    setRoute(parseRoute(target.pathname));
    setHash(target.hash);

    if (target.hash) {
      window.setTimeout(() => {
        document.getElementById(decodeURIComponent(target.hash.slice(1)))?.scrollIntoView({ behavior: 'smooth' });
      }, 0);
    } else {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, []);

  return { route, navigate, hash };
}

function categoryText(item: CatalogItem): string {
  return item.categories.join(' · ');
}

function mediaTypeText(item: CatalogItem): string {
  return item.mediaType === 'series' ? '剧集' : '电影';
}

function playPath(item: CatalogItem, episodes: CatalogEpisode[] = []): string {
  if (item.mediaType === 'series' && episodes[0]) {
    return '/watch/' + encodeURIComponent(item.id) + '/' + encodeURIComponent(episodes[0].id);
  }
  return '/watch/' + encodeURIComponent(item.id);
}

type HeaderProps = {
  route: Route;
  navigate: (path: string) => void;
  hash: string;
  query: string;
  onQueryChange: (value: string) => void;
};

function Header({ route, navigate, hash, query, onQueryChange }: HeaderProps) {
  const showSearch = route.page === 'home' || route.page === 'series';
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const discoverActive = route.page === 'home' && hash !== '#catalog';
  const libraryActive = route.page === 'detail' || route.page === 'watch' || (route.page === 'home' && hash === '#catalog');
  useEffect(() => {
    if (!showSearch && mobileSearchOpen) setMobileSearchOpen(false);
  }, [showSearch, mobileSearchOpen]);
  return (
    <header className="topbar">
      <a className="brand" href="/" onClick={(event) => { event.preventDefault(); navigate('/'); }}>
        <span className="brand-mark"><Clapperboard size={20} /></span>
        <span>VISION<span className="brand-accent">HUB</span></span>
      </a>
      <nav className="main-nav">
        <NavigationItem variant="top" to="/" onNavigate={navigate} active={discoverActive} icon={<Compass size={16} />} label="发现" />
        <NavigationItem variant="top" to="/#catalog" onNavigate={navigate} active={libraryActive} icon={<Tv2 size={16} />} label="影视库" />
        <NavigationItem variant="top" to="/series" onNavigate={navigate} active={route.page === 'series'} label="剧集" />
      </nav>
      <div className="top-actions">
        {showSearch && (
          <>
            <SearchField
              variant="public"
              wrapperClassName="desktop-search"
              id="public-search"
              leading={<Search size={17} />}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="搜索片名、简介、类型…"
              aria-label="搜索片名、简介或类型"
            />
            <button
              type="button"
              className={'mobile-search-toggle' + (mobileSearchOpen ? ' is-open' : '')}
              aria-label="打开搜索"
              aria-expanded={mobileSearchOpen}
              aria-controls="public-search-mobile"
              onClick={() => setMobileSearchOpen(true)}
            ><Search size={17} /></button>
            {mobileSearchOpen && (
              <SearchField
                variant="public"
                wrapperClassName="mobile-search-open"
                id="public-search-mobile"
                autoFocus
                leading={<Search size={17} />}
                trailing={<button type="button" className="mobile-search-close" aria-label="关闭搜索" onClick={() => setMobileSearchOpen(false)}><X size={15} /></button>}
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                onKeyDown={(event) => { if (event.key === 'Escape') setMobileSearchOpen(false); }}
                placeholder="搜索…"
                aria-label="搜索片名、简介或类型"
              />
            )}
          </>
        )}
        <button
          type="button"
          className="icon-button"
          aria-label="通知"
          aria-expanded={notificationsOpen}
          aria-controls="notification-empty-state"
          onClick={() => setNotificationsOpen((open) => !open)}
        ><Bell size={18} /></button>
        {notificationsOpen && (
          <section id="notification-empty-state" className="notification-popover" aria-label="通知" role="status" aria-live="polite" onKeyDown={(event) => { if (event.key === 'Escape') setNotificationsOpen(false); }}>
            <div><strong>通知</strong><button type="button" aria-label="关闭通知面板" onClick={() => setNotificationsOpen(false)}><X size={14} /></button></div>
            <p>暂无新通知</p>
          </section>
        )}
        <div className="avatar">V</div>
      </div>
    </header>
  );
}

type HomeViewProps = {
  route: Route;
  categoryOptions: { label: string; value: string }[];
  items: CatalogItem[];
  loading: boolean;
  notice: string;
  category: string;
  page: number;
  pagination: PaginationMetadata;
  watchHistory: WatchProgress[];
  onResume: (progress: WatchProgress) => void;
  onQueryChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onPageChange: (value: number) => void;
  navigate: (path: string) => void;
};

function HomeView(props: HomeViewProps) {
  const {
    route, categoryOptions, items, loading, notice, category, page, pagination, watchHistory,
    onResume, onQueryChange, onCategoryChange, onPageChange, navigate,
  } = props;
  const firstItem = items[0] ?? fallback[0];
  const seriesOnly = route.page === 'series';

  return (
    <main>
      <section className="hero">
        <div
          className="hero-backdrop"
          style={{
            backgroundImage:
              'linear-gradient(90deg, #090b10 0%, rgba(9,11,16,.88) 35%, rgba(9,11,16,.15) 100%), linear-gradient(0deg,#090b10 0%,transparent 45%), url("' +
              firstItem.poster +
              '")',
          }}
        />
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14} /> EDITOR'S PICK <span className="eyebrow-line" /></div>
          <h1>{firstItem.title}</h1>
          <div className="meta">
            <span>{firstItem.year}</span>
            <span className="dot" />
            <span>{categoryText(firstItem)}</span>
            <span className="quality">{mediaTypeText(firstItem)}</span>
          </div>
          <p>{firstItem.description}</p>
          <div className="hero-buttons">
            <Button kind="heroPrimary" size="hero" onClick={() => navigate(playPath(firstItem))}>
              <Play size={14} fill="currentColor" /> 立即播放
            </Button>
            <Button kind="heroSecondary" size="hero" onClick={() => navigate('/title/' + encodeURIComponent(firstItem.id))}>
              查看详情 <ChevronRight size={15} />
            </Button>
          </div>
          <div className="notice">{loading ? '正在同步片单…' : notice}</div>
        </div>
        <div className="hero-index">
          <span>{String(Math.max(1, items.length ? 1 : 0)).padStart(2, '0')}</span>
          <i />
          {String(Math.max(1, pagination.totalItems)).padStart(2, '0')}
        </div>
      </section>

      {!seriesOnly && watchHistory.length > 0 && (
        <section className="continue-section" aria-label="继续观看">
          <div className="section-heading">
            <div>
              <span className="section-kicker">PICK UP WHERE YOU LEFT OFF</span>
              <h2>继续观看</h2>
            </div>
            <span className="continue-caption">播放进度保存在本设备</span>
          </div>
          <div className="continue-grid">
            {watchHistory.slice(0, 4).map((progress) => (
              <button
                key={progress.item.id + ':' + (progress.episodeId ?? 'movie')}
                className="group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-[10px] border border-[#242832] bg-[#101319] p-0 text-left text-[inherit] transition-[border-color,transform] duration-[180ms] hover:-translate-y-0.5 hover:border-[#c7f36b77] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7f36b]"
                onClick={() => onResume(progress)}
              >
                <span className="relative block aspect-video w-full overflow-hidden bg-[#171b23]">
                  <img className="block h-full w-full object-cover" src={progress.item.poster} alt="" loading="lazy" />
                  <span className="absolute inset-0 grid place-items-center bg-[#06080b40] text-[#c7f36b] opacity-0 transition-opacity duration-[180ms] group-hover:opacity-100"><Play size={15} fill="currentColor" /></span>
                  <span className="absolute inset-x-0 bottom-0 h-[3px] bg-white/25">
                    <span className="block h-full bg-[#c7f36b]" style={{ width: playbackPercent(progress) + '%' }} />
                  </span>
                </span>
                <span className="flex min-w-0 flex-col gap-[5px] p-3 max-[600px]:p-2.5">
                  <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold max-[600px]:text-[11px]">{progress.item.title}</strong>
                  <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-[#9ba2ad]">{progress.episodeTitle ?? '电影正片'}</span>
                  <small className="text-[10px] text-[#707987]">{formatPlaybackTime(progress.currentTime)} / {formatPlaybackTime(progress.duration)}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section id="catalog" className="catalog-section">
        <div className="section-heading">
          <div>
            <span className="section-kicker">{seriesOnly ? 'SERIES COLLECTION' : 'CURATED FOR YOU'}</span>
            <h2>{seriesOnly ? '剧集片库' : '为你精选'}</h2>
          </div>
          <Button
            kind="ghost"
            size="compact"
            className="!px-0 !text-[11px] !text-[#a7adb7] hover:!text-[#c7f36b]"
            onClick={() => {
              onQueryChange('');
              onCategoryChange('');
              onPageChange(1);
              navigate('/');
            }}
          >
            {seriesOnly ? '返回全部片库' : '重置筛选'} <ChevronRight size={16} />
          </Button>
        </div>

        {!seriesOnly && (
          <div className="category-filters" role="group" aria-label="按类型筛选">
            {categoryOptions.map((option) => (
              <ChoiceChip
                type="button"
                key={option.value || 'all'}
                variant="pill"
                size="md"
                className="category-chip"
                selected={category === option.value}
                aria-pressed={category === option.value}
                onClick={() => {
                  onCategoryChange(option.value);
                  onPageChange(1);
                }}
              >
                {option.label}
              </ChoiceChip>
            ))}
          </div>
        )}

        <div className="catalog-grid" aria-busy={loading}>
          {items.map((item, index) => (
            <MediaCard
              key={item.id}
              poster={item.poster}
              title={item.title}
              rank={String((page - 1) * pagination.pageSize + index + 1).padStart(2, '0')}
              metadata={<>{item.year} <i className="mx-1 not-italic text-[#4f5560]">·</i> {categoryText(item)}</>}
              secondaryMetadata={<>{mediaTypeText(item)}{item.episodeCount > 0 ? ' · ' + item.episodeCount + ' 集' : ''}</>}
              playIcon={<Play size={12} fill="currentColor" />}
              onClick={() => navigate('/title/' + encodeURIComponent(item.id))}
            />
          ))}
        </div>
        {items.length === 0 && <p className="empty">没有找到匹配的内容，请尝试其他关键词或类型。</p>}

        <div className="pagination-bar">
          <span>
            {pagination.totalItems === 0
              ? '共 0 部片目'
              : '第 ' + pagination.page + ' / ' + Math.max(1, pagination.totalPages) + ' 页 · 共 ' + pagination.totalItems + ' 部片目'}
          </span>
          <div className="pagination-actions">
            <Button
              type="button"
              kind="surface"
              size="compact"
              disabled={!pagination.hasPreviousPage || loading}
              onClick={() => onPageChange(Math.max(1, page - 1))}
            >
              <ChevronLeft size={15} /> 上一页
            </Button>
            <Button
              type="button"
              kind="surface"
              size="compact"
              disabled={!pagination.hasNextPage || loading}
              onClick={() => onPageChange(page + 1)}
            >
              下一页 <ChevronRight size={15} />
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

type DetailViewProps = {
  item: CatalogItem | null;
  episodes: CatalogEpisode[];
  related: CatalogItem[];
  loading: boolean;
  error: string;
  navigate: (path: string) => void;
};

function DetailView({ item, episodes, related, loading, error, navigate }: DetailViewProps) {
  if (loading) {
    return <main className="page-state"><div className="section-kicker">LOADING TITLE</div><h1>正在加载片目详情…</h1></main>;
  }
  if (!item) {
    return (
      <main className="page-state">
        <div className="section-kicker">TITLE NOT AVAILABLE</div>
        <h1>无法加载这部作品</h1>
        <p>{error || '片目不存在或服务暂时不可用。'}</p>
        <Button kind="primary" onClick={() => navigate('/')}>返回片库</Button>
      </main>
    );
  }

  return (
    <main className="detail-page">
      <div className="page-utility">
        <Button kind="ghost" size="compact" className="!px-0 !text-xs !text-[#aeb4bf] hover:!text-[#c7f36b]" onClick={() => navigate('/')}><ArrowLeft size={16} /> 返回片库</Button>
        <span>影视库 <ChevronRight size={13} /> {item.title}</span>
      </div>
      <section className="detail-hero">
        <div className="detail-poster">
          <img src={item.poster} alt={item.title + '海报'} />
          <div className="detail-poster-tag">{mediaTypeText(item)}</div>
        </div>
        <div className="detail-copy">
          <div className="eyebrow"><Sparkles size={14} /> VISIONHUB COLLECTION</div>
          <h1>{item.title}</h1>
          <div className="detail-meta">
            <span>{item.year}</span>
            <span className="meta-divider" />
            <span>{categoryText(item)}</span>
            <span className="quality">{mediaTypeText(item)}</span>
            {item.episodeCount > 0 && <span>{item.episodeCount} 集</span>}
          </div>
          <p className="detail-description">{item.description}</p>
          <div className="hero-buttons">
            <Button kind="heroPrimary" size="hero" onClick={() => navigate(playPath(item, episodes))}>
              <Play size={15} fill="currentColor" /> {item.mediaType === 'series' ? '从第一集开始' : '立即播放'}
            </Button>
            <Button kind="heroSecondary" size="hero" onClick={() => navigate('/')}>继续浏览</Button>
          </div>
          {error && <div className="inline-notice" role="status">{error}</div>}
          <div className="detail-facts">
            <div><span>作品类型</span><strong>{mediaTypeText(item)}</strong></div>
            <div><span>发行年份</span><strong>{item.year}</strong></div>
            <div><span>题材</span><strong>{categoryText(item)}</strong></div>
          </div>
        </div>
      </section>

      {item.mediaType === 'series' && (
        <section className="episodes-section">
          <div className="section-heading">
            <div><span className="section-kicker">EPISODES</span><h2>选集播放</h2></div>
            <span className="episode-count">{episodes.length} 集</span>
          </div>
          {episodes.length > 0 ? (
            <div className="episode-grid">
              {episodes.map((episode) => (
                <button
                  key={episode.id}
                  className="group flex min-w-0 cursor-pointer items-center gap-[15px] rounded-[10px] border border-[#252a34] bg-[#101319] p-[17px] text-left text-[#eff1f5] transition-colors hover:border-[#c7f36b70] hover:bg-[#141922] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c7f36b]"
                  onClick={() => navigate(playPath(item, [episode]))}
                >
                  <span className="min-w-[27px] text-[19px] font-bold text-[#c7f36b]">{String(episode.episodeNumber).padStart(2, '0')}</span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <strong className="text-[12px] font-semibold">{episode.title}</strong>
                    <small className="text-[10px] leading-[1.6] text-[#838b98]">{episode.summary}</small>
                    <small className="text-[10px] leading-[1.6] text-[#838b98]">{episode.durationMinutes} 分钟</small>
                  </span>
                  <span className="grid h-[31px] w-[31px] flex-none place-items-center rounded-full bg-[#c7f36b] text-[#11160b]"><Play size={14} fill="currentColor" /></span>
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">{error || '暂时没有可用的选集数据。'}</p>
          )}
        </section>
      )}

      <section className="related-section">
        <div className="section-heading">
          <div><span className="section-kicker">KEEP EXPLORING</span><h2>继续发现</h2></div>
        </div>
        <div className="related-grid">
          {related.filter((entry) => entry.id !== item.id).slice(0, 4).map((entry) => (
            <MediaCard
              key={entry.id}
              poster={entry.poster}
              title={entry.title}
              metadata={<>{entry.year} <i className="mx-1 not-italic text-[#4f5560]">·</i> {categoryText(entry)}</>}
              playIcon={<Play size={12} fill="currentColor" />}
              onClick={() => navigate('/title/' + encodeURIComponent(entry.id))}
            />
          ))}
        </div>
      </section>
    </main>
  );
}

const PLAYBACK_LABELS: Record<PlaybackState, string> = {
  ready: '等待播放',
  playing: '正在播放',
  paused: '已暂停',
  buffering: '缓冲中',
  ended: '播放结束',
  error: '播放遇到问题',
};

type WatchViewProps = {
  route: Extract<Route, { page: 'watch' }>;
  item: CatalogItem | null;
  episodes: CatalogEpisode[];
  loading: boolean;
  error: string;
  navigate: (path: string) => void;
  playbackState: PlaybackState;
  watchHistory: WatchProgress[];
  onPlaybackStateChange: (state: PlaybackState) => void;
  onProgress: (
    item: CatalogItem,
    episodeId: string | undefined,
    episodeTitle: string | undefined,
    currentTime: number,
    duration: number,
  ) => void;
};

function WatchView({
  route, item, episodes, loading, error, navigate, playbackState, watchHistory,
  onPlaybackStateChange, onProgress,
}: WatchViewProps) {
  if (loading) return <main className="page-state"><div className="section-kicker">PLAYER</div><h1>正在准备播放器…</h1></main>;
  if (!item) {
    return <main className="page-state"><h1>无法打开播放页面</h1><p>{error || '请稍后重试。'}</p><Button kind="primary" onClick={() => navigate('/')}>返回片库</Button></main>;
  }

  const selectedEpisode = episodes.find((episode) => episode.id === route.episodeId) ?? (!route.episodeId ? episodes[0] : undefined);
  const episodeIndex = selectedEpisode ? episodes.findIndex((episode) => episode.id === selectedEpisode.id) : -1;
  const episodeInvalid = item.mediaType === 'series' && Boolean(route.episodeId) && !selectedEpisode;
  const source = selectedEpisode?.videoUrl ?? (item.mediaType === 'movie' ? item.videoUrl : '');
  const title = selectedEpisode?.title ?? item.title;
  const savedProgress = watchHistory.find(
    (progress) =>
      progress.item.id === item.id &&
      (progress.episodeId ?? '') === (selectedEpisode?.id ?? ''),
  );

  return (
    <main className="play-page">
      <div className="page-utility">
        <Button kind="ghost" size="compact" className="!px-0 !text-xs !text-[#aeb4bf] hover:!text-[#c7f36b]" onClick={() => navigate('/title/' + encodeURIComponent(item.id))}><ArrowLeft size={16} /> 返回作品详情</Button>
        <span>正在播放 <ChevronRight size={13} /> {item.title}</span>
      </div>
      <div className="play-page-heading">
        <div>
          <span className="section-kicker">NOW PLAYING</span>
          <h1>{item.title}</h1>
          <p>{selectedEpisode ? selectedEpisode.title : '电影正片'}{selectedEpisode ? ' · ' + selectedEpisode.durationMinutes + ' 分钟' : ''}</p>
        </div>
        <span className={'play-status play-status-' + playbackState}>
          <span />{PLAYBACK_LABELS[playbackState]}
        </span>
      </div>

      <div className="play-layout">
        <section className="play-main">
          <div className="video-panel play-video-panel">
            {episodeInvalid ? (
              <div className="player-empty"><Film size={26} /><strong>没有找到这一集</strong><Button kind="secondary" onClick={() => navigate('/title/' + encodeURIComponent(item.id))}>选择其他剧集</Button></div>
            ) : source ? (
              <PlyrPlayer
                key={item.id + ':' + (selectedEpisode?.id ?? 'movie')}
                src={source}
                poster={item.poster}
                title={title}
                initialTime={savedProgress?.currentTime ?? 0}
                onProgress={(progress) => onProgress(
                  item,
                  selectedEpisode?.id,
                  selectedEpisode?.title,
                  progress.currentTime,
                  progress.duration,
                )}
                onPlaybackStateChange={onPlaybackStateChange}
              />
            ) : (
              <div className="player-empty"><Film size={26} /><strong>暂时没有可播放的视频源</strong><span>请返回详情页选择其他剧集。</span></div>
            )}
          </div>
          <div className="play-description">
            <div><span className="section-kicker">ABOUT THIS TITLE</span><h2>{title}</h2><p>{selectedEpisode?.summary ?? item.description}</p></div>
            <Button kind="secondary" size="compact" onClick={() => navigate('/title/' + encodeURIComponent(item.id))}>作品详情 <ChevronRight size={15} /></Button>
          </div>
          {error && <div className="inline-notice" role="status">{error}</div>}
        </section>

        {episodes.length > 0 && (
          <aside className="episode-sidebar">
            <div className="episode-sidebar-heading"><div><span className="section-kicker">EPISODES</span><h2>选集</h2></div><span>{episodes.length} 集</span></div>
            <div className="episode-list">
              {episodes.map((episode) => {
                const selected = episode.id === selectedEpisode?.id;
                return (
                  <button
                    key={episode.id}
                    className={
                      'group flex w-full cursor-pointer items-center gap-3 border-0 border-b border-solid border-b-white/[0.04] px-4 py-4 text-left text-[#d7dbe2] transition-colors hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#c7f36b] ' +
                      (selected ? 'bg-[#c7f36b]/[0.055] !text-[#c7f36b]' : 'bg-transparent')
                    }
                    aria-current={selected ? 'true' : undefined}
                    onClick={() => navigate('/watch/' + encodeURIComponent(item.id) + '/' + encodeURIComponent(episode.id))}
                  >
                    <span className={'grid w-6 flex-none place-items-center text-[11px] ' + (selected ? 'text-[#c7f36b]' : 'text-[#818995]')}>{selected ? <Check size={15} /> : String(episode.episodeNumber).padStart(2, '0')}</span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5"><strong className="break-words text-[11px] font-semibold">{episode.title}</strong><small className="text-[10px] text-[#7f8794]">{episode.durationMinutes} 分钟</small></span>
                    {selected && <Play size={13} fill="currentColor" />}
                  </button>
                );
              })}
            </div>
            <div className="episode-next-prev">
              <Button
                kind="surface"
                size="compact"
                className="min-w-0 flex-1 !justify-center !gap-1 !rounded-md !px-1.5 !text-[10px]"
                disabled={episodeIndex <= 0}
                onClick={() => {
                  const previous = episodes[episodeIndex - 1];
                  if (previous) navigate('/watch/' + encodeURIComponent(item.id) + '/' + encodeURIComponent(previous.id));
                }}
              ><ChevronLeft size={14} /> 上一集</Button>
              <Button
                kind="surface"
                size="compact"
                className="min-w-0 flex-1 !justify-center !gap-1 !rounded-md !px-1.5 !text-[10px]"
                disabled={episodeIndex < 0 || episodeIndex >= episodes.length - 1}
                onClick={() => {
                  const next = episodes[episodeIndex + 1];
                  if (next) navigate('/watch/' + encodeURIComponent(item.id) + '/' + encodeURIComponent(next.id));
                }}
              >下一集 <ChevronRight size={14} /></Button>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}

export default function App() {
  const { route, navigate, hash } = useAppRouter();
  const [items, setItems] = useState<CatalogItem[]>(fallback);
  const [categoryOptions, setCategoryOptions] = useState(CATEGORY_FILTERS);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMetadata>(initialPagination);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('精选片单已就绪');

  const [detail, setDetail] = useState<CatalogItem | null>(null);
  const [episodes, setEpisodes] = useState<CatalogEpisode[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [playbackState, setPlaybackState] = useState<PlaybackState>('ready');
  const [watchHistory, setWatchHistory] = useState<WatchProgress[]>(readWatchHistory);

  useEffect(() => {
    const controller = new AbortController();
    fetch(API_BASE + '/catalog/categories', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('分类加载失败');
        return response.json() as Promise<ApiResponse<string[]>>;
      })
      .then((result) => {
        if (Array.isArray(result.data)) {
          setCategoryOptions([
            { label: '全部', value: '' },
            ...result.data.map((name) => ({ label: name, value: name })),
          ]);
        }
      })
      .catch(() => {
        // Keep the initial filters as a fallback while the API is unavailable.
      });
    return () => controller.abort();
  }, []);
  const watchHistoryRef = useRef(watchHistory);
  watchHistoryRef.current = watchHistory;

  const saveWatchProgress = useCallback((
    item: CatalogItem,
    episodeId: string | undefined,
    episodeTitle: string | undefined,
    currentTime: number,
    duration: number,
  ) => {
    if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0 || currentTime < 5) return;

    const progressKey = item.id + ':' + (episodeId ?? 'movie');
    const current = watchHistoryRef.current;
    const next = duration - currentTime <= 15
      ? current.filter((entry) => entry.item.id + ':' + (entry.episodeId ?? 'movie') !== progressKey)
      : [
          {
            item,
            episodeId,
            episodeTitle,
            currentTime: Math.min(currentTime, duration),
            duration,
            updatedAt: Date.now(),
          },
          ...current.filter((entry) => entry.item.id + ':' + (entry.episodeId ?? 'movie') !== progressKey),
        ]
          .sort((a, b) => b.updatedAt - a.updatedAt)
          .slice(0, WATCH_HISTORY_LIMIT);

    watchHistoryRef.current = next;
    setWatchHistory(next);
    try {
      window.localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Continue watching is a convenience feature; storage limits must not interrupt playback.
    }
  }, []);

  useEffect(() => {
    if (route.page !== 'home' && route.page !== 'series') return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const loadCatalog = async () => {
        setLoading(true);
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (query.trim()) params.set('q', query.trim());
        if (category && route.page !== 'series') params.set('category', category);
        if (route.page === 'series') params.set('mediaType', 'series');

        try {
          const response = await fetch(API_BASE + '/catalog?' + params.toString(), {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error('片库请求失败：' + response.status);
          const result = (await response.json()) as PaginatedResponse<CatalogItem>;
          if (!result || !Array.isArray(result.data) || !result.pagination) {
            throw new Error('片库接口返回了无效数据');
          }
          setItems(result.data);
          setPagination(result.pagination);
          setNotice('片库已同步');
        } catch {
          if (!controller.signal.aborted) setNotice('API 暂不可用，当前保留本地演示数据');
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      };
      void loadCatalog();
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [route.page, query, category, page]);

  useEffect(() => {
    if (route.page !== 'detail' && route.page !== 'watch') {
      setDetail(null);
      setEpisodes([]);
      setDetailError('');
      setDetailLoading(false);
      return;
    }

    const controller = new AbortController();
    const itemId = route.id;
    const loadDetail = async () => {
      setDetail(null);
      setEpisodes([]);
      setDetailError('');
      setDetailLoading(true);
      try {
        const [itemResponse, episodesResponse] = await Promise.all([
          fetch(API_BASE + '/catalog/' + encodeURIComponent(itemId), { signal: controller.signal }),
          fetch(API_BASE + '/catalog/' + encodeURIComponent(itemId) + '/episodes', { signal: controller.signal }),
        ]);
        if (!itemResponse.ok) throw new Error(itemResponse.status === 404 ? '没有找到这部作品。' : '片目详情请求失败。');
        if (!episodesResponse.ok) throw new Error('无法读取选集信息。');
        const itemResult = (await itemResponse.json()) as ApiResponse<CatalogItem>;
        const episodesResult = (await episodesResponse.json()) as ApiResponse<CatalogEpisode[]>;
        setDetail(itemResult.data);
        setEpisodes(episodesResult.data);
      } catch {
        if (controller.signal.aborted) return;
        const localItem = fallback.find((item) => item.id === itemId) ?? null;
        setDetail(localItem);
        setEpisodes([]);
        setDetailError(localItem ? '当前显示本地备用数据；选集需要 API 在线。' : '片目不存在，或 API 暂时无法连接。');
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    };
    void loadDetail();
    return () => controller.abort();
  }, [route.page, route.page === 'detail' || route.page === 'watch' ? route.id : '']);

  useEffect(() => {
    setPlaybackState('ready');
  }, [route.page, route.page === 'watch' ? route.id : '', route.page === 'watch' ? route.episodeId : '']);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    setPage(1);
  }, []);

  const handleCategoryChange = useCallback((value: string) => {
    setCategory(value);
    setPage(1);
  }, []);

  const handlePageChange = useCallback((value: number) => {
    setPage(value);
  }, []);

  const header = (
    <Header
      route={route}
      navigate={navigate}
      hash={hash}
      query={query}
      onQueryChange={handleQueryChange}
    />
  );

  return (
    <div className="app">
      {header}
      {route.page === 'home' || route.page === 'series' ? (
        <HomeView
          route={route}
          categoryOptions={categoryOptions}
          items={items}
          loading={loading}
          notice={notice}
          category={category}
          page={page}
          pagination={pagination}
          watchHistory={watchHistory}
          onResume={(progress) => navigate(resumePath(progress))}
          onQueryChange={handleQueryChange}
          onCategoryChange={handleCategoryChange}
          onPageChange={handlePageChange}
          navigate={navigate}
        />
      ) : route.page === 'detail' ? (
        <DetailView
          item={detail}
          episodes={episodes}
          related={items.length > 0 ? items : fallback}
          loading={detailLoading}
          error={detailError}
          navigate={navigate}
        />
      ) : (
        <WatchView
          route={route}
          item={detail}
          episodes={episodes}
          loading={detailLoading}
          error={detailError}
          navigate={navigate}
          playbackState={playbackState}
          watchHistory={watchHistory}
          onPlaybackStateChange={setPlaybackState}
          onProgress={saveWatchProgress}
        />
      )}
      <footer>
        <span className="brand small"><Clapperboard size={16} /> VISION<span className="brand-accent">HUB</span></span>
        <span>为好故事，留一块好屏幕。</span>
        <span>© 2026 VisionHub · Scaffold</span>
      </footer>
    </div>
  );
}
