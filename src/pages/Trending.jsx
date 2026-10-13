import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Library, ArrowRight, RefreshCw, Sparkles, Globe, Users, Languages, Clock, X, Compass, Plus } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { ALL_PLATFORMS } from '../lib/settings.js';
import { filterCards } from '../lib/prompts.js';
import { creditsUsed } from '../lib/api.js';
import { customCard } from '../lib/genres.js';
import { str, timeAgo } from '../lib/utils.js';
import { PageHead, Notice, Empty, Thumb, StrengthBadge, useBind } from '../components/ui.jsx';

export default function Trending() {
  const { P, S, updateP, runDiscover, showBuiltin, selectCard, nav } = useApp();
  const bind = useBind();
  const d = P.discover;
  const list = useMemo(() => filterCards(P), [P]);
  const [visible, setVisible] = useState(12);
  const sentinel = useRef(null);
  const nQ = (d.pre.platforms.length || ALL_PLATFORMS.length) + 1;
  const q = str(d.post.q);
  const hasTavily = !!str(S.tavilyKey);

  useEffect(() => setVisible(12), [d.post.platform, d.post.audience, d.post.strength, q, d.searchedAt, d.source]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setVisible(v => (v < list.length ? v + 12 : v)); });
    io.observe(el); return () => io.disconnect();
  }, [list.length]);

  const togglePlat = pl => updateP(p => {
    const s = new Set(p.discover.pre.platforms); s.has(pl) ? s.delete(pl) : s.add(pl); p.discover.pre.platforms = ALL_PLATFORMS.filter(x => s.has(x));
  });
  const setPost = (k, v) => updateP(p => { p.discover.post[k] = v; });
  const searchQuery = () => runDiscover({ force: true, patch: p => { p.discover.mode = 'own'; p.discover.ownGenre = q; p.discover.post.q = ''; } });

  return (
    <div className="stack">
      <PageHead title="Trending Genres" sub="Find what's working in AI video right now, then pick a genre for your story." />

      <section className="panel glass">
        <div className="row" style={{ marginBottom: 16 }}>
          <div className="seg" role="tablist">
            <button className={d.mode === 'open' ? 'on' : ''} onClick={() => updateP(p => { p.discover.mode = 'open'; })}><Compass size={15} /> All trends</button>
            <button className={d.mode === 'own' ? 'on' : ''} onClick={() => updateP(p => { p.discover.mode = 'own'; })}><Sparkles size={15} /> My own genre</button>
          </div>
          {d.mode === 'own' && <input className="input grow" {...bind('discover.ownGenre')} placeholder="e.g. funny cats, Islamic history stories, horror" aria-label="Your genre" />}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <span className="label"><Globe size={14} style={{ verticalAlign: -2 }} /> Platforms</span>
          <div className="chips">
            {ALL_PLATFORMS.map(pl => {
              const on = d.pre.platforms.includes(pl);
              return <label key={pl} className={`check-chip ${on ? 'on' : ''}`}><input type="checkbox" checked={on} onChange={() => togglePlat(pl)} />{pl}</label>;
            })}
          </div>
        </div>
        <div className="cols">
          <div className="field"><label><Users size={14} style={{ verticalAlign: -2 }} /> Audience</label>
            <select className="select" {...bind('discover.pre.audience')}>{['Any', 'Kids', 'Teens', 'Adults'].map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label><Languages size={14} style={{ verticalAlign: -2 }} /> Content language</label>
            <select className="select" {...bind('discover.pre.language')}>{['Any', 'English', 'Urdu', 'Hindi', 'Arabic', 'Spanish'].map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label><Clock size={14} style={{ verticalAlign: -2 }} /> Trending within</label>
            <select className="select" {...bind('discover.pre.recency')}>{[['week', 'Last week'], ['month', 'Last month'], ['year', 'Last year']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <div className="row" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={() => runDiscover()} disabled={!hasTavily}><Search size={17} /> Search trending content</button>
          <button className="btn" onClick={showBuiltin}><Library size={17} /> Built-in genres</button>
          {d.mode === 'own' && str(d.ownGenre) && <button className="btn soft" onClick={() => selectCard(customCard(d.ownGenre))}>Use my genre directly <ArrowRight size={16} /></button>}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          {hasTavily
            ? <>A search uses about {nQ} Tavily credits ({creditsUsed()} used this month on this device). Results are saved for 24 hours.</>
            : <>Add a Tavily key in <a href="#/settings">Settings</a> to search live trends. Built-in genres work without it.</>}
        </p>
      </section>

      {q && !d.cards.length && (
        <Notice kind="info">
          <div className="row between" style={{ width: '100%' }}>
            <span>No genres loaded yet for “{q}”.</span>
            <div className="row">
              {hasTavily && <button className="btn sm primary" onClick={searchQuery}><Search size={14} /> Search live trends for “{q}”</button>}
              <button className="btn sm" onClick={() => selectCard(customCard(q))}>Use “{q}” as my genre</button>
            </div>
          </div>
        </Notice>
      )}

      {d.cards.length > 0 ? (
        <section className="panel">
          <div className="section-title">
            <h2>{d.source === 'builtin' ? 'Built-in genres' : 'Trending now'} <span className="badge" style={{ marginLeft: 6 }}>{list.length} of {d.cards.length}</span></h2>
            {d.source === 'search' && <span className="small muted">Searched {timeAgo(d.searchedAt)} · <a href="#" onClick={e => { e.preventDefault(); runDiscover({ force: true }); }}>Search again</a></span>}
          </div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {['All', ...ALL_PLATFORMS, 'General'].map(v => <button key={v} className={`chip ${d.post.platform === v ? 'on' : ''}`} onClick={() => setPost('platform', v)}>{v}</button>)}
          </div>
          <div className="row" style={{ marginBottom: 16 }}>
            <select className="select" style={{ maxWidth: 180 }} {...bind('discover.post.audience')} aria-label="Audience filter">
              {['All', 'Kids', 'Teens', 'Adults'].map(o => <option key={o} value={o}>{o === 'All' ? 'Any audience' : o}</option>)}
            </select>
            <select className="select" style={{ maxWidth: 180 }} {...bind('discover.post.strength')} aria-label="Strength filter">
              {['All', 'High', 'Medium', 'Evergreen'].map(o => <option key={o} value={o}>{o === 'All' ? 'Any strength' : o === 'Medium' ? 'Rising' : o}</option>)}
            </select>
            {q && <span className="chip on">“{q}” <X size={14} style={{ cursor: 'pointer' }} onClick={() => setPost('q', '')} aria-label="Clear search" /></span>}
            {q && hasTavily && <button className="btn sm ghost" onClick={searchQuery}><Search size={14} /> Search live for “{q}”</button>}
          </div>

          {list.length ? (
            <div className="grid">
              {list.slice(0, visible).map(c => (
                <button key={c.id} className="gcard" onClick={() => selectCard(c)}>
                  <Thumb card={c}><span className="strength"><StrengthBadge s={c.strength} /></span></Thumb>
                  <div className="body">
                    <h4>{c.name}</h4>
                    <p>{c.description}</p>
                    <div className="meta">
                      {c.platforms.filter(p => p !== 'General').map(p => <span key={p} className="badge">{p}</span>)}
                      {c.audience !== 'All' && <span className="badge accent">{c.audience}</span>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <Empty icon={Search} title="No genres match these filters">
              {q && <button className="btn sm soft" onClick={() => selectCard(customCard(q))}><Plus size={14} /> Use “{q}” as my genre</button>}
            </Empty>
          )}
          <div ref={sentinel} style={{ height: 1 }} />
          {d.source === 'search' && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
              <button className="btn" onClick={() => runDiscover({ more: true })}><RefreshCw size={16} /> Find more trends (~{nQ} credits)</button>
            </div>
          )}
        </section>
      ) : !q && (
        <section className="panel">
          <Empty icon={Compass} title="No genres yet">
            <span>Search live trends, or start from the built-in genre library.</span>
            <div className="row" style={{ justifyContent: 'center' }}>
              {hasTavily && <button className="btn primary" onClick={() => runDiscover()}><Search size={16} /> Search trending content</button>}
              <button className="btn" onClick={showBuiltin}><Library size={16} /> Built-in genres</button>
            </div>
          </Empty>
        </section>
      )}
      {P.genre && (
        <Notice kind="info">
          <div className="row between" style={{ width: '100%' }}>
            <span>Current genre: <b>{P.genre.name}</b></span>
            <button className="btn sm" onClick={() => nav('genre')}>Open genre <ArrowRight size={14} /></button>
          </div>
        </Notice>
      )}
    </div>
  );
}
