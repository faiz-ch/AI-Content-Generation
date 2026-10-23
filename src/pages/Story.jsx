import { useState } from 'react';
import { ArrowRight, Lightbulb, PenLine, Wand2, Plus, Trash2, Lock, LockOpen, Users, MapPin, Palette, ListOrdered, CircleCheck, Sparkles, ArrowLeft, Smartphone, MonitorPlay, Globe, Trophy, Clapperboard } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { LENGTHS, clipRange, spokenLang, MASTER_FIELDS, voiceNeedsAgeFix, voiceFor } from '../lib/prompts.js';
import { fmtT, fmtDur, uid, str } from '../lib/utils.js';
import { PageHead, Notice, Empty, useBind } from '../components/ui.jsx';

const PURPOSE_CLS = { hook: 'accent', twist: 'warn', reveal: 'warn', cliffhanger: 'warn', climax: 'bad', payoff: 'ok', ending: 'ok' };

function Storylines({ st }) {
  const { chooseStoryline } = useApp();
  if (!st.storylines?.length) return null;
  return (
    <details className="disclose" style={{ marginTop: 14 }}>
      <summary><Trophy size={16} color="var(--accent)" /> Storylines the AI considered ({st.storylines.length})</summary>
      {st.choice_reason && <p className="small muted" style={{ marginBottom: 10 }}><b>Why this one:</b> {st.choice_reason}</p>}
      <div className="cols-2">
        {st.storylines.map((s, i) => {
          const total = Object.values(s.scores || {}).reduce((a, b) => a + b, 0);
          return (
            <div key={i} className={`block ${i === st.chosen ? 'chosen' : ''}`}>
              <div className="block-head"><b>{s.title}</b>{i === st.chosen ? <span className="badge ok">Chosen</span> : <span className="badge">Score {total}/40</span>}</div>
              <p className="small">{s.logline}</p>
              <ul className="small muted" style={{ paddingLeft: 18, margin: '6px 0' }}>
                {s.hook && <li><b>Hook:</b> {s.hook}</li>}
                {s.twist && <li><b>Twist:</b> {s.twist}</li>}
                {s.ending && <li><b>Ending:</b> {s.ending}</li>}
              </ul>
              {i !== st.chosen && <button className="btn sm" onClick={() => chooseStoryline(i)}>Use this storyline</button>}
            </div>
          );
        })}
      </div>
    </details>
  );
}

