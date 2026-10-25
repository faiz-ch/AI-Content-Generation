import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Library, ArrowRight, RefreshCw, Sparkles, Globe, Users, Languages, Clock, X, Compass, Plus, Brain } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { ALL_PLATFORMS } from '../lib/settings.js';
import { filterCards } from '../lib/prompts.js';
import { customCard } from '../lib/genres.js';
import { str, timeAgo } from '../lib/utils.js';
import { PageHead, Notice, Empty, Thumb, StrengthBadge, useBind } from '../components/ui.jsx';

const EXAMPLE = 'e.g. Emotional Urdu stories about a poor village boy who works hard and becomes a pilot — realistic cinematic look, for Pakistani TikTok and YouTube audiences';

export default function Trending() {
  const { P, D, S, updateD, runDiscover, showBuiltin, selectCard, genreFromDescription, nav, creditsUsed } = useApp();
  const bind = useBind('D');
  const list = useMemo(() => filterCards(D), [D]);
  const [visible, setVisible] = useState(12);
  const sentinel = useRef(null);
  const describe = D.mode === 'describe';
  const nQ = describe ? '5–8' : String((D.pre.platforms.length || ALL_PLATFORMS.length) + 1);
  const q = str(D.post.q);
  const hasTavily = !!str(S.tavilyKey);
  const planFits = describe && D.plan && D.plan.forDescription === str(D.description);

  useEffect(() => setVisible(12), [D.post.platform, D.post.audience, D.post.strength, q, D.searchedAt, D.source]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !('IntersectionObserver' in window)) return undefined;
    const io = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) setVisible(v => (v < list.length ? v + 12 : v)); });
    io.observe(el); return () => io.disconnect();
  }, [list.length]);

  const togglePlat = pl => updateD(d => {
    const s = new Set(d.pre.platforms); if (s.has(pl)) s.delete(pl); else s.add(pl);
    d.pre.platforms = ALL_PLATFORMS.filter(x => s.has(x));
  });
  const setPost = (k, v) => updateD(d => { d.post[k] = v; });
  const searchQuery = () => runDiscover({ force: true, patch: d => { d.mode = 'describe'; d.description = q; d.post.q = ''; } });

  return (
    <div className="stack">
      <PageHead title="Trending Genres" sub="Find what's working in AI video right now, then pick a genre for your story." />

      <section className="panel glass">
        <div className="seg" role="tablist" style={{ marginBottom: 16 }}>
          <button role="tab" aria-selected={!describe} className={!describe ? 'on' : ''} onClick={() => updateD(d => { d.mode = 'open'; })}><Compass size={15} /> All trends</button>
          <button role="tab" aria-selected={describe} className={describe ? 'on' : ''} onClick={() => updateD(d => { d.mode = 'describe'; })}><Sparkles size={15} /> Describe what I want</button>
        </div>

        {describe && (
          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="desc">Describe the kind of videos you want to make</label>
            <textarea id="desc" className="textarea" placeholder={EXAMPLE} {...bind('description')} />
            <span className="hint"><Brain size={13} style={{ verticalAlign: -2 }} /> In your own words, in any language. The AI works out what you mean, decides what to search for, then finds what is trending for it.</span>
          </div>
        )}

        <div className="field" style={{ marginBottom: 14 }}>
          <span className="label"><Globe size={14} style={{ verticalAlign: -2 }} /> Platforms</span>
          <div className="chips">
            {ALL_PLATFORMS.map(pl => {
              const on = D.pre.platforms.includes(pl);
              return <label key={pl} className={`check-chip ${on ? 'on' : ''}`}><input type="checkbox" checked={on} onChange={() => togglePlat(pl)} />{pl}</label>;
            })}
          </div>
        </div>
        <div className="cols">
          <div className="field"><label htmlFor="f-aud"><Users size={14} style={{ verticalAlign: -2 }} /> Audience</label>
            <select id="f-aud" className="select" {...bind('pre.audience')}>{['Any', 'Kids', 'Teens', 'Adults'].map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label htmlFor="f-lang"><Languages size={14} style={{ verticalAlign: -2 }} /> Content language</label>
            <select id="f-lang" className="select" {...bind('pre.language')}>{['Any', 'English', 'Urdu', 'Hindi', 'Arabic', 'Spanish'].map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label htmlFor="f-rec"><Clock size={14} style={{ verticalAlign: -2 }} /> Trending within</label>
            <select id="f-rec" className="select" {...bind('pre.recency')}>{[['week', 'Last week'], ['month', 'Last month'], ['year', 'Last year']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <div className="row btn-grid" style={{ marginTop: 18 }}>
          <button className="btn primary" onClick={() => runDiscover()} disabled={!hasTavily}><Search size={17} /> {describe ? 'Find trends for my description' : 'Search trending content'}</button>
          <button className="btn" onClick={showBuiltin}><Library size={17} /> Built-in genres</button>
          {describe && str(D.description) && <button className="btn soft" onClick={genreFromDescription}>Use my description as the genre <ArrowRight size={16} /></button>}
        </div>
        <p className="hint" style={{ marginTop: 10 }}>
          {hasTavily
            ? <>A search uses about {nQ} Tavily credits ({creditsUsed} used this month in this profile). Results are saved for 24 hours.</>
            : <>Add a Tavily key in <a href="#/settings">Settings</a> to search live trends. Built-in genres and “Use my description” work without it.</>}
        </p>
      </section>

      {planFits && D.source === 'search' && (
        <section className="panel plan">
          <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
            <div className="ic lav" style={{ flex: 'none' }}><Brain size={18} /></div>
            <div className="stack" style={{ minWidth: 0 }}>
              <div><b>How the AI understood you</b>{D.plan.genre_name && <span className="badge accent" style={{ marginLeft: 8 }}>{D.plan.genre_name}</span>}</div>
              <p className="small">{D.plan.understood}</p>
              {D.queriesUsed?.length > 0 && (
                <details className="disclose"><summary className="small"><Search size={14} /> Searches it ran ({D.queriesUsed.length})</summary>
                  <div className="chips">{D.queriesUsed.map(x => <span key={x} className="chip static">{x}</span>)}</div>
                </details>
              )}
            </div>
          </div>
        </section>
      )}

      {q && !D.cards.length && (
        <Notice kind="info">
          <div className="row between" style={{ width: '100%' }}>
            <span>No genres loaded yet for “{q}”.</span>
            <div className="row">
              {hasTavily && <button className="btn sm primary" onClick={searchQuery}><Search size={14} /> Search trends for “{q}”</button>}
              <button className="btn sm" onClick={() => selectCard(customCard(q, q))}>Use “{q}” as my genre</button>
            </div>
          </div>
        </Notice>
      )}

      {D.cards.length > 0 ? (
        <section className="panel">
          <div className="section-title">
            <h2>{D.source === 'builtin' ? 'Built-in genres' : 'Trending now'} <span className="badge" style={{ marginLeft: 6 }}>{list.length} of {D.cards.length}</span></h2>
            {D.source === 'search' && <span className="small muted">Searched {timeAgo(D.searchedAt)} · <button className="link" onClick={() => runDiscover({ force: true })}>Search again</button></span>}
          </div>
          <div className="chips" style={{ marginBottom: 12 }}>
            {['All', ...ALL_PLATFORMS, 'General'].map(v => <button key={v} className={`chip ${D.post.platform === v ? 'on' : ''}`} onClick={() => setPost('platform', v)}>{v}</button>)}
          </div>
          <div className="row" style={{ marginBottom: 16 }}>
            <select className="select" style={{ maxWidth: 180 }} {...bind('post.audience')} aria-label="Audience filter">
              {['All', 'Kids', 'Teens', 'Adults'].map(o => <option key={o} value={o}>{o === 'All' ? 'Any audience' : o}</option>)}
            </select>
            <select className="select" style={{ maxWidth: 180 }} {...bind('post.strength')} aria-label="Strength filter">
              {['All', 'High', 'Medium', 'Evergreen'].map(o => <option key={o} value={o}>{o === 'All' ? 'Any strength' : o === 'Medium' ? 'Rising' : o}</option>)}
            </select>
            {q && <span className="chip on">“{q}” <button className="link" onClick={() => setPost('q', '')} aria-label="Clear search"><X size={14} /></button></span>}
            {q && hasTavily && <button className="btn sm ghost" onClick={searchQuery}><Search size={14} /> Search trends for “{q}”</button>}
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
              {q && <button className="btn sm soft" onClick={() => selectCard(customCard(q, q))}><Plus size={14} /> Use “{q}” as my genre</button>}
            </Empty>
          )}
          <div ref={sentinel} style={{ height: 1 }} />
          {D.source === 'search' && (
            <div className="row" style={{ justifyContent: 'center', marginTop: 18 }}>
              <button className="btn" onClick={() => runDiscover({ more: true })}><RefreshCw size={16} /> Find more trends (~{nQ} credits)</button>
            </div>
          )}
        </section>
      ) : !q && (
        <section className="panel">
          <Empty icon={Compass} title="No genres yet">
            <span>{describe ? 'Describe what you want above, then search — or use your description directly.' : 'Search live trends, or start from the built-in genre library.'}</span>
            <div className="row" style={{ justifyContent: 'center' }}>
              {hasTavily && <button className="btn primary" onClick={() => runDiscover()}><Search size={16} /> {describe ? 'Find trends for my description' : 'Search trending content'}</button>}
              <button className="btn" onClick={showBuiltin}><Library size={16} /> Built-in genres</button>
            </div>
          </Empty>
        </section>
      )}
      {P.genre && (
        <Notice kind="info">
          <div className="row between" style={{ width: '100%' }}>
            <span>Current story: <b>{P.name}</b> · genre <b>{P.genre.name}</b></span>
            <button className="btn sm" onClick={() => nav('genre')}>Open genre <ArrowRight size={14} /></button>
          </div>
        </Notice>
      )}
    </div>
  );
}
