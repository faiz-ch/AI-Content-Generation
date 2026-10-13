import { useState } from 'react';
import { House, TrendingUp, BookOpen, Clapperboard, Settings, Search, Menu, Sparkles, ArrowRight, Video } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { FLOW_URL } from '../lib/settings.js';

const NAV = [
  { id: 'home', label: 'Home', icon: House, match: ['home'] },
  { id: 'trending', label: 'Trending Genres', icon: TrendingUp, match: ['trending', 'genre'] },
  { id: 'stories', label: 'My Stories', icon: BookOpen, match: ['stories', 'story'] },
  { id: 'prompts', label: 'Clip Prompts', icon: Clapperboard, match: ['prompts'] },
  { id: 'settings', label: 'Settings', icon: Settings, match: ['settings'] }
];

export default function Shell({ children }) {
  const { route, nav, projects, P, S, updateP } = useApp();
  const [open, setOpen] = useState(false);
  const go = to => { setOpen(false); nav(to); };
  const initial = (S.displayName || 'U').trim().charAt(0).toUpperCase() || 'U';

  const onSearch = e => {
    e.preventDefault();
    if (route !== 'trending') nav('trending');
  };

  return (
    <div className="app">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main navigation">
        <div className="brand"><span className="brand-mark"><Video size={18} /></span>Flow Story Studio</div>
        <nav className="nav">
          {NAV.map(n => {
            const Icon = n.icon, active = n.match.includes(route);
            return (
              <button key={n.id} className={active ? 'active' : ''} onClick={() => go(n.id)} aria-current={active ? 'page' : undefined}>
                <Icon size={19} strokeWidth={active ? 2.2 : 1.9} />{n.label}
                {n.id === 'stories' && projects.length > 0 && <span className="count">{projects.length}</span>}
                {n.id === 'prompts' && P.clips?.length > 0 && <span className="count">{P.clips.length}</span>}
              </button>
            );
          })}
        </nav>
        <div className="promo">
          <div className="promo-icon"><Sparkles size={18} /></div>
          <p>Create amazing videos with Flow</p>
          <a className="promo-go" href={FLOW_URL} target="_blank" rel="noopener noreferrer" aria-label="Open Google Flow in a new tab" title="Open Google Flow">
            <ArrowRight size={17} />
          </a>
        </div>
      </aside>
      <div className={`scrim ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />

      <main className="main">
        <div className="main-inner">
          <header className="header">
            <button className="icon-btn menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={19} /></button>
            <form className="search" onSubmit={onSearch} role="search">
              <Search size={18} />
              <input type="search" placeholder="Search genres, topics or ideas..." aria-label="Search genres, topics or ideas"
                value={P.discover.post.q}
                onChange={e => { const v = e.target.value; updateP(p => { p.discover.post.q = v; }); }} />
            </form>
            <div className="header-right">
              <button className="icon-btn" onClick={() => go('settings')} aria-label="Settings" title="Settings"><Settings size={19} /></button>
              <button className="avatar" onClick={() => go('settings')} title={S.displayName ? `${S.displayName} — settings` : 'Your settings'} aria-label="Your profile and settings">{initial}</button>
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
