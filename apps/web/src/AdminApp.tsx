import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Activity, ArrowLeft, ArrowUpRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Clapperboard, Clock3, Film, LayoutDashboard, LoaderCircle, LogIn, LogOut, Pencil, Play, Plus, Search, Save, Tags, Trash2, Tv2, Video, X } from 'lucide-react';
import type { CatalogEpisode, CatalogItem, CatalogMediaType, PaginatedResponse, PaginationMetadata } from '@visionhub/contracts';
import { Badge, Button, DataTable, Field, IconButton, Message, NavigationItem, PaginationBar, SearchField, SelectControl, TableCell, TableContainer, TableHeaderCell, TableRow } from '@visionhub/ui';
import './admin.css';

const API = '/api/v1';
type Envelope<T> = { data: T };
type Category = { id: string; name: string; itemCount: number };
type Item = CatalogItem & { sortOrder: number; updatedAt?: string };
type Dashboard = { items: number; movies: number; series: number; episodes: number; categories: number; recentItems: Item[] };
type ItemForm = { title: string; year: number; mediaType: CatalogMediaType; description: string; posterUrl: string; videoUrl: string; categories: string[]; sortOrder: number };
type EpisodeForm = { episodeNumber: number; title: string; summary: string; videoUrl: string; durationMinutes: number };
const EMPTY_ITEM: ItemForm = { title: '', year: new Date().getFullYear(), mediaType: 'movie', description: '', posterUrl: '', videoUrl: '', categories: [], sortOrder: 0 };
const EMPTY_EPISODE: EpisodeForm = { episodeNumber: 1, title: '', summary: '', videoUrl: '', durationMinutes: 20 };

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, { ...init, credentials: 'same-origin', headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers } });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' ? (body as Record<string, unknown>).message : null;
    throw new Error(Array.isArray(message) ? message.join('；') : typeof message === 'string' ? message : '请求失败（HTTP ' + response.status + '）。');
  }
  return body as T;
}
function query(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value !== undefined && String(value).trim()) params.set(key, String(value)); });
  return params.toString();
}
function dateLabel(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
function typeLabel(type: CatalogMediaType) { return type === 'series' ? '剧集' : '电影'; }

function Link({ to, go, children, className = '' }: { to: string; go: (path: string) => void; children: ReactNode; className?: string }) {
  return <a href={to} className={className} onClick={(event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); go(to); }}>{children}</a>;
}
function Brand() { return <div className="adm-brand"><span><Clapperboard size={18} /></span><strong>VISION<span>HUB</span></strong></div>; }
function Heading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return <div className="adm-heading"><div><div className="adm-eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="adm-heading-actions">{actions}</div>}</div>;
}


