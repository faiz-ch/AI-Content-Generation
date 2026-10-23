import { useEffect, useRef, useState } from 'react';
import { House, TrendingUp, BookOpen, Clapperboard, Settings, Search, Menu, Sparkles, ArrowRight, Video, Lock, Users } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { FLOW_URL } from '../lib/settings.js';

const NAV = [
  { id: 'home', label: 'Home', icon: House, match: ['home'] },
  { id: 'trending', label: 'Trending Genres', icon: TrendingUp, match: ['trending', 'genre'] },
  { id: 'stories', label: 'My Stories', icon: BookOpen, match: ['stories', 'story'] },
  { id: 'prompts', label: 'Clip Prompts', icon: Clapperboard, match: ['prompts'] },
  { id: 'settings', label: 'Settings', icon: Settings, match: ['settings'] }
];

function AvatarMenu() {
  const { profile, plain, nav, lock } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const h = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const k = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k);
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k); };
  }, [open]);
  const initial = (profile?.name || 'U').trim().charAt(0).toUpperCase() || 'U';
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="avatar" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Profile menu" title={profile?.name}>{initial}</button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head"><span className="avatar sm">{initial}</span><div><b>{profile?.name}</b><div className="tiny muted">{plain ? 'Unprotected workspace' : 'Private profile · encrypted'}</div></div></div>
          <button role="menuitem" onClick={() => { setOpen(false); nav('settings'); }}><Settings size={16} /> Settings</button>
          {!plain && <button role="menuitem" onClick={() => { setOpen(false); lock(); }}><Lock size={16} /> Lock</button>}
          {!plain && <button role="menuitem" onClick={() => { setOpen(false); lock(); }}><Users size={16} /> Switch profile</button>}
        </div>
      )}
    </div>
  );
}

export default function Shell({ children }) {
  const { route, nav, projects, P, D, updateD, plain, lock } = useApp();
  const [open, setOpen] = useState(false);
  const go = to => { setOpen(false); nav(to); };

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
          {!plain && <button onClick={() => { setOpen(false); lock(); }}><Lock size={19} strokeWidth={1.9} />Lock</button>}
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
            <form className="search" onSubmit={e => { e.preventDefault(); if (route !== 'trending') nav('trending'); }} role="search">
              <Search size={18} />
              <input type="search" placeholder="Search genres, topics or ideas..." aria-label="Search genres, topics or ideas"
                value={D.post.q} onChange={e => { const v = e.target.value; updateD(d => { d.post.q = v; }); }} />
            </form>
            <div className="header-right">
              <button className="icon-btn" onClick={() => go('settings')} aria-label="Settings" title="Settings"><Settings size={19} /></button>
              <AvatarMenu />
            </div>
          </header>
          {children}
        </div>
      </main>
    </div>
  );
}
