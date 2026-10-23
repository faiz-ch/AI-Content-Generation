import { useState } from 'react';
import { Copy, Download, FileJson, RefreshCw, Clapperboard, ArrowLeft, ArrowRight, ShieldCheck, ExternalLink, Undo2, TriangleAlert, Wand2, Play, CircleCheck, Link2, Film, ScanSearch } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { buildPrompt, refPrompt, allPromptsText, renderState } from '../lib/prompts.js';
import { copyText, download, fmtT, fmtDur, safeName } from '../lib/utils.js';
import { FLOW_URL } from '../lib/settings.js';
import { PageHead, Empty, Notice } from '../components/ui.jsx';

function ScenePlan({ st, c }) {
  return (
    <details className="disclose plan-detail">
      <summary className="small"><Film size={14} /> Scene plan — start, action, end</summary>
      <div className="scene-grid">
        <div><span className="tiny muted">START FRAME</span><p className="small">{renderState(st, c.start_state)}</p></div>
        <div><span className="tiny muted">ACTION</span><ul className="small">{c.beats.map((b, k) => <li key={k}>{b.t && <b>{b.t}: </b>}{b.action}</li>)}</ul></div>
        <div><span className="tiny muted">END FRAME</span><p className="small">{renderState(st, c.end_state)}</p></div>
      </div>
    </details>
  );
}