function LoginPage({ go, success }: { go: (path: string) => void; success: (username: string) => void }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { const result = await api<Envelope<{ username: string }>>('/admin/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); success(result.data.username); go('/admin'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '登录失败。'); } finally { setBusy(false); }
  }
  return <main className="adm-login-screen"><section className="adm-login-card"><Brand /><div className="adm-eyebrow">CONTENT STUDIO</div><h1>进入管理后台</h1><p className="adm-login-sub">登录后维护影视作品、剧集与分类。</p>
    <form className="adm-login-form" onSubmit={submit}>
      <Field label="管理员账号"><input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required /></Field>
      <Field label="密码"><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
      {error && <Message>{error}</Message>}
      <Button type="submit" disabled={busy}>{busy ? <LoaderCircle className="adm-spin" size={16} /> : <LogIn size={16} />}登录管理后台</Button>
    </form>
    <small className="adm-login-foot">账号由环境变量 ADMIN_USERNAME 与 ADMIN_PASSWORD 配置。</small><a className="adm-back-public" href="/">← 返回影视首页</a>
  </section></main>;
}
function Shell({ path, username, go, logout, children }: { path: string; username: string; go: (path: string) => void; logout: () => void; children: ReactNode }) {
  const nav = [{ path: '/admin', label: '内容总览', icon: LayoutDashboard }, { path: '/admin/catalog', label: '影视内容', icon: Clapperboard }, { path: '/admin/categories', label: '分类管理', icon: Tags }];
  const selected = (to: string) => to === '/admin' ? path === to : to === '/admin/catalog' ? path === to || path.startsWith('/admin/catalog/') : path === to;
  const pageName = nav.find((entry) => selected(entry.path))?.label ?? (path.includes('/episodes') ? '分集管理' : '作品编辑');
  return <div className="admin-ui"><aside className="adm-sidebar"><Link to="/admin" go={go} className="adm-brand-link"><Brand /></Link><small className="adm-sidebar-label">工作空间</small><nav>{nav.map((entry) => { const Icon = entry.icon; return <NavigationItem key={entry.path} to={entry.path} onNavigate={go} active={selected(entry.path)} icon={<Icon size={17} />} label={entry.label} />; })}</nav>
    <div className="adm-sidebar-foot"><div className="adm-user"><span>{(username[0] || 'A').toUpperCase()}</span><div><strong>{username}</strong><small>管理员</small></div><button title="退出登录" onClick={logout}><LogOut size={15} /></button></div><a href="/">↗ 打开影视前台</a></div>
  </aside><div className="adm-main"><header className="adm-topbar"><div><span>VISIONHUB</span><b>›</b><strong>{pageName}</strong></div><small><i /> 内容管理系统 · {username}</small></header><div className="adm-content">{children}</div><footer className="adm-footer"><span>VISIONHUB CONTENT STUDIO</span><span>影视内容管理工作台</span></footer></div></div>;
}
function Overview({ go }: { go: (path: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; api<Envelope<Dashboard>>('/admin/dashboard').then((r) => { if (active) setData(r.data); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '加载失败'); }); return () => { active = false; }; }, []);
  const stats = data ? [{ label: '全部作品', value: data.items, icon: Clapperboard }, { label: '电影', value: data.movies, icon: Film }, { label: '剧集', value: data.series, icon: Tv2 }, { label: '分集资源', value: data.episodes, icon: Video }] : [];
  return <div className="adm-page"><Heading eyebrow="WORKSPACE OVERVIEW" title="内容总览" description="查看影视片库状态，快速进入内容维护工作。" actions={<Button onClick={() => go('/admin/catalog/new')}><Plus size={16} />新增作品</Button>} />
    {error && <Message>{error}</Message>}{!data && !error && <div className="adm-loading"><LoaderCircle className="adm-spin" />正在读取数据…</div>}
    {data && <><div className="adm-stats">{stats.map((s, i) => { const Icon = s.icon; return <div className="adm-stat" key={s.label}><div><span>{s.label}</span><i><Icon size={17} /></i></div><strong>{s.value.toLocaleString()}</strong><small>{['片库中的全部作品', '独立影片与长片', '包含分集的剧集作品', '已录入的剧集数量'][i]}</small></div>; })}</div>
      <div className="adm-overview-grid"><section className="adm-panel"><div className="adm-panel-head"><div><h2>最近更新</h2><p>最近编辑过的作品</p></div><Link to="/admin/catalog" go={go} className="adm-link">查看全部　›</Link></div>
        {data.recentItems.length ? data.recentItems.map((item) => <div className="adm-recent" key={item.id}><div className="adm-mini-poster">{item.poster && <img src={item.poster} alt="" />}</div><div><strong>{item.title}</strong><small>{typeLabel(item.mediaType)} · {item.year} · {item.episodeCount} 集</small></div><time>{dateLabel(item.updatedAt)}</time><button aria-label="编辑作品" onClick={() => go('/admin/catalog/' + encodeURIComponent(item.id) + '/edit')}><Pencil size={15} /></button></div>) : <div className="adm-empty"><Clapperboard size={25} /><strong>片库还没有内容</strong><p>创建第一部作品，开始搭建你的片库。</p><Button onClick={() => go('/admin/catalog/new')}><Plus size={15} />新增作品</Button></div>}
      </section><section className="adm-panel"><div className="adm-panel-head"><div><h2>快捷操作</h2><p>常用内容维护入口</p></div></div>
        {[{ icon: Plus, title: '新增影视作品', desc: '录入电影或剧集基本资料', run: () => go('/admin/catalog/new') }, { icon: Search, title: '管理现有片库', desc: '搜索、编辑或删除作品', run: () => go('/admin/catalog') }, { icon: Tags, title: '维护分类', desc: data.categories + ' 个可用分类', run: () => go('/admin/categories') }].map((a) => { const Icon = a.icon; return <button className="adm-quick" key={a.title} onClick={a.run}><i><Icon size={17} /></i><span><strong>{a.title}</strong><small>{a.desc}</small></span><ChevronRight size={15} /></button>; })}
        <div className="adm-db-note"><Activity size={16} />数据保存在 PostgreSQL 的 visionhub schema。</div>
      </section></div></>}
  </div>;
}
function CatalogPage({ go, notify }: { go: (path: string) => void; notify: (message: string, kind?: 'success' | 'error' | 'info') => void }) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [pagination, setPagination] = useState<PaginationMetadata>({ page: 1, pageSize: 10, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false });
  const [cats, setCats] = useState<Category[]>([]);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { api<Envelope<Category[]>>('/admin/categories').then((r) => setCats(r.data)).catch(() => setCats([])); }, []);
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    api<PaginatedResponse<CatalogItem>>('/admin/catalog?' + query({ page, pageSize: 10, q: search, mediaType: type, category }))
      .then((r) => { if (active) { setItems(r.data); setPagination(r.pagination); } }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '加载片库失败'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, type, category, reload]);
  async function remove(item: CatalogItem) {
    if (!window.confirm('确定删除「' + item.title + '」？该操作也会删除关联分集，且无法撤销。')) return;
    try { await api('/admin/catalog/' + encodeURIComponent(item.id), { method: 'DELETE' }); notify('作品已删除。'); setReload((n) => n + 1); }
    catch (e) { notify(e instanceof Error ? e.message : '删除失败。', 'error'); }
  }
  return <div className="adm-page"><Heading eyebrow="CATALOG MANAGEMENT" title="影视内容" description="统一维护片目资料、视频源与剧集内容。" actions={<Button onClick={() => go('/admin/catalog/new')}><Plus size={16} />新增作品</Button>} />
    <section className="adm-panel adm-catalog-panel"><form className="adm-filters" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput.trim()); setPage(1); }}>
      <SearchField value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder="搜索作品名称、简介或分类…" leading={<Search size={16} />} trailing={<button type="button" className="grid place-items-center rounded p-0.5 text-[#75808f] hover:text-[var(--vh-accent)]" onClick={() => { setSearchInput(''); setSearch(''); setPage(1); }} aria-label="清除搜索"><X size={14} /></button>} />
      <SelectControl value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} aria-label="作品类型"><option value="">全部类型</option><option value="movie">电影</option><option value="series">剧集</option></SelectControl>
      <SelectControl value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="分类筛选"><option value="">全部分类</option>{cats.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</SelectControl><Button kind="secondary" type="submit">搜索</Button>
    </form>{error && <div className="adm-error-pad"><Message>{error}</Message></div>}
    <TableContainer><DataTable className="adm-table"><thead><tr><TableHeaderCell>作品</TableHeaderCell><TableHeaderCell>类型 / 年份</TableHeaderCell><TableHeaderCell>分类</TableHeaderCell><TableHeaderCell>分集</TableHeaderCell><TableHeaderCell>操作</TableHeaderCell></tr></thead><tbody>
      {items.map((item) => <TableRow key={item.id}><TableCell><div className="adm-item-cell"><div>{item.poster && <img src={item.poster} alt="" loading="lazy" />}</div><span><strong>{item.title}</strong><small>{item.id}</small></span></div></TableCell><TableCell><Badge tone={item.mediaType === 'series' ? 'series' : 'success'} className={item.mediaType}>{typeLabel(item.mediaType)}</Badge><span className="adm-year">{item.year}</span></TableCell><TableCell><div className="adm-tags">{item.categories.length ? item.categories.map((name) => <span key={name}>{name}</span>) : <small>未分类</small>}</div></TableCell><TableCell>{item.episodeCount || '—'}{item.episodeCount ? ' 集' : ''}</TableCell><TableCell><div className="adm-row-actions">{item.mediaType === 'series' && <button title="管理分集" aria-label="管理分集" onClick={() => go('/admin/catalog/' + encodeURIComponent(item.id) + '/episodes')}><Video size={15} /></button>}<button title="编辑作品" aria-label="编辑作品" onClick={() => go('/admin/catalog/' + encodeURIComponent(item.id) + '/edit')}><Pencil size={15} /></button><button className="danger" title="删除作品" aria-label="删除作品" onClick={() => void remove(item)}><Trash2 size={15} /></button></div></TableCell></TableRow>)}
    </tbody></DataTable>{loading && <div className="adm-table-loading"><LoaderCircle className="adm-spin" size={17} />正在读取片库…</div>}
    {!loading && !error && !items.length && <div className="adm-empty"><Search size={25} /><strong>没有找到匹配的作品</strong><p>修改搜索条件或新增一部作品。</p><Button kind="secondary" onClick={() => { setSearchInput(''); setSearch(''); setType(''); setCategory(''); setPage(1); }}>清除筛选</Button></div>}</TableContainer>
    <PaginationBar><span>共 {pagination.totalItems} 部作品</span><div className="flex items-center gap-2">第 {pagination.totalPages ? pagination.page : 0} / {pagination.totalPages} 页 <IconButton disabled={!pagination.hasPreviousPage || loading} onClick={() => setPage((n) => Math.max(1, n - 1))} aria-label="上一页"><ChevronLeft size={15} /></IconButton><IconButton disabled={!pagination.hasNextPage || loading} onClick={() => setPage((n) => n + 1)} aria-label="下一页"><ChevronRight size={15} /></IconButton></div></PaginationBar></section>
  </div>;
}
function ItemEditor({ id, go, notify }: { id?: string; go: (path: string) => void; notify: (message: string, kind?: 'success' | 'error' | 'info') => void }) {
  const [form, setForm] = useState<ItemForm>(EMPTY_ITEM);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [previewVideo, setPreviewVideo] = useState(false);
  useEffect(() => {
    let active = true;
    api<Envelope<Category[]>>('/admin/categories').then((r) => { if (active) setCats(r.data); }).catch(() => { if (active) setCats([]); });
    if (!id) { setForm(EMPTY_ITEM); setLoading(false); return () => { active = false; }; }
    setLoading(true);
    api<Envelope<Item>>('/admin/catalog/' + encodeURIComponent(id)).then((r) => { if (!active) return; const x = r.data; setForm({ title: x.title, year: x.year, mediaType: x.mediaType, description: x.description, posterUrl: x.poster, videoUrl: x.videoUrl, categories: x.categories, sortOrder: x.sortOrder }); })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : '无法加载作品。'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  const set = <K extends keyof ItemForm>(key: K, value: ItemForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError('');
    try { const result = await api<Envelope<Item>>(id ? '/admin/catalog/' + encodeURIComponent(id) : '/admin/catalog', { method: id ? 'PUT' : 'POST', body: JSON.stringify(form) }); notify(id ? '作品资料已保存。' : '作品已创建。'); go('/admin/catalog/' + encodeURIComponent(result.data.id) + '/edit'); }
    catch (cause) { const message = cause instanceof Error ? cause.message : '保存失败。'; setError(message); notify(message, 'error'); } finally { setSaving(false); }
  }
  if (loading) return <div className="adm-loading"><LoaderCircle className="adm-spin" />加载作品…</div>;
  return <div className="adm-page"><div className="adm-back-row"><button onClick={() => go('/admin/catalog')}><ArrowLeft size={15} />返回影视内容</button><span>{id ? '编辑作品资料' : '创建新作品'}</span></div>
    <Heading eyebrow="TITLE METADATA" title={id ? '编辑作品' : '新增作品'} description="维护基础信息、分类标签与默认媒体资源。" actions={id && form.mediaType === 'series' ? <Button kind="secondary" onClick={() => go('/admin/catalog/' + encodeURIComponent(id) + '/episodes')}><Video size={15} />管理分集</Button> : undefined} />
    {error && <Message>{error}</Message>}
    <form className="adm-editor-layout" onSubmit={submit}><div className="adm-editor-main">
      <section className="adm-panel adm-form-panel"><div className="adm-panel-head"><div><h2>基本信息</h2><p>标题、年份和前台展示文案</p></div><small>* 必填</small></div><div className="adm-form-grid">
        <Field label="作品标题 *" wide><input value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={200} placeholder="填写作品名称" required /></Field>
        <Field label="发行年份 *"><input type="number" min={1888} max={2200} value={form.year} onChange={(e) => set('year', Number(e.target.value))} required /></Field>
        <Field label="排序值" hint="数字越小，越靠前展示。"><input type="number" min={0} value={form.sortOrder} onChange={(e) => set('sortOrder', Number(e.target.value))} /></Field>
        <Field label="作品类型 *" wide><div className="adm-choice-row">{(['movie', 'series'] as const).map((t) => <button type="button" key={t} className={'adm-choice' + (form.mediaType === t ? ' selected' : '')} onClick={() => { set('mediaType', t); setPreviewVideo(false); }}><span>{t === 'movie' ? <Film size={17} /> : <Tv2 size={17} />}</span><b>{typeLabel(t)}</b><small>{t === 'movie' ? '独立影片，配置默认视频源' : '多集内容，每集可设置独立视频源'}</small>{form.mediaType === t && <Check size={15} />}</button>)}</div></Field>
        <Field label="作品简介" wide><textarea rows={5} maxLength={12000} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="介绍故事背景、主题与内容特色…" /><small>{form.description.length} / 12000</small></Field>
      </div></section>
      <section className="adm-panel adm-form-panel"><div className="adm-panel-head"><div><h2>分类标签</h2><p>分类不存在时，保存作品会自动创建。</p></div></div><div className="adm-category-chips">{cats.map((c) => <button type="button" key={c.id} className={form.categories.includes(c.name) ? 'selected' : ''} onClick={() => set('categories', form.categories.includes(c.name) ? form.categories.filter((n) => n !== c.name) : [...form.categories, c.name])}>{form.categories.includes(c.name) && <Check size={13} />}{c.name}</button>)}{!cats.length && <small>暂无分类，可在分类管理页创建。</small>}</div>
        <Field label="添加分类（逗号分隔）" wide hint="输入名称后按 Enter 加入当前作品。"><input placeholder="科幻，冒险，悬疑" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const input = e.currentTarget; const values = input.value.split(/[，,]/).map((x) => x.trim()).filter(Boolean); set('categories', [...new Set([...form.categories, ...values])]); input.value = ''; } }} /></Field>
      </section>
      <section className="adm-panel adm-form-panel"><div className="adm-panel-head"><div><h2>媒体资源</h2><p>填入可通过 HTTP 或 HTTPS 访问的地址。</p></div></div><div className="adm-form-grid">
        <Field label="海报 URL *" wide><input type="url" value={form.posterUrl} onChange={(e) => set('posterUrl', e.target.value)} placeholder="https://example.com/poster.jpg" required /></Field>
        <Field label={'默认视频源 URL' + (form.mediaType === 'movie' ? ' *' : '')} wide hint={form.mediaType === 'series' ? '剧集可留空；实际播放地址在分集管理中维护。' : '建议使用浏览器支持的 MP4 或 HLS 视频源。'}><input type="url" value={form.videoUrl} onChange={(e) => set('videoUrl', e.target.value)} placeholder="https://example.com/video.mp4" required={form.mediaType === 'movie'} /></Field>
        {form.mediaType === 'series' && <div className="adm-wide"><Message tone="info">剧集的实际播放地址请在每一集的分集信息中配置。</Message></div>}
        {form.videoUrl && <div className="adm-video-action adm-wide"><Button kind="secondary" type="button" onClick={() => setPreviewVideo((v) => !v)}><Play size={14} />{previewVideo ? '关闭预览' : '测试播放视频源'}</Button><small>支持情况取决于浏览器、编码与服务器响应。</small></div>}
        {previewVideo && form.videoUrl && <video className="adm-video-preview adm-wide" controls preload="metadata" src={form.videoUrl}>当前浏览器无法预览。</video>}
      </div></section>
    </div><aside className="adm-editor-aside"><section className="adm-panel"><div className="adm-panel-head"><div><h2>前台预览</h2><p>海报与摘要</p></div></div><div className="adm-poster">{form.posterUrl ? <img src={form.posterUrl} alt="海报预览" onError={(e) => { e.currentTarget.style.opacity = '0'; }} onLoad={(e) => { e.currentTarget.style.opacity = '1'; }} /> : <div><Film size={27} /><span>填写海报 URL 预览</span></div>}<Badge tone={form.mediaType === 'series' ? 'series' : 'success'} className={form.mediaType}>{typeLabel(form.mediaType)}</Badge></div><div className="adm-preview-meta"><strong>{form.title || '作品标题'}</strong><small>{form.year || '发行年份'} · {form.categories.join(' · ') || '未分类'}</small><p>{form.description || '作品简介将显示在这里。'}</p></div></section>
      <section className="adm-panel adm-save-panel"><strong>保存作品资料</strong><small>保存后写入片库数据库。</small><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="adm-spin" size={15} /> : <Save size={15} />}{saving ? '正在保存…' : '保存更改'}</Button><Button kind="ghost" type="button" onClick={() => go('/admin/catalog')}>取消并返回</Button>{id && <a target="_blank" rel="noreferrer" href={'/title/' + encodeURIComponent(id)}><ArrowUpRight size={14} />在前台打开作品</a>}</section>
    </aside></form>
  </div>;
}
function EpisodesPage({ id, go, notify }: { id: string; go: (path: string) => void; notify: (message: string, kind?: 'success' | 'error' | 'info') => void }) {
  const [item, setItem] = useState<Item | null>(null);
  const [episodes, setEpisodes] = useState<CatalogEpisode[]>([]);
  const [draft, setDraft] = useState<EpisodeForm>({ ...EMPTY_EPISODE });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; setLoading(true); Promise.all([api<Envelope<Item>>('/admin/catalog/' + encodeURIComponent(id)), api<Envelope<CatalogEpisode[]>>('/admin/catalog/' + encodeURIComponent(id) + '/episodes')]).then(([a, b]) => { if (!active) return; setItem(a.data); setEpisodes(b.data); setDraft((d) => ({ ...d, episodeNumber: b.data.length + 1 })); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '加载分集失败。'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [id, reload]);
  const update = <K extends keyof CatalogEpisode>(episodeId: string, field: K, value: CatalogEpisode[K]) => setEpisodes((list) => list.map((x) => x.id === episodeId ? { ...x, [field]: value } : x));
  async function saveEpisode(episode: CatalogEpisode) {
    try { await api('/admin/catalog/' + encodeURIComponent(id) + '/episodes/' + encodeURIComponent(episode.id), { method: 'PUT', body: JSON.stringify({ episodeNumber: episode.episodeNumber, title: episode.title, summary: episode.summary, videoUrl: episode.videoUrl, durationMinutes: episode.durationMinutes }) }); notify('第 ' + episode.episodeNumber + ' 集已保存。'); setReload((n) => n + 1); }
    catch (e) { notify(e instanceof Error ? e.message : '保存分集失败。', 'error'); }
  }
  async function addEpisode(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try { await api('/admin/catalog/' + encodeURIComponent(id) + '/episodes', { method: 'POST', body: JSON.stringify(draft) }); notify('分集已添加。'); setDraft({ ...EMPTY_EPISODE, episodeNumber: episodes.length + 2 }); setReload((n) => n + 1); }
    catch (cause) { notify(cause instanceof Error ? cause.message : '添加分集失败。', 'error'); } finally { setSaving(false); }
  }
  async function removeEpisode(episode: CatalogEpisode) {
    if (!window.confirm('确定删除第 ' + episode.episodeNumber + ' 集「' + episode.title + '」？')) return;
    try { await api('/admin/catalog/' + encodeURIComponent(id) + '/episodes/' + encodeURIComponent(episode.id), { method: 'DELETE' }); notify('分集已删除。'); setReload((n) => n + 1); }
    catch (e) { notify(e instanceof Error ? e.message : '删除分集失败。', 'error'); }
  }
  if (loading) return <div className="adm-loading"><LoaderCircle className="adm-spin" />正在加载分集…</div>;
  if (error || !item) return <div className="adm-page"><Message>{error || '没有找到作品。'}</Message><Button kind="secondary" onClick={() => go('/admin/catalog')}>返回片库</Button></div>;
  if (item.mediaType !== 'series') return <div className="adm-page"><Message tone="info">电影不需要管理分集。</Message><Button kind="secondary" onClick={() => go('/admin/catalog/' + id + '/edit')}>返回作品编辑</Button></div>;
  return <div className="adm-page"><div className="adm-back-row"><button onClick={() => go('/admin/catalog/' + encodeURIComponent(id) + '/edit')}><ArrowLeft size={15} />返回作品编辑</button><span>剧集 / {item.title}</span></div><Heading eyebrow="EPISODE MANAGEMENT" title="分集管理" description={'为「' + item.title + '」维护集数、简介与视频源。'} actions={<a className="adm-btn secondary" target="_blank" rel="noreferrer" href={'/title/' + encodeURIComponent(id)}><ArrowUpRight size={14} />前台预览</a>} />
    <div className="adm-series-strip"><div>{item.poster && <img src={item.poster} alt="" />}</div><span><strong>{item.title}</strong><small>{episodes.length} 集 · {item.year} · {item.categories.join(' / ')}</small></span><b>{episodes.length} 集</b></div>
    <section className="adm-panel"><div className="adm-panel-head"><div><h2>已录入分集</h2><p>每集独立设置视频源；集数不能与其他分集重复。</p></div></div>
      {!episodes.length && <div className="adm-empty"><Video size={25} /><strong>还没有分集</strong><p>在下方添加第一集。</p></div>}
      <div className="adm-episode-list">{episodes.map((episode) => <article className="adm-episode-card" key={episode.id}><div className="adm-episode-title"><b>{String(episode.episodeNumber).padStart(2, '0')}</b><span><strong>分集资料</strong><small>{episode.id.slice(0, 8)}</small></span><button className="danger" aria-label="删除分集" onClick={() => void removeEpisode(episode)}><Trash2 size={15} /></button></div><div className="adm-form-grid">
        <Field label="集数 *"><input type="number" min={1} value={episode.episodeNumber} onChange={(e) => update(episode.id, 'episodeNumber', Number(e.target.value))} /></Field><Field label="时长（分钟）*"><input type="number" min={1} value={episode.durationMinutes} onChange={(e) => update(episode.id, 'durationMinutes', Number(e.target.value))} /></Field>
        <Field label="分集标题 *" wide><input value={episode.title} onChange={(e) => update(episode.id, 'title', e.target.value)} /></Field><Field label="视频源 URL *" wide><input type="url" value={episode.videoUrl} onChange={(e) => update(episode.id, 'videoUrl', e.target.value)} /></Field><Field label="分集简介" wide><textarea rows={2} value={episode.summary} onChange={(e) => update(episode.id, 'summary', e.target.value)} /></Field>
      </div><div className="adm-episode-footer"><span><Clock3 size={14} />{episode.durationMinutes} 分钟</span><Button onClick={() => void saveEpisode(episode)}><Save size={14} />保存本集</Button></div></article>)}</div>
    </section>
    <section className="adm-panel adm-add-episode"><div className="adm-panel-head"><div><h2><Plus size={16} />添加新分集</h2><p>集数必须唯一，视频源需为 HTTP 或 HTTPS 地址。</p></div></div><form className="adm-form-grid" onSubmit={addEpisode}>
      <Field label="集数 *"><input type="number" min={1} value={draft.episodeNumber} onChange={(e) => setDraft((d) => ({ ...d, episodeNumber: Number(e.target.value) }))} required /></Field><Field label="时长（分钟）*"><input type="number" min={1} value={draft.durationMinutes} onChange={(e) => setDraft((d) => ({ ...d, durationMinutes: Number(e.target.value) }))} required /></Field>
      <Field label="分集标题 *" wide><input value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} required /></Field><Field label="视频源 URL *" wide><input type="url" value={draft.videoUrl} onChange={(e) => setDraft((d) => ({ ...d, videoUrl: e.target.value }))} placeholder="https://example.com/episode-01.mp4" required /></Field><Field label="分集简介" wide><textarea rows={2} value={draft.summary} onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))} /></Field>
      <div className="adm-wide adm-form-submit"><Button type="submit" disabled={saving}>{saving ? <LoaderCircle className="adm-spin" size={15} /> : <Plus size={15} />}{saving ? '正在添加…' : '添加分集'}</Button></div>
    </form></section>
  </div>;
}
function CategoriesPage({ notify }: { notify: (message: string, kind?: 'success' | 'error' | 'info') => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newName, setNewName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => { let active = true; setLoading(true); api<Envelope<Category[]>>('/admin/categories').then((r) => { if (!active) return; setCategories(r.data); setDrafts(Object.fromEntries(r.data.map((c) => [c.id, c.name]))); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : '加载分类失败。'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [reload]);
  async function add(e: FormEvent) {
    e.preventDefault(); setBusy('new');
    try { await api('/admin/categories', { method: 'POST', body: JSON.stringify({ name: newName }) }); setNewName(''); setReload((n) => n + 1); notify('分类已创建。'); }
    catch (e) { const message = e instanceof Error ? e.message : '创建失败。'; setError(message); notify(message, 'error'); } finally { setBusy(''); }
  }
  async function rename(c: Category) {
    const name = (drafts[c.id] || '').trim(); if (!name || name === c.name) return; setBusy(c.id);
    try { await api('/admin/categories/' + encodeURIComponent(c.id), { method: 'PATCH', body: JSON.stringify({ name }) }); setReload((n) => n + 1); notify('分类名称已更新。'); }
    catch (e) { notify(e instanceof Error ? e.message : '更新失败。', 'error'); } finally { setBusy(''); }
  }
  async function remove(c: Category) {
    if (c.itemCount) { notify('该分类仍关联 ' + c.itemCount + ' 部作品，请先从作品中移除。', 'info'); return; }
    if (!window.confirm('确定删除分类「' + c.name + '」？')) return; setBusy(c.id);
    try { await api('/admin/categories/' + encodeURIComponent(c.id), { method: 'DELETE' }); setReload((n) => n + 1); notify('分类已删除。'); }
    catch (e) { notify(e instanceof Error ? e.message : '删除失败。', 'error'); } finally { setBusy(''); }
  }
  return <div className="adm-page"><Heading eyebrow="TAXONOMY MANAGEMENT" title="分类管理" description="维护片库中的分类。被作品使用的分类需先解除关联才能删除。" />
    {error && <Message>{error}</Message>}<section className="adm-panel"><div className="adm-panel-head"><div><h2>新增分类</h2><p>例如：科幻、纪录、悬疑。名称保持清晰、简短。</p></div></div><form className="adm-add-category" onSubmit={add}><Field label="分类名称"><input value={newName} maxLength={60} onChange={(e) => setNewName(e.target.value)} placeholder="填写新分类名称" required /></Field><Button type="submit" disabled={busy === 'new'}>{busy === 'new' ? <LoaderCircle className="adm-spin" size={15} /> : <Plus size={15} />}新增分类</Button></form></section>
    <section className="adm-panel"><div className="adm-panel-head"><div><h2>已有分类</h2><p>修改名称会同步影响关联作品的展示。</p></div><span className="adm-counter">{categories.length} 个分类</span></div>
      {loading ? <div className="adm-loading"><LoaderCircle className="adm-spin" />正在加载分类…</div> : categories.length ? categories.map((c) => <div className="adm-category-row" key={c.id}><div className="adm-category-icon"><Tags size={17} /></div><Field label="分类名称"><input value={drafts[c.id] ?? c.name} onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))} maxLength={60} /></Field><div className="adm-category-count"><strong>{c.itemCount}</strong><small>部作品</small></div><Button kind="secondary" disabled={busy === c.id || (drafts[c.id] ?? c.name).trim() === c.name} onClick={() => void rename(c)}>{busy === c.id ? <LoaderCircle className="adm-spin" size={14} /> : <Save size={14} />}保存</Button><button className="adm-delete-category" aria-label="删除分类" disabled={busy === c.id} onClick={() => void remove(c)}><Trash2 size={15} /></button></div>) : <div className="adm-empty"><Tags size={24} /><strong>还没有分类</strong><p>先创建分类，再到作品编辑页进行关联。</p></div>}
    </section>
  </div>;
}
export default function AdminApp() {
  const [path, setPath] = useState(window.location.pathname.replace(/\/$/, '') || '/admin');
  const firstPath = useRef(path);
  const [auth, setAuth] = useState<'checking' | 'yes' | 'no'>(firstPath.current === '/admin/login' ? 'no' : 'checking');
  const [username, setUsername] = useState('');
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' | 'info' } | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const go = useCallback((to: string) => { const next = to.replace(/\/$/, '') || '/admin'; if (window.location.pathname !== next) window.history.pushState({}, '', next); setPath(next); window.scrollTo({ top: 0, behavior: 'auto' }); }, []);
  const notify = useCallback((message: string, kind: 'success' | 'error' | 'info' = 'success') => { setToast({ message, kind }); if (toastTimer.current) window.clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToast(null), 4200); }, []);
  useEffect(() => { const pop = () => setPath(window.location.pathname.replace(/\/$/, '') || '/admin'); window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, []);
  useEffect(() => () => { if (toastTimer.current) window.clearTimeout(toastTimer.current); }, []);
  useEffect(() => { if (firstPath.current === '/admin/login') return; let active = true; api<Envelope<{ username: string }>>('/admin/auth/me').then((r) => { if (active) { setUsername(r.data.username); setAuth('yes'); } }).catch(() => { if (active) { setAuth('no'); go('/admin/login'); } }); return () => { active = false; }; }, [go]);
  async function logout() { try { await api('/admin/auth/logout', { method: 'POST' }); } catch { /* Expired sessions can still return to the login page. */ } setAuth('no'); setUsername(''); go('/admin/login'); }
  if (path === '/admin/login') return <LoginPage go={go} success={(name) => { setUsername(name); setAuth('yes'); }} />;
  if (auth === 'checking') return <div className="adm-auth-loading"><LoaderCircle className="adm-spin" size={23} />正在验证管理会话…</div>;
  if (auth !== 'yes') return <LoginPage go={go} success={(name) => { setUsername(name); setAuth('yes'); }} />;
  const editor = path.match(/^\/admin\/catalog\/([^/]+)\/edit$/);
  const episodes = path.match(/^\/admin\/catalog\/([^/]+)\/episodes$/);
  let content: ReactNode;
  if (path === '/admin' || path === '/admin/') content = <Overview go={go} />;
  else if (path === '/admin/catalog') content = <CatalogPage go={go} notify={notify} />;
  else if (path === '/admin/catalog/new') content = <ItemEditor go={go} notify={notify} />;
  else if (editor) content = <ItemEditor id={decodeURIComponent(editor[1])} go={go} notify={notify} />;
  else if (episodes) content = <EpisodesPage id={decodeURIComponent(episodes[1])} go={go} notify={notify} />;
  else if (path === '/admin/categories') content = <CategoriesPage notify={notify} />;
  else content = <div className="adm-page"><Message>没有这个管理页面。</Message><Button onClick={() => go('/admin')}>返回总览</Button></div>;
  return <Shell path={path} username={username} go={go} logout={() => void logout()}>{content}{toast && <div className={'adm-toast ' + toast.kind}><span>{toast.kind === 'success' ? <CheckCircle2 size={17} /> : toast.kind === 'error' ? <X size={17} /> : <Activity size={17} />}</span><p>{toast.message}</p><button onClick={() => setToast(null)} aria-label="关闭通知"><X size={15} /></button></div>}</Shell>;
}
