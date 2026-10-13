import { useState } from 'react';
import { ArrowRight, Lightbulb, PenLine, Wand2, Plus, Trash2, Lock, LockOpen, Users, MapPin, Palette, ListOrdered, CircleCheck, Sparkles, ArrowLeft } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { nClips, spokenLang } from '../lib/prompts.js';
import { fmtT, uid } from '../lib/utils.js';
import { PageHead, Notice, Empty, useBind } from '../components/ui.jsx';

export default function Story() {
  const app = useApp();
  const { P, S, nav, updateP, suggestIdeas, writeStory, rewriteStory, rewritePart, finalize } = app;
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
  const totals = [...new Set([10, 20, 30, 40, 60, 90, 120].map(x => Math.max(sec, Math.round(x / sec) * sec)).concat(s.totalSeconds))].sort((a, b) => a - b);
  const syncLen = p => { p.story.settings.totalSeconds = p.story.data.parts.length * sec; p.clips = []; p.done = {}; };

  const unlock = () => {
    if (!window.confirm('Unlock the story for editing? The current prompts will be cleared and created again when you finalize.')) return;
    updateP(p => { p.story.locked = false; p.clips = []; p.done = {}; });
  };
  const onWrite = async () => {
    if (st && !window.confirm('Write a completely new story? Your current story and edits will be replaced.')) return;
    await writeStory();
  };

  return (
    <div className="stack">
      <PageHead title={st ? st.title || 'Your story' : 'Write Your Story'} sub={<>Genre: <b style={{ color: 'var(--ink)' }}>{P.genre.name}</b> · {st ? `${st.parts.length} parts = ${st.parts.length} clips = ${st.parts.length * sec}s` : `${nClips(P, S)} clips × ${sec}s`}</>}>
        <button className="btn ghost" onClick={() => nav('genre')}><ArrowLeft size={16} /> Genre</button>
        <button className="btn ghost" onClick={() => nav('stories')}>All stories</button>
      </PageHead>

      {L && (
        <div className="lock-bar">
          <div className="lb"><Lock size={18} color="var(--accent)" /> <span><b>Story finalized.</b> Characters, outfits, locations and style are locked into every prompt.</span></div>
          <div className="row"><button className="btn sm" onClick={unlock}><LockOpen size={14} /> Unlock to edit</button>
            <button className="btn sm primary" onClick={() => nav('prompts')}>View prompts <ArrowRight size={14} /></button></div>
        </div>
      )}

      <section className="panel">
        <div className="section-title"><h2>Video settings & idea</h2></div>
        <div className="cols">
          <div className="field"><label>Total video length</label>
            <select className="select" disabled={L || !!st} {...bind('story.settings.totalSeconds', { num: true })}>
              {totals.map(t => <option key={t} value={t}>{t}s → {Math.round(t / sec)} clips</option>)}
            </select></div>
          <div className="field"><label>Aspect ratio</label>
            <select className="select" disabled={L} {...bind('story.settings.aspect')}>
              <option value="9:16">9:16 vertical (Shorts/Reels/TikTok)</option><option value="16:9">16:9 widescreen (YouTube)</option><option value="1:1">1:1 square</option>
            </select></div>
          <div className="field"><label>Speech</label>
            <select className="select" disabled={L} {...bind('story.settings.dialogue')}>
              <option value="narration">Narrator voice-over</option><option value="dialogue">Characters talk</option><option value="none">No speech (music/SFX)</option>
            </select></div>
          <div className="field"><label>Spoken language</label>
            <select className="select" disabled={L} {...bind('story.settings.language')}>{['English', 'Urdu', 'Hindi', 'Arabic', 'Other'].map(o => <option key={o}>{o}</option>)}</select></div>
          {s.language === 'Other' && <div className="field"><label>Which language?</label><input className="input" disabled={L} {...bind('story.settings.languageOther')} /></div>}
        </div>
        {st && <p className="hint" style={{ marginTop: 8 }}>Length now follows the number of story parts. Add or remove parts below.</p>}
        {s.language !== 'English' && s.dialogue !== 'none' && <div style={{ marginTop: 12 }}><Notice>Prompts are written in English (best results). Spoken lines will be in {spokenLang(P)}. AI video voices are usually strongest in English — test one clip first.</Notice></div>}

        <div className="field" style={{ marginTop: 18 }}><label htmlFor="idea">Your idea</label>
          <textarea id="idea" className="textarea" disabled={L} placeholder="Describe your story idea in a line or two — or leave empty and ask for suggestions." {...bind('story.idea')} /></div>
        {!L && (
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={suggestIdeas}><Lightbulb size={16} /> Suggest ideas</button>
            <button className="btn primary" onClick={onWrite}><PenLine size={16} /> {st ? 'Write a new story' : 'Write story'}</button>
          </div>
        )}
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
          {!L && <div style={{ marginBottom: 14 }}><Notice kind="info">Review and edit anything. Character, outfit and location text is copied word-for-word into every clip prompt — this is what keeps clips consistent.</Notice></div>}
          <div className="cols-2" style={{ marginBottom: 16 }}>
            <div className="field"><label>Title</label><input className="input" disabled={L} {...bind('story.data.title')} /></div>
            <div className="field"><label>Logline</label><input className="input" disabled={L} {...bind('story.data.logline')} /></div>
          </div>

          <div className="tabs" role="tablist">
            {[['parts', 'Story parts', ListOrdered, st.parts.length], ['chars', 'Characters', Users, st.characters.length], ['locs', 'Locations', MapPin, st.locations.length], ['style', 'Style lock', Palette]].map(([k, l, Icon, n]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}><Icon size={15} /> {l}{n != null && <span className="badge">{n}</span>}</button>
            ))}
          </div>

          {tab === 'parts' && st.parts.map((p, i) => (
            <div className="block" key={p.id || i}>
              <div className="block-head">
                <div className="row"><span className="part-no">{i + 1}</span><b>{fmtT(i * sec)}–{fmtT((i + 1) * sec)}</b></div>
                {!L && <div className="row">
                  <button className="btn sm ghost" onClick={() => updateP(d => { d.story.data.parts.splice(i + 1, 0, { id: uid(), title: '', summary: '', characters: [], location: d.story.data.locations[0]?.id || '' }); syncLen(d); })}><Plus size={14} /> Insert after</button>
                  <button className="btn sm ghost danger" disabled={st.parts.length <= 1} onClick={() => window.confirm(`Delete part ${i + 1}?`) && updateP(d => { d.story.data.parts.splice(i, 1); syncLen(d); })}><Trash2 size={14} /> Delete</button>
                </div>}
              </div>
              <input className="input" placeholder="Part title" disabled={L} {...bind(`story.data.parts.${i}.title`)} style={{ marginBottom: 8 }} />
              <textarea className="textarea" disabled={L} {...bind(`story.data.parts.${i}.summary`)} aria-label={`Part ${i + 1} summary`} />
              <div className="small muted" style={{ marginTop: 6 }}>
                Characters: {p.characters.map(id => st.characters.find(c => c.id === id)?.name || id).join(', ') || '—'} · Location: {st.locations.find(l => l.id === p.location)?.name || p.location || '—'}
              </div>
              {!L && (
                <div className="row" style={{ marginTop: 10 }}>
                  <input className="input grow" placeholder="Optional: how should AI change this part?" value={partIns[i] || ''} onChange={e => setPartIns(x => ({ ...x, [i]: e.target.value }))} />
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
                  {!L && <button className="btn sm ghost danger" onClick={() => window.confirm('Remove this character?') && updateP(d => { d.story.data.characters.splice(i, 1); })}><Trash2 size={14} /> Remove</button>}
                </div>
                <div className="cols-2">
                  <div className="field"><label>Appearance</label><textarea className="textarea" disabled={L} {...bind(`story.data.characters.${i}.appearance`)} /></div>
                  <div className="field"><label>Wardrobe</label><textarea className="textarea" disabled={L} {...bind(`story.data.characters.${i}.wardrobe`)} /></div>
                  <div className="field"><label>Role</label><input className="input" disabled={L} {...bind(`story.data.characters.${i}.role`)} /></div>
                  <div className="field"><label>Voice</label><input className="input" disabled={L} {...bind(`story.data.characters.${i}.voice`)} /></div>
                </div>
              </div>
            ))}
            {!L && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => updateP(d => { const cs = d.story.data.characters; let id = 'c' + (cs.length + 1); while (cs.some(c => c.id === id)) id += 'x'; cs.push({ id, name: 'New character', role: '', appearance: '', wardrobe: '', voice: '' }); })}><Plus size={14} /> Add character</button>}
          </>}

          {tab === 'locs' && <>
            {st.locations.map((l, i) => (
              <div className="block" key={l.id}>
                <div className="block-head">
                  <div className="row"><input className="input" style={{ maxWidth: 280 }} disabled={L} {...bind(`story.data.locations.${i}.name`)} aria-label="Location name" /><span className="badge">{l.id}</span><span className="badge accent">locked text</span></div>
                  {!L && <button className="btn sm ghost danger" onClick={() => window.confirm('Remove this location?') && updateP(d => { d.story.data.locations.splice(i, 1); })}><Trash2 size={14} /> Remove</button>}
                </div>
                <textarea className="textarea" disabled={L} {...bind(`story.data.locations.${i}.description`)} aria-label="Location description" />
              </div>
            ))}
            {!L && <button className="btn sm" style={{ marginTop: 12 }} onClick={() => updateP(d => { const ls = d.story.data.locations; let id = 'l' + (ls.length + 1); while (ls.some(x => x.id === id)) id += 'x'; ls.push({ id, name: 'New location', description: '' }); })}><Plus size={14} /> Add location</button>}
          </>}

          {tab === 'style' && (
            <div className="kv">
              {[['art_style', 'Art style'], ['lighting', 'Lighting'], ['color_palette', 'Colour palette'], ['time_of_day', 'Time of day'], ['camera_language', 'Camera language']].map(([k, l]) => (
                <div className="field" key={k}><label>{l}</label><input className="input" disabled={L} {...bind(`story.data.style_lock.${k}`)} /></div>
              ))}
            </div>
          )}

          {!L && (
            <div className="block" style={{ marginTop: 18, background: 'var(--accent-soft)', borderColor: 'transparent' }}>
              <div className="label" style={{ marginBottom: 8 }}>Change the whole story</div>
              <div className="row">
                <input className="input grow" value={storyIns} onChange={e => setStoryIns(e.target.value)} placeholder="e.g. make the ending funnier, add a twist, change the hero into a girl" />
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