export default function Prompts() {
  const { P, S, nav, updateP, toast, continueClips, regenerateAll, regenClip, checkContinuity } = useApp();
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
  const sec = S.clipSeconds, n = st.parts.length;
  const incomplete = P.clips.length < n;
  if (!P.clips.length) {
    return (
      <div className="panel"><Empty icon={Clapperboard} title="Prompts not created yet">
        <button className="btn primary" onClick={continueClips}><Wand2 size={16} /> Create prompts</button>
      </Empty></div>
    );
  }
  const doneN = P.clips.filter((_, i) => P.done[i]).length;
  const issueN = P.clips.reduce((a, c) => a + (c.custom == null ? c.issues?.length || 0 : 0) + (c.stale ? 1 : 0), 0);
  const scenes = P.clips.filter(c => c.transition === 'cut').length;

  return (
    <div className="stack">
      <PageHead title="Clip Prompts" sub={<>{st.title} — {n} clips × {sec}s = {fmtDur(n * sec)}, {scenes} scene{scenes === 1 ? '' : 's'}. Paste each prompt into Flow in order; every prompt is self-contained, so it works in any account.</>}>
        <button className="btn ghost" onClick={() => nav('story')}><ArrowLeft size={16} /> Story</button>
        <a className="btn primary" href={FLOW_URL} target="_blank" rel="noopener noreferrer"><ExternalLink size={16} /> Open Flow</a>
      </PageHead>

      {incomplete && (
        <Notice>
          <div className="row between" style={{ width: '100%' }}>
            <span><b>{P.clips.length} of {n} clips planned.</b> Generation stopped before the end (cancelled, or the AI service limit was reached).</span>
            <button className="btn sm primary" onClick={continueClips}><Play size={14} /> Continue</button>
          </div>
        </Notice>
      )}

      <section className="panel">
        <div className="row" style={{ marginBottom: 14 }}>
          <div className="grow progress" aria-label={`${doneN} of ${P.clips.length} clips done`}><div style={{ width: `${(doneN / P.clips.length) * 100}%` }} /></div>
          <b className="small">{doneN}/{P.clips.length} done</b>
        </div>
        <div className="review-strip">
          {P.review ? (
            <span className="small">
              {P.review.skipped ? <TriangleAlert size={15} color="var(--warn)" /> : <CircleCheck size={15} color="var(--ok)" />}{' '}
              Continuity review: <b>{P.review.fixes.length} fix{P.review.fixes.length === 1 ? '' : 'es'} applied</b>
              {P.review.skipped ? ' (part of the review could not run — use “Check continuity”)' : ''}
              {issueN ? <> · <b>{issueN}</b> item{issueN === 1 ? '' : 's'} to look at (marked below)</> : ' · no open issues'}
            </span>
          ) : !incomplete && <span className="small muted">Continuity review not run yet.</span>}
          {P.review?.fixes?.length > 0 && (
            <details className="disclose" style={{ marginTop: 8 }}>
              <summary className="small">What the review fixed</summary>
              <ul className="small" style={{ paddingLeft: 18, margin: 0 }}>{P.review.fixes.map((f, k) => <li key={k}><b>Clip {f.part}</b> ({f.field.replace('_', ' ')}): {f.problem}</li>)}</ul>
            </details>
          )}
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="btn" onClick={() => copy(allPromptsText(P, S))}><Copy size={16} /> Copy all</button>
          <button className="btn" onClick={() => download(safeName(st.title) + '_prompts.txt', allPromptsText(P, S))}><Download size={16} /> Download .txt</button>
          <button className="btn" onClick={() => download(safeName(P.name) + '.json', JSON.stringify(P, null, 2), 'application/json')}><FileJson size={16} /> Story .json</button>
          {!incomplete && <button className="btn ghost" onClick={checkContinuity}><ScanSearch size={16} /> Check continuity</button>}
          <button className="btn ghost" onClick={regenerateAll}><RefreshCw size={16} /> Regenerate all</button>
        </div>
        {n > 9 && <p className="hint" style={{ marginTop: 10 }}>This story needs {n} clips. If your free Flow credits run out, continue another day or in another account — every prompt works on its own.</p>}
        <details className="disclose" style={{ marginTop: 16 }}>
          <summary><ShieldCheck size={16} color="var(--accent)" /> Consistency kit — read before generating</summary>
          <ul className="small" style={{ paddingLeft: 18, margin: '0 0 12px' }}>
            <li>Generate clips <b>in order</b>, with the same aspect ratio and the same Flow model/quality setting every time, in every account.</li>
            <li><b>“Continues”</b> clips start on the exact frame the previous clip ended on. If Flow lets you start from a frame or extend a clip, use the previous clip's last frame for these.</li>
            <li><b>“New scene”</b> clips change place or time, so a cut there is expected.</li>
            <li>If your Flow plan supports a <b>reference image</b>, create one per character with the prompts below and reuse it in every clip.</li>
            <li>If a clip drifts (wrong face, outfit or position), <b>regenerate that clip</b> before moving on.</li>
            <li>Join the clips in a free editor (e.g. CapCut). Use a very short crossfade (4–6 frames) only between “Continues” clips.</li>
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
          const done = !!P.done[i];
          const text = buildPrompt(P, S, c, i);
          const issues = c.custom == null ? c.issues || [] : [];
          return (
            <article key={i} className={`clip ${done ? 'isdone' : ''}`}>
              <div className="clip-head">
                <div className="row">
                  <span className="part-no">{i + 1}</span>
                  <b>Clip {i + 1} of {n}</b>
                  <span className="badge">{fmtT(i * sec)}–{fmtT((i + 1) * sec)}</span>
                  <span className={`badge ${c.transition === 'continuous' ? '' : 'accent'}`}>{i === 0 ? 'Opening scene' : c.transition === 'continuous' ? <><Link2 size={12} /> Continues clip {i}</> : 'New scene'}</span>
                  {c.custom != null && <span className="badge accent">edited by you</span>}
                  {c.stale && <span className="badge warn"><TriangleAlert size={12} /> Opening changed</span>}
                  {issues.length > 0 && <span className="badge warn"><TriangleAlert size={12} /> {issues.length} to check</span>}
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
                {(issues.length > 0 || c.stale) && (
                  <ul className="issue-list small">
                    {c.stale && <li>The previous clip was regenerated, so this clip now opens on a new frame. Check the action still fits, or regenerate this clip.</li>}
                    {issues.map((x, k) => <li key={k}>{x}</li>)}
                  </ul>
                )}
                {c.custom == null && <ScenePlan st={st} c={c} />}
                <textarea className="textarea" spellCheck={false} value={text} aria-label={`Prompt for clip ${i + 1}`}
                  onChange={e => { const v = e.target.value; updateP(p => { p.clips[i].custom = v; }); }} />
                <div className="row">
                  <input className="input grow" placeholder="Optional: what should change in this clip?" value={ins[i] || ''} onChange={e => setIns(x => ({ ...x, [i]: e.target.value }))} aria-label={`Change request for clip ${i + 1}`} />
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
