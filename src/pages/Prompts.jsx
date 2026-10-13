import { useState } from 'react';
import { Copy, Download, FileJson, RefreshCw, Clapperboard, ArrowLeft, ArrowRight, ShieldCheck, ExternalLink, Undo2, TriangleAlert, Wand2 } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { buildPrompt, refPrompt, allPromptsText, wordLimit } from '../lib/prompts.js';
import { copyText, download, fmtT, safeName, wordCount } from '../lib/utils.js';
import { FLOW_URL } from '../lib/settings.js';
import { PageHead, Empty } from '../components/ui.jsx';

export default function Prompts() {
  const { P, S, nav, updateP, toast, generateClips, regenClip } = useApp();
  const [ins, setIns] = useState({});
  const st = P.story.data;
  const copy = async t => toast((await copyText(t)) ? 'Copied' : 'Copy failed — select the text and copy manually', false);

  if (!st || !P.story.locked) {
    return (
      <div className="panel"><Empty icon={Clapperboard} title="No clip prompts yet">
        <span>Write and finalize a story to get one ready-to-paste prompt per clip.</span>
        <button className="btn primary" onClick={() => nav(P.genre ? 'story' : 'trending')}>{P.genre ? 'Go to your story' : 'Choose a genre'} <ArrowRight size={16} /></button>
      </Empty></div>
    );
  }
  if (!P.clips.length) {
    return (
      <div className="panel"><Empty icon={Clapperboard} title="Prompts not created yet">
        <button className="btn primary" onClick={generateClips}><Wand2 size={16} /> Create prompts</button>
      </Empty></div>
    );
  }
  const sec = S.clipSeconds, wl = wordLimit(S);
  const doneN = P.clips.filter((_, i) => P.done[i]).length;

  return (
    <div className="stack">
      <PageHead title="Clip Prompts" sub={<>{st.title} — {P.clips.length} clips × {sec}s. Paste each prompt into Flow in order. Every prompt is self-contained, so it works in any account.</>}>
        <button className="btn ghost" onClick={() => nav('story')}><ArrowLeft size={16} /> Story</button>
        <a className="btn primary" href={FLOW_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open Flow</a>
      </PageHead>

      <section className="panel">
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="grow progress" aria-label={`${doneN} of ${P.clips.length} clips done`}><div style={{ width: `${(doneN / P.clips.length) * 100}%` }} /></div>
          <b className="small">{doneN}/{P.clips.length} done</b>
        </div>
        <div className="row">
          <button className="btn" onClick={() => copy(allPromptsText(P, S))}><Copy size={16} /> Copy all</button>
          <button className="btn" onClick={() => download(safeName(st.title) + '_prompts.txt', allPromptsText(P, S))}><Download size={16} /> Download .txt</button>
          <button className="btn" onClick={() => download(safeName(P.name) + '.json', JSON.stringify(P, null, 2), 'application/json')}><FileJson size={16} /> Project .json</button>
          <button className="btn ghost" onClick={() => window.confirm('Regenerate all clip prompts? Your edits and done ticks will be lost.') && generateClips()}><RefreshCw size={16} /> Regenerate all</button>
        </div>
        <details className="disclose" style={{ marginTop: 16 }}>
          <summary><ShieldCheck size={16} color="var(--accent)" /> Consistency kit — read before generating</summary>
          <ul className="small" style={{ paddingLeft: 18, margin: '0 0 12px' }}>
            <li>Generate clips <b>in order</b>. Keep the same aspect ratio and the same Flow model/quality setting for every clip, in every account.</li>
            <li>If your Flow plan lets you add a <b>reference image</b> or start from a <b>frame</b>, use it: create a character reference image (prompts below) and reuse it, or start each clip from the last frame of the previous one.</li>
            <li>If a clip drifts (wrong face or outfit), <b>regenerate that clip</b> rather than carrying the error forward.</li>
            <li>Join the clips in a free editor (e.g. CapCut) with a very short crossfade (about 4–6 frames) to hide small jumps.</li>
          </ul>
          <div className="label" style={{ marginBottom: 6 }}>Character reference prompts</div>
          {st.characters.map(c => (
            <div className="row" key={c.id} style={{ marginBottom: 8, alignItems: 'flex-start' }}>
              <div className="grow small muted">{refPrompt(P, c)}</div>
              <button className="btn sm" onClick={() => copy(refPrompt(P, c))}><Copy size={14} /> Copy</button>
            </div>
          ))}
        </details>
      </section>

      <section>
        {P.clips.map((c, i) => {
          const words = c.dialogue.reduce((a, d) => a + wordCount(d.line), 0);
          const done = !!P.done[i];
          const text = buildPrompt(P, S, c, i);
          return (
            <article key={i} className={`clip ${done ? 'isdone' : ''}`}>
              <div className="clip-head">
                <div className="row">
                  <span className="part-no">{i + 1}</span>
                  <b>Clip {i + 1} of {P.clips.length}</b>
                  <span className="badge">{fmtT(i * sec)}–{fmtT((i + 1) * sec)}</span>
                  {c.custom != null && <span className="badge accent">edited</span>}
                  {words > wl && <span className="badge warn"><TriangleAlert size={12} /> {words} spoken words — may not fit {sec}s (aim ≤ {wl})</span>}
                </div>
                <div className="row">
                  <label className={`done-toggle ${done ? 'on' : ''}`}>
                    <input type="checkbox" checked={done} onChange={e => { const v = e.target.checked; updateP(p => { p.done[i] = v; }); }} /> Done
                  </label>
                  <button className="btn sm primary" onClick={() => copy(text)}><Copy size={14} /> Copy</button>
                </div>
              </div>
              <div className="clip-body">
                <div className="small muted"><b style={{ color: 'var(--ink)' }}>Story:</b> {st.parts[i]?.summary}</div>
                <textarea className="textarea" spellCheck={false} value={text} aria-label={`Prompt for clip ${i + 1}`}
                  onChange={e => { const v = e.target.value; updateP(p => { p.clips[i].custom = v; }); }} />
                <div className="row">
                  <input className="input grow" placeholder="Optional: what should change in this clip?" value={ins[i] || ''} onChange={e => setIns(x => ({ ...x, [i]: e.target.value }))} />
                  <button className="btn sm soft" onClick={async () => { await regenClip(i, ins[i]); setIns(x => ({ ...x, [i]: '' })); }}><RefreshCw size={14} /> Regenerate clip</button>
                  {c.custom != null && <button className="btn sm ghost" onClick={() => updateP(p => { p.clips[i].custom = null; })}><Undo2 size={14} /> Undo my edits</button>}
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
