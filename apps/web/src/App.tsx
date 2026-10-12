import { useEffect, useState } from 'react';
import { Bell, ChevronRight, Clapperboard, Compass, Search, Sparkles, Tv2 } from 'lucide-react';
import PlyrPlayer from './player/PlyrPlayer';

type Media = { id: string; title: string; year: number; category: string; description: string; poster: string; videoUrl: string };
const API = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';

const fallback: Media[] = [
  { id: '1', title: '星际回响', year: 2026, category: '科幻 · 剧情', description: '一段来自深空的微弱信号，改变了所有人对人类起源的认知。', poster: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=1400&q=85', videoUrl: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4' },
  { id: '2', title: '无声海岸', year: 2025, category: '悬疑 · 电影', description: '潮汐退去之后，海岸小镇出现了一段无法解释的影像。', poster: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=800&q=80', videoUrl: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4' },
  { id: '3', title: '最后的日光', year: 2025, category: '科幻 · 短剧', description: '在日落永不结束的城市里，一个信使开始寻找黎明。', poster: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=800&q=80', videoUrl: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4' },
  { id: '4', title: '深蓝档案', year: 2024, category: '纪录 · 海洋', description: '潜入深海，记录尚未被人类看见的生命。', poster: 'https://images.unsplash.com/photo-1518467166778-b88f373ffec7?auto=format&fit=crop&w=800&q=80', videoUrl: 'https://cdn.plyr.io/static/demo/View_From_A_Blue_Moon_Trailer-720p.mp4' },
];

export default function App() {
  const [items, setItems] = useState<Media[]>(fallback);
  const [active, setActive] = useState<Media>(fallback[0]);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('精选片单已就绪');
  useEffect(() => {
    fetch(`${API}/catalog`).then(r => r.ok ? r.json() : Promise.reject()).then((data: Media[]) => {
      if (Array.isArray(data) && data.length) { setItems(data); setActive(data[0]); }
    }).catch(() => setNotice('当前展示本地演示数据'));
  }, []);
  const filtered = items.filter(item => item.title.toLowerCase().includes(query.toLowerCase()) || item.category.includes(query));
  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark"><Clapperboard size={20} /></span><span>VISION<span className="brand-accent">HUB</span></span></a>
        <nav className="main-nav"><a className="selected" href="#"><Compass size={16} />发现</a><a href="#catalog"><Tv2 size={16} />影视库</a><a href="#catalog">剧集</a></nav>
        <div className="top-actions"><label className="search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索片名、类型…" /></label><button className="icon-button" aria-label="通知"><Bell size={18} /></button><div className="avatar">V</div></div>
      </header>
      <main>
        <section className="hero">
          <div className="hero-backdrop" style={{ backgroundImage: `linear-gradient(90deg, #090b10 0%, rgba(9,11,16,.88) 35%, rgba(9,11,16,.15) 100%), linear-gradient(0deg,#090b10 0%,transparent 45%), url("${active.poster}")` }} />
          <div className="hero-copy"><div className="eyebrow"><Sparkles size={14} /> EDITOR'S PICK <span className="eyebrow-line" /></div><h1>{active.title}</h1><div className="meta"><span>{active.year}</span><span className="dot" /><span>{active.category}</span><span className="quality">4K UHD</span></div><p>{active.description}</p><div className="hero-buttons"><button className="primary" onClick={() => document.getElementById('watch')?.scrollIntoView({ behavior: 'smooth' })}>▶ 立即播放</button><button className="secondary" onClick={() => setNotice(`已将「${active.title}」加入片单（演示）`)}>＋ 我的片单</button></div><div className="notice">{notice}</div></div>
          <div className="hero-index"><span>0{Math.max(1, items.findIndex(i => i.id === active.id) + 1)}</span><i />0{items.length}</div>
        </section>
        <section id="watch" className="watch-section"><div className="section-heading"><div><span className="section-kicker">NOW PLAYING</span><h2>继续探索</h2></div><span className="live-dot">演示播放器</span></div><div className="watch-layout"><div className="video-panel"><PlyrPlayer src={active.videoUrl} poster={active.poster} title={active.title} /></div><aside className="now-card"><span className="section-kicker">正在播放</span><h3>{active.title}</h3><p>{active.description}</p><div className="now-divider" /><div className="now-row"><span>年份</span><strong>{active.year}</strong></div><div className="now-row"><span>类型</span><strong>{active.category}</strong></div><button className="text-link" onClick={() => document.getElementById('catalog')?.scrollIntoView({ behavior: 'smooth' })}>浏览全部内容 <ChevronRight size={16} /></button></aside></div></section>
        <section id="catalog" className="catalog-section"><div className="section-heading"><div><span className="section-kicker">CURATED FOR YOU</span><h2>为你精选</h2></div><button className="view-all" onClick={() => { setQuery(''); setNotice('已显示全部演示片目'); }}>查看全部 <ChevronRight size={16} /></button></div><div className="catalog-grid">{filtered.map((item, index) => <button key={item.id} className={`media-card ${active.id === item.id ? 'active' : ''}`} onClick={() => { setActive(item); setNotice(`已选择「${item.title}」`); document.getElementById('watch')?.scrollIntoView({ behavior: 'smooth' }); }}><div className="poster-wrap"><img src={item.poster} alt="" loading="lazy" /><span className="poster-number">0{index + 1}</span><span className="poster-play">▶</span></div><div className="media-info"><strong>{item.title}</strong><span>{item.year} <i>·</i> {item.category}</span></div></button>)}</div>{filtered.length === 0 && <p className="empty">没有找到匹配的内容。</p>}</section>
      </main>
      <footer><span className="brand small"><Clapperboard size={16} /> VISION<span className="brand-accent">HUB</span></span><span>为好故事，留一块好屏幕。</span><span>© 2026 VisionHub · Scaffold</span></footer>
    </div>
  );
}
