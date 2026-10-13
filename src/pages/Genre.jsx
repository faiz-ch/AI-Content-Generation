import { ArrowLeft, ArrowRight, Copy, RefreshCw, Lock, Wand2, ExternalLink, Lightbulb } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { MASTER_FIELDS, masterText } from '../lib/prompts.js';
import { copyText } from '../lib/utils.js';
import { PageHead, Empty, Thumb, StrengthBadge, Notice, useBind } from '../components/ui.jsx';

export default function Genre() {
  const { P, nav, genMaster, toast, requireAI } = useApp();
  const bind = useBind();
  const g = P.genre;
  if (!g) {
    return (
      <div className="panel"><Empty icon={Lightbulb} title="No genre chosen yet">
        <button className="btn primary" onClick={() => nav('trending')}>Explore Trending Genres <ArrowRight size={16} /></button>
      </Empty></div>
    );
  }
  const locked = P.story.locked;
  const regen = async () => {
    if (locked) { toast('Unlock the story first to change the master prompt.'); return; }
    if (g.master && !window.confirm('Replace the current master prompt with a new one?')) return;
    if (!requireAI()) return;
    await genMaster(g);
  };

  return (
    <div className="stack">
      <PageHead title={g.name} sub="Review the genre and fine-tune the master prompt used for every clip.">
        <button className="btn ghost" onClick={() => nav('trending')}><ArrowLeft size={16} /> All genres</button>
      </PageHead>

      <section className="panel">
        <div className="genre-hero">
          <Thumb card={g}><span className="strength"><StrengthBadge s={g.strength} /></span></Thumb>
          <div className="stack">
            <div className="row">
              {g.platforms.map(p => <span key={p} className="badge">{p}</span>)}
              <span className="badge accent">Audience: {g.audience}</span>
            </div>
            <p>{g.description}</p>
            {g.why && <p className="small"><b>Why it’s trending:</b> <span className="muted">{g.why}</span></p>}
            {g.examples?.length > 0 && (
              <div className="small"><b>Example ideas</b>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }} className="muted">{g.examples.map(e => <li key={e}>{e}</li>)}</ul>
              </div>
            )}
            {g.sources?.length > 0 && (
              <details className="disclose"><summary className="small"><ExternalLink size={14} /> Sources ({g.sources.length})</summary>
                <div className="sources">{g.sources.slice(0, 10).map(s => <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">{s.title || s.url}</a>)}</div>
              </details>
            )}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-title">
          <div><h2><Wand2 size={18} style={{ verticalAlign: -3, color: 'var(--accent)' }} /> Master prompt</h2>
            <p className="small muted" style={{ marginTop: 4 }}>The style guide applied to every clip. Edit any field — changes save automatically.</p></div>
          <div className="row">
            <button className="btn sm" disabled={!g.master} onClick={async () => toast((await copyText(masterText(g.master))) ? 'Copied' : 'Copy failed', false)}><Copy size={14} /> Copy</button>
            <button className="btn sm" onClick={regen} disabled={locked}><RefreshCw size={14} /> Regenerate</button>
          </div>
        </div>
        {locked && <Notice kind="info"><Lock size={14} style={{ verticalAlign: -2 }} /> Locked because the story is finalized. Unlock the story to edit.</Notice>}
        {g.master ? (
          <div className="kv" style={{ marginTop: 12 }}>
            {MASTER_FIELDS.map(([k, l]) => (
              <div className="field" key={k}><label htmlFor={`m-${k}`}>{l}</label>
                <textarea id={`m-${k}`} className="textarea" disabled={locked} {...bind(`genre.master.${k}`)} /></div>
            ))}
          </div>
        ) : (
          <Empty icon={Wand2} title="No master prompt yet">
            <button className="btn primary" onClick={() => requireAI() && genMaster(g)}><Wand2 size={16} /> Generate master prompt</button>
          </Empty>
        )}
        <div className="row end" style={{ marginTop: 18 }}>
          <button className="btn" onClick={() => nav('trending')}><ArrowLeft size={16} /> Back to genres</button>
          <button className="btn primary" disabled={!g.master} onClick={() => nav('story')}>
            Use this genre <ArrowRight size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}
