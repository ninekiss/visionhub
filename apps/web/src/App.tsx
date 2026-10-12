import { useEffect, useState } from 'react';
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Compass,
  Search,
  Sparkles,
  Tv2,
} from 'lucide-react';
import type {
  CatalogItem,
  PaginatedResponse,
  PaginationMetadata,
} from '@visionhub/contracts';
import PlyrPlayer from './player/PlyrPlayer';

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

const fallback: CatalogItem[] = [
  {
    id: '1',
    title: '星际回响',
    year: 2026,
    categories: ['科幻', '剧情'],
    description: '一段来自深空的微弱信号，改变了所有人对人类起源的认知。',
    poster: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1400&q=85',
    videoUrl: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4',
  },
  {
    id: '2',
    title: '无声海岸',
    year: 2025,
    categories: ['悬疑', '电影'],
    description: '潮汐退去之后，海岸小镇出现了一段无法解释的影像。',
    poster: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4',
  },
  {
    id: '3',
    title: '最后的日光',
    year: 2025,
    categories: ['科幻', '短剧'],
    description: '在日落永不结束的城市里，一个信使开始寻找黎明。',
    poster: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4',
  },
  {
    id: '4',
    title: '深蓝档案',
    year: 2024,
    categories: ['纪录', '海洋'],
    description: '潜入深海，记录尚未被人类看见的生命。',
    poster: 'https://images.unsplash.com/photo-1518467166778-b88f373ffec7?auto=format&fit=crop&w=800&q=80',
    videoUrl: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4',
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

function categoryText(item: CatalogItem): string {
  return item.categories.join(' · ');
}

export default function App() {
  const [items, setItems] = useState<CatalogItem[]>(fallback);
  const [active, setActive] = useState<CatalogItem | null>(fallback[0]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMetadata>(initialPagination);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('精选片单已就绪');
  const displayActive = active ?? fallback[0];

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const loadCatalog = async () => {
        setLoading(true);
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(PAGE_SIZE),
        });
        if (query.trim()) params.set('q', query.trim());
        if (category) params.set('category', category);

        try {
          const response = await fetch(API_BASE + '/catalog?' + params.toString(), {
            signal: controller.signal,
          });
          if (!response.ok) {
            throw new Error('Catalog request failed: ' + response.status);
          }

          const result = (await response.json()) as PaginatedResponse<CatalogItem>;
          if (!result || !Array.isArray(result.data) || !result.pagination) {
            throw new Error('Catalog API returned an invalid response');
          }

          setItems(result.data);
          setPagination(result.pagination);
          setActive((current) =>
            result.data.find((item) => item.id === current?.id) ??
            result.data[0] ??
            null,
          );
          setNotice(
            result.data.length > 0
              ? '共 ' + result.pagination.totalItems + ' 部片目'
              : '没有找到匹配的内容',
          );
        } catch {
          if (!controller.signal.aborted) {
            setNotice('API 暂不可用，当前保留已有演示数据');
          }
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
  }, [query, category, page]);

  const activeIndex = active ? items.findIndex((item) => item.id === active.id) : -1;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-mark"><Clapperboard size={20} /></span>
          <span>VISION<span className="brand-accent">HUB</span></span>
        </a>
        <nav className="main-nav">
          <a className="selected" href="#"><Compass size={16} />发现</a>
          <a href="#catalog"><Tv2 size={16} />影视库</a>
          <a href="#catalog">剧集</a>
        </nav>
        <div className="top-actions">
          <label className="search">
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              placeholder="搜索片名、简介、类型…"
              aria-label="搜索片名、简介或类型"
            />
          </label>
          <button className="icon-button" aria-label="通知"><Bell size={18} /></button>
          <div className="avatar">V</div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div
            className="hero-backdrop"
            style={{
              backgroundImage:
                'linear-gradient(90deg, #090b10 0%, rgba(9,11,16,.88) 35%, rgba(9,11,16,.15) 100%), linear-gradient(0deg,#090b10 0%,transparent 45%), url("' +
                displayActive.poster +
                '")',
            }}
          />
          <div className="hero-copy">
            <div className="eyebrow"><Sparkles size={14} /> EDITOR'S PICK <span className="eyebrow-line" /></div>
            <h1>{displayActive.title}</h1>
            <div className="meta">
              <span>{displayActive.year}</span>
              <span className="dot" />
              <span>{categoryText(displayActive)}</span>
              <span className="quality">4K UHD</span>
            </div>
            <p>{displayActive.description}</p>
            <div className="hero-buttons">
              <button className="primary" onClick={() => document.getElementById('watch')?.scrollIntoView({ behavior: 'smooth' })}>▶ 立即播放</button>
              <button className="secondary" onClick={() => setNotice('已将「' + displayActive.title + '」加入片单（演示）')}>＋ 我的片单</button>
            </div>
            <div className="notice">{notice}</div>
          </div>
          <div className="hero-index">
            <span>{String(Math.max(1, activeIndex + 1)).padStart(2, '0')}</span>
            <i />
            {String(Math.max(1, items.length)).padStart(2, '0')}
          </div>
        </section>

        <section id="watch" className="watch-section">
          <div className="section-heading">
            <div><span className="section-kicker">NOW PLAYING</span><h2>继续探索</h2></div>
            <span className="live-dot">{loading ? '同步片单中' : 'Plyr 演示播放器'}</span>
          </div>
          <div className="watch-layout">
            <div className="video-panel">
              <PlyrPlayer src={displayActive.videoUrl} poster={displayActive.poster} title={displayActive.title} />
            </div>
            <aside className="now-card">
              <span className="section-kicker">正在播放</span>
              <h3>{displayActive.title}</h3>
              <p>{displayActive.description}</p>
              <div className="now-divider" />
              <div className="now-row"><span>年份</span><strong>{displayActive.year}</strong></div>
              <div className="now-row"><span>类型</span><strong>{categoryText(displayActive)}</strong></div>
              <button className="text-link" onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}>浏览全部内容 <ChevronRight size={16} /></button>
            </aside>
          </div>
        </section>

        <section id="catalog" className="catalog-section">
          <div className="section-heading">
            <div><span className="section-kicker">CURATED FOR YOU</span><h2>为你精选</h2></div>
            <button
              className="view-all"
              onClick={() => {
                setQuery('');
                setCategory('');
                setPage(1);
                setNotice('正在显示全部片目');
              }}
            >
              重置筛选 <ChevronRight size={16} />
            </button>
          </div>
          <div className="category-filters" role="group" aria-label="按类型筛选">
            {CATEGORY_FILTERS.map((option) => (
              <button
                type="button"
                key={option.value || 'all'}
                className={'category-chip' + (category === option.value ? ' active' : '')}
                aria-pressed={category === option.value}
                onClick={() => {
                  setCategory(option.value);
                  setPage(1);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="catalog-grid" aria-busy={loading}>
            {items.map((item, index) => (
              <button
                key={item.id}
                className={'media-card' + (active?.id === item.id ? ' active' : '')}
                onClick={() => {
                  setActive(item);
                  setNotice('已选择「' + item.title + '」');
                  document.getElementById('watch')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                <div className="poster-wrap">
                  <img src={item.poster} alt="" loading="lazy" />
                  <span className="poster-number">{String((page - 1) * pagination.pageSize + index + 1).padStart(2, '0')}</span>
                  <span className="poster-play">▶</span>
                </div>
                <div className="media-info">
                  <strong>{item.title}</strong>
                  <span>{item.year} <i>·</i> {categoryText(item)}</span>
                </div>
              </button>
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
              <button
                type="button"
                disabled={!pagination.hasPreviousPage || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft size={15} /> 上一页
              </button>
              <button
                type="button"
                disabled={!pagination.hasNextPage || loading}
                onClick={() => setPage((current) => current + 1)}
              >
                下一页 <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <span className="brand small"><Clapperboard size={16} /> VISION<span className="brand-accent">HUB</span></span>
        <span>为好故事，留一块好屏幕。</span>
        <span>© 2026 VisionHub · Scaffold</span>
      </footer>
    </div>
  );
}