export default function Story() {
  const { P, S, nav, updateP, confirm, suggestIdeas, writeStory, rewriteStory, rewritePart, finalize, unlockStory } = useApp();
  const bind = useBind();
  const [tab, setTab] = useState('parts');
  const [partIns, setPartIns] = useState({});
  const [storyIns, setStoryIns] = useState('');

  if (!P.genre) {
    return (
      <div className="panel"><Empty icon={Lightbulb} title="Choose a genre first">
        <span>Every story starts from a genre and its master prompt.</span>
        <button className="btn primary" onClick={() => nav('trending')}>Explore Trending Genres <ArrowRight size={16} /></button>
      </Empty></div>
    );
  }
  const s = P.story.settings, st = P.story.data, L = P.story.locked, sec = S.clipSeconds;
  const { min, max } = clipRange(P, S);
  const hasTavily = !!str(S.tavilyKey);
  const setLength = len => updateP(p => {
    p.story.settings.length = len;
    p.story.settings.aspect = len === 'long' ? '16:9' : '9:16';
  });
  const clearClips = p => { p.clips = []; p.done = {}; p.review = null; };
  const toggleChar = (i, id) => updateP(p => {
    const part = p.story.data.parts[i];
    part.characters = part.characters.includes(id) ? part.characters.filter(x => x !== id) : [...part.characters, id];
  });

  return (
    <div className="stack">
      <PageHead title={st ? st.title || 'Your story' : 'Write Your Story'}
        sub={<>Genre: <b style={{ color: 'var(--ink)' }}>{P.genre.name}</b>{st ? <> · {st.parts.length} clips · {fmtDur(st.parts.length * sec)}</> : <> · {LENGTHS[s.length]?.label} format</>}</>}>
        <button className="btn ghost" onClick={() => nav('genre')}><ArrowLeft size={16} /> Genre</button>
        <button className="btn ghost" onClick={() => nav('stories')}>All stories</button>
      </PageHead>

      {L && (
        <div className="lock-bar">
          <div className="lb"><Lock size={18} color="var(--accent)" /> <span><b>Story finalized.</b> Characters, outfits, locations, style and the story master prompt are locked into every clip prompt.</span></div>
          <div className="row"><button className="btn sm" onClick={unlockStory}><LockOpen size={14} /> Unlock to edit</button>
            <button className="btn sm primary" onClick={() => nav('prompts')}>View prompts <ArrowRight size={14} /></button></div>
        </div>
      )}

      <section className="panel">
        <div className="section-title"><h2>Story format & idea</h2></div>
        <div className="label" style={{ marginBottom: 8 }}>Story length</div>
        <div className="len-grid" role="radiogroup" aria-label="Story length">
          {[['short', Smartphone], ['long', MonitorPlay]].map(([k, Icon]) => {
            const Lx = LENGTHS[k], on = s.length === k;
            const r = clipRange({ story: { settings: { length: k } } }, S);
            return (
              <button key={k} role="radio" aria-checked={on} className={`len-opt ${on ? 'on' : ''}`} disabled={L || !!st} onClick={() => setLength(k)}>
                <Icon size={20} />
                <span><b>{Lx.label} story</b><span className="tiny muted">{Lx.sub} · about {fmtDur(r.min * sec)}–{fmtDur(r.max * sec)}</span></span>
              </button>
            );
          })}
        </div>
        <p className="hint" style={{ margin: '8px 0 14px' }}>
          {st ? 'The AI decided the number of clips for this story. To change the format, write a new story.' : `You choose short or long; the AI decides exactly how many ${sec}-second clips the story needs (${min}–${max}) to reach a complete, satisfying ending.`}
        </p>
        <div className="cols">
          <div className="field"><label htmlFor="s-asp">Aspect ratio</label>
            <select id="s-asp" className="select" disabled={L} {...bind('story.settings.aspect')}>
              <option value="9:16">9:16 vertical (Shorts/Reels/TikTok)</option><option value="16:9">16:9 widescreen (YouTube)</option><option value="1:1">1:1 square</option>
            </select></div>
          <div className="field"><label htmlFor="s-sp">Speech</label>
            <select id="s-sp" className="select" disabled={L} {...bind('story.settings.dialogue')}>
              <option value="narration">Narrator voice-over</option><option value="dialogue">Characters talk</option><option value="none">No speech (music/SFX)</option>
            </select></div>
          {s.dialogue !== 'none' && <div className="field"><label htmlFor="s-voices">Character voices</label>
            <select id="s-voices" className="select" disabled={L} {...bind('story.settings.voices')}>
              <option value="natural">Match each character's real age</option><option value="comedy">Comedy: mismatched voices allowed</option>
            </select></div>}
          <div className="field"><label htmlFor="s-lang">Spoken language</label>
            <select id="s-lang" className="select" disabled={L} {...bind('story.settings.language')}>{['English', 'Urdu', 'Hindi', 'Arabic', 'Other'].map(o => <option key={o}>{o}</option>)}</select></div>
          {s.language === 'Other' && <div className="field"><label htmlFor="s-lo">Which language?</label><input id="s-lo" className="input" disabled={L} {...bind('story.settings.languageOther')} /></div>}
        </div>
        {P.genre.voiceChoice && s.dialogue !== 'none' && <div style={{ marginTop: 12 }}><Notice kind="info">This trend often gives babies deep adult voices as a joke. Choose <b>“Match each character's real age”</b> for real baby voices, or <b>“Comedy”</b> for the adult-voice style.</Notice></div>}
        {s.language !== 'English' && s.dialogue !== 'none' && <div style={{ marginTop: 12 }}><Notice>Prompts are written in English (best results). Spoken lines will be in {spokenLang(P)}. AI video voices are usually strongest in English — test one clip first.</Notice></div>}

        <div className="field" style={{ marginTop: 18 }}><label htmlFor="idea">Your idea</label>
          <textarea id="idea" className="textarea" disabled={L} placeholder="Describe your story idea in a line or two — or leave empty and let the AI invent one." {...bind('story.idea')} /></div>
        {!L && hasTavily && (
          <label className="check-line" style={{ marginTop: 10 }}>
            <input type="checkbox" checked={s.research !== false} onChange={e => { const v = e.target.checked; updateP(p => { p.story.settings.research = v; }); }} />
            <Globe size={15} /> Research similar stories on the web first (about 2 Tavily credits)
          </label>
        )}
        {!L && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={suggestIdeas}><Lightbulb size={16} /> Suggest ideas</button>
            <button className="btn primary" onClick={writeStory}><PenLine size={16} /> {st ? 'Write a new story' : 'Write story'}</button>
          </div>
        )}
        {!L && !st && <p className="hint" style={{ marginTop: 8 }}>The AI develops 3 storylines, picks the one with the strongest hook, suspense and ending, then writes it from the first frame to the last.</p>}
        {!L && P.story.ideas.length > 0 && (
          <div className="ideas">
            {P.story.ideas.map((it, k) => (
              <button key={k} className="idea" onClick={() => updateP(p => { p.story.idea = `${it.title}: ${it.logline}`; })}>
                <Sparkles size={16} /><span><b>{it.title}</b><br /><span className="small muted">{it.logline}</span></span>
              </button>
            ))}
          </div>
        )}
      </section>

      {st && (
        <section className="panel">
          <div className="plan-strip">
            <div><span className="tiny muted">Clips</span><b>{st.parts.length}</b></div>
            <div><span className="tiny muted">Length</span><b>{fmtDur(st.parts.length * sec)}</b></div>
            <div><span className="tiny muted">Scenes</span><b>{st.parts.filter(p => p.transition === 'cut').length}</b></div>
            <div className="grow"><span className="tiny muted">Why this many clips</span><span className="small">{st.pacing_note || '—'}</span></div>
          </div>
          {st.researched && <p className="tiny muted" style={{ marginTop: 6 }}><Globe size={12} style={{ verticalAlign: -2 }} /> Web research on similar stories was used for inspiration.</p>}
          <Storylines st={st} />

          {!L && <div style={{ margin: '16px 0 14px' }}><Notice kind="info">Review and edit anything. When you finalize, the AI rebuilds the characters, locations, style and master prompt from your final story, then plans every clip so each one starts exactly where the previous one ended.</Notice></div>}
          <div className="cols-2" style={{ margin: '16px 0' }}>
            <div className="field"><label htmlFor="s-title">Title</label><input id="s-title" className="input" disabled={L} {...bind('story.data.title')} /></div>
            <div className="field"><label htmlFor="s-log">Logline</label><input id="s-log" className="input" disabled={L} {...bind('story.data.logline')} /></div>
          </div>

          <div className="tabs" role="tablist">
            {[['parts', 'Story parts', ListOrdered, st.parts.length], ['chars', 'Characters', Users, st.characters.length], ['locs', 'Locations', MapPin, st.locations.length], ['style', 'Style lock', Palette], ['master', 'Story master prompt', Clapperboard]].map(([k, l, Icon, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={15} /> {l}{n != null && <span className="badge">{n}</span>}</button>
            ))}
          </div>

          {tab === 'parts' && st.parts.map((p, i) => (
            <div className="block" key={p.id || i}>
              <div className="block-head">
                <div className="row">
                  <span className="part-no">{i + 1}</span><b>{fmtT(i * sec)}–{fmtT((i + 1) * sec)}</b>
                  {p.purpose && <span className={`badge ${PURPOSE_CLS[p.purpose] || ''}`}>{p.purpose}</span>}
                  <span className={`badge ${p.transition === 'continuous' ? '' : 'accent'}`}>{i === 0 ? 'Opening scene' : p.transition === 'continuous' ? 'Continues' : 'New scene'}</span>
                </div>
                {!L && <div className="row">
                  <button className="btn sm ghost" onClick={() => updateP(d => { const ps = d.story.data.parts; ps.splice(i + 1, 0, { id: uid(), title: '', summary: '', purpose: '', transition: 'continuous', characters: [...ps[i].characters], location: ps[i].location, time_of_day: ps[i].time_of_day, weather: ps[i].weather }); clearClips(d); })}><Plus size={14} /> Insert after</button>
                  <button className="btn sm ghost danger" disabled={st.parts.length <= 1} onClick={async () => { if (await confirm({ title: `Delete part ${i + 1}?`, message: 'This moment will be removed from the story.', confirmLabel: 'Delete', danger: true })) updateP(d => { d.story.data.parts.splice(i, 1); if (d.story.data.parts[0]) d.story.data.parts[0].transition = 'cut'; clearClips(d); }); }}><Trash2 size={14} /> Delete</button>
                </div>}
              </div>
              <input className="input" placeholder="Part title" disabled={L} {...bind(`story.data.parts.${i}.title`)} style={{ marginBottom: 8 }} aria-label={`Part ${i + 1} title`} />
              <textarea className="textarea" disabled={L} {...bind(`story.data.parts.${i}.summary`)} aria-label={`Part ${i + 1} summary`} />
              <div className="part-meta">
                <div className="field"><label>Transition</label>
                  <select className="select" disabled={L || i === 0} {...bind(`story.data.parts.${i}.transition`)}>
                    <option value="continuous">Continues previous</option><option value="cut">New scene</option>
                  </select></div>
                <div className="field"><label>Location</label>
                  <select className="select" disabled={L} {...bind(`story.data.parts.${i}.location`)}>
                    {st.locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select></div>
                <div className="field"><label>Time of day</label><input className="input" disabled={L} {...bind(`story.data.parts.${i}.time_of_day`)} placeholder="e.g. late afternoon" /></div>
                <div className="field"><label>Weather</label><input className="input" disabled={L} {...bind(`story.data.parts.${i}.weather`)} placeholder="e.g. clear" /></div>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="small muted">In this moment:</span>
                {st.characters.map(c => (
                  <button key={c.id} className={`chip ${p.characters.includes(c.id) ? 'on' : ''}`} disabled={L} onClick={() => toggleChar(i, c.id)}>{c.name}</button>
                ))}
              </div>
              {!L && (
                <div className="row" style={{ marginTop: 10 }}>
                  <input className="input grow" placeholder="Optional: how should AI change this part?" value={partIns[i] || ''} onChange={e => setPartIns(x => ({ ...x, [i]: e.target.value }))} aria-label={`Change request for part ${i + 1}`} />
                  <button className="btn sm soft" onClick={async () => { if (await rewritePart(i, partIns[i])) setPartIns(x => ({ ...x, [i]: '' })); }}><Wand2 size={14} /> AI rewrite</button>
                </div>
              )}
            </div>
          ))}

          {tab === 'chars' && <>
            {st.characters.map((c, i) => (
              <div className="block" key={c.id}>
                <div className="block-head">
                  <div className="row"><input className="input" style={{ maxWidth: 240 }} disabled={L} {...bind(`story.data.characters.${i}.name`)} aria-label="Character name" /><span className="badge">{c.id}</span><span className="badge accent">locked text</span></div>
                  {!L && <button className="btn sm ghost danger" onClick={async () => { if (await confirm({ title: `Remove ${c.name}?`, message: 'The character will be removed from the story and from every part.', confirmLabel: 'Remove', danger: true })) updateP(d => { d.story.data.characters.splice(i, 1); d.story.data.parts.forEach(pt => { pt.characters = pt.characters.filter(x => x !== c.id); }); clearClips(d); }); }}><Trash2 size={14} /> Remove</button>}
                </div>
                <div className="cols-2">
                  <div className="field"><label>Appearance</label><textarea className="textarea" disabled={L} {...bind(`story.data.characters.${i}.appearance`)} /></div>
                  <div className="field"><label>Wardrobe</label><textarea className="textarea" disabled={L} {...bind(`story.data.characters.${i}.wardrobe`)} /></div>
                  <div className="field"><label>Role</label><input className="input" disabled={L} {...bind(`story.data.characters.${i}.role`)} /></div>
                  <div className="field"><label>Age</label><input className="input" disabled={L} placeholder="e.g. 2-year-old toddler" {...bind(`story.data.characters.${i}.age`)} /></div>
                </div>
                <div className="field" style={{ marginTop: 10 }}><label>Voice (must fit the age)</label>
                  <input className="input" disabled={L} placeholder="e.g. high-pitched, soft toddler voice, simple words" {...bind(`story.data.characters.${i}.voice`)} /></div>
                {s.dialogue !== 'none' && voiceNeedsAgeFix(P, c) && <div style={{ marginTop: 8 }}><Notice>This voice does not sound like a child. In the prompts it will be written as: <b>{voiceFor(P, c)}</b>. Edit the voice above to change it.</Notice></div>}
              </div>
            ))}
            {!L && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => updateP(d => { const cs = d.story.data.characters; let id = 'c' + (cs.length + 1); while (cs.some(c => c.id === id)) id += 'x'; cs.push({ id, name: 'New character', role: '', age: '', appearance: '', wardrobe: '', voice: '' }); })}><Plus size={14} /> Add character</button>}
          </>}

          {tab === 'locs' && <>
            {st.locations.map((l, i) => (
              <div className="block" key={l.id}>
                <div className="block-head">
                  <div className="row"><input className="input" style={{ maxWidth: 280 }} disabled={L} {...bind(`story.data.locations.${i}.name`)} aria-label="Location name" /><span className="badge">{l.id}</span><span className="badge accent">locked text</span></div>
                  {!L && <button className="btn sm ghost danger" disabled={st.locations.length <= 1} onClick={async () => {
                    const used = st.parts.filter(pt => pt.location === l.id).length;
                    if (await confirm({ title: `Remove ${l.name}?`, message: used ? `${used} part(s) use this location; they will be moved to ${st.locations.find(x => x.id !== l.id)?.name}.` : 'This location is not used by any part.', confirmLabel: 'Remove', danger: true })) {
                      updateP(d => { const ls = d.story.data.locations; ls.splice(i, 1); d.story.data.parts.forEach(pt => { if (pt.location === l.id) pt.location = ls[0]?.id || ''; }); clearClips(d); });
                    }
                  }}><Trash2 size={14} /> Remove</button>}
                </div>
                <textarea className="textarea" disabled={L} {...bind(`story.data.locations.${i}.description`)} aria-label="Location description" />
              </div>
            ))}
            {!L && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => updateP(d => { const ls = d.story.data.locations; let id = 'l' + (ls.length + 1); while (ls.some(x => x.id === id)) id += 'x'; ls.push({ id, name: 'New location', description: '' }); })}><Plus size={14} /> Add location</button>}
          </>}

          {tab === 'style' && (
            <div className="kv">
              {s.dialogue === 'narration' && <div className="field"><label>Narrator voice</label><input className="input" disabled={L} placeholder="e.g. warm, calm adult female storyteller, slow pace" {...bind('story.data.narrator_voice')} /></div>}
              {[['art_style', 'Art style'], ['film_look', 'Film look'], ['lighting', 'Lighting'], ['color_palette', 'Colour palette'], ['camera_language', 'Camera language']].map(([k, l]) => (
                <div className="field" key={k}><label>{l}</label><input className="input" disabled={L} {...bind(`story.data.style_lock.${k}`)} /></div>
              ))}
            </div>
          )}

          {tab === 'master' && (P.story.master ? (
            <>
              <p className="small muted" style={{ marginBottom: 12 }}>Built from your final story when you finalized. {L ? 'Unlock the story to edit it — finalizing again rebuilds it from your edited story.' : 'It will be rebuilt from your story when you finalize.'}</p>
              <div className="kv">{MASTER_FIELDS.map(([k, l]) => (
                <div className="field" key={k}><label>{l}</label><textarea className="textarea" disabled={L} {...bind(`story.master.${k}`)} /></div>
              ))}</div>
            </>
          ) : <Empty icon={Clapperboard} title="Created when you finalize"><span>The story master prompt, characters, locations and style are rebuilt from your final story when you click “Finalize story”, so they always match what you wrote.</span></Empty>)}

          {!L && (
            <div className="block" style={{ marginTop: 18, background: 'var(--accent-soft)', borderColor: 'transparent' }}>
              <div className="label" style={{ marginBottom: 8 }}>Change the whole story</div>
              <div className="row">
                <input className="input grow" value={storyIns} onChange={e => setStoryIns(e.target.value)} placeholder="e.g. make the ending more surprising, add a twist, change the hero into a girl" aria-label="Change the whole story" />
                <button className="btn" onClick={async () => { if (await rewriteStory(storyIns)) setStoryIns(''); }}><Wand2 size={16} /> Apply</button>
              </div>
            </div>
          )}

          <div className="row end" style={{ marginTop: 20 }}>
            {L ? <button className="btn primary" onClick={() => nav('prompts')}>View prompts <ArrowRight size={16} /></button>
              : <button className="btn primary lg" onClick={finalize}><CircleCheck size={18} /> Finalize story & create prompts</button>}
          </div>
        </section>
      )}
    </div>
  );
}
