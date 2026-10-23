import { useState } from 'react';
import { KeyRound, Search, Server, Clapperboard, UserRound, ShieldCheck, CircleCheck, CircleX, ExternalLink, Trash2, ArrowRight, Lock, Palette } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { PROVIDERS, COMPAT_BASES } from '../lib/settings.js';
import { connectionRoute } from '../lib/api.js';
import { str } from '../lib/utils.js';
import { PageHead, SecretInput, Notice } from '../components/ui.jsx';

function Status({ ok, tested, idle }) {
  if (ok === true) return <span className="badge ok"><CircleCheck size={13} /> Working</span>;
  if (ok === false && tested !== false) return <span className="badge bad"><CircleX size={13} /> Not working</span>;
  return <span className="badge">{idle}</span>;
}
function Section({ icon: Icon, title, desc, children }) {
  return (
    <div className="set-section">
      <div className="set-label"><h3><Icon size={17} color="var(--accent)" /> {title}</h3>{desc && <p>{desc}</p>}</div>
      <div className="stack">{children}</div>
    </div>
  );
}

function ProfileSection() {
  const { profile, plain, session, lock, flush, toast, confirm, S, updateS, D, projects, P, creditsUsed } = useApp();
  const [name, setName] = useState(profile?.name || '');
  const [oldPass, setOld] = useState('');
  const [newPass, setNew] = useState('');
  const [newPass2, setNew2] = useState('');
  const [err, setErr] = useState('');
  const [working, setWorking] = useState(false);

  if (plain) {
    return (
      <Section icon={UserRound} title="Profile & privacy" desc="Unprotected workspace.">
        <Notice>This page is not on a secure connection, so passcode-protected profiles are switched off and your data is not encrypted. Open the app through an https link or as http://localhost to use private profiles.</Notice>
      </Section>
    );
  }
  const changePass = async e => {
    e.preventDefault();
    if (newPass.length < 6) return setErr('Use a new passcode of at least 6 characters.');
    if (newPass !== newPass2) return setErr('The new passcodes do not match.');
    setErr(''); setWorking(true);
    try {
      await flush();
      await session.changePasscode(oldPass, newPass, { v: 2, settings: S, discover: D, projects, currentId: P.id, credits: { [new Date().toISOString().slice(0, 7)]: creditsUsed } });
      setOld(''); setNew(''); setNew2('');
      toast('Passcode changed.');
    } catch (x) { setErr(x.code === 'WRONG' ? 'Current passcode is wrong.' : x.message); }
    finally { setWorking(false); }
  };
  const removeProfile = async () => {
    const ok = await confirm({ title: 'Delete this profile?', message: `All stories, settings and keys in “${profile.name}” will be permanently deleted from this browser. Export any stories you want to keep first.`, confirmLabel: 'Delete profile', danger: true, requireText: profile.name });
    if (ok) session.remove();
  };

  return (
    <Section icon={UserRound} title="Profile & privacy" desc="Your stories and keys are encrypted with your passcode. Other people using this browser need their own profile and cannot see yours.">
      <div className="row">
        <div className="field grow"><label htmlFor="p-name">Profile name</label><input id="p-name" className="input" value={name} maxLength={40} onChange={e => setName(e.target.value)} /></div>
        <button className="btn" style={{ alignSelf: 'flex-end' }} disabled={!str(name) || name.trim() === profile.name} onClick={() => { session.rename(name.trim()); toast('Profile renamed.'); }}>Save name</button>
      </div>
      <div className="row">
        <button className="btn" onClick={lock}><Lock size={16} /> Lock now</button>
        <div className="field" style={{ minWidth: 220 }}><label htmlFor="p-auto">Lock automatically when idle</label>
          <select id="p-auto" className="select" value={S.autoLock} onChange={e => { const v = Number(e.target.value); updateS(s => { s.autoLock = v; }); }}>
            <option value={0}>Never</option><option value={5}>After 5 minutes</option><option value={15}>After 15 minutes</option><option value={30}>After 30 minutes</option><option value={60}>After 1 hour</option>
          </select></div>
      </div>
      <p className="hint">The profile also locks when this browser tab is closed.</p>
      <form className="block" onSubmit={changePass}>
        <div className="label" style={{ marginBottom: 10 }}>Change passcode</div>
        <div className="cols">
          <div className="field"><label htmlFor="p-old">Current passcode</label><SecretInput id="p-old" value={oldPass} onChange={e => setOld(e.target.value)} /></div>
          <div className="field"><label htmlFor="p-new">New passcode</label><SecretInput id="p-new" value={newPass} onChange={e => setNew(e.target.value)} placeholder="At least 6 characters" /></div>
          <div className="field"><label htmlFor="p-new2">Repeat new passcode</label><SecretInput id="p-new2" value={newPass2} onChange={e => setNew2(e.target.value)} /></div>
        </div>
        {err && <div style={{ marginTop: 10 }}><Notice kind="bad">{err}</Notice></div>}
        <div className="row" style={{ marginTop: 12 }}><button className="btn" type="submit" disabled={working || !oldPass || !newPass}>Change passcode</button></div>
      </form>
      <div><button className="btn danger" onClick={removeProfile}><Trash2 size={16} /> Delete this profile</button></div>
    </Section>
  );
}

export default function Settings() {
  const { S, updateS, testAI, testTavily, forgetKeys, relay, nav, P, toast, creditsUsed } = useApp();
  const p = S.provider, pr = PROVIDERS[p];
  const set = (fn, resetAI, resetTavily) => updateS(s => { fn(s); if (resetAI) { s.aiOk = false; s.aiTested = false; } if (resetTavily) s.tavilyOk = null; });
  const route = connectionRoute(S);

  const cont = async () => {
    if (!str(S.keys[p])) { toast('Enter your AI key first.'); return; }
    if (!S.aiOk && !(await testAI(true))) return;
    if (str(S.tavilyKey) && S.tavilyOk == null) await testTavily(true);
    nav(P.story.locked && P.clips.length ? 'prompts' : P.genre ? 'story' : 'trending');
  };

  return (
    <div className="stack">
      <PageHead title="Settings" sub="Keys are kept only in your profile in this browser, and sent only to the provider you choose." />
      <section className="panel">
        <Section icon={KeyRound} title="AI provider" desc="Required. Writes the stories, master prompts and clip prompts.">
          <div className="prov-grid">
            {Object.entries(PROVIDERS).map(([k, v]) => (
              <button key={k} className={`prov ${k === p ? 'on' : ''}`} onClick={() => set(s => { s.provider = k; }, true)} aria-pressed={k === p}>
                <span className="top"><span className="row" style={{ gap: 8 }}><span className="radio-dot" />{v.label}</span><span className={`badge ${v.free ? 'ok' : ''}`}>{v.badge}</span></span>
                <span className="note">{v.note}</span>
              </button>
            ))}
          </div>
          {p === 'compat' && (
            <div className="field"><label htmlFor="base">Base URL</label>
              <input id="base" className="input" list="compatBases" placeholder="https://api.example.com/v1" value={S.compatBase} onChange={e => { const v = e.target.value; set(s => { s.compatBase = v; }, true); }} />
              <datalist id="compatBases">{COMPAT_BASES.map(b => <option key={b} value={b} />)}</datalist></div>
          )}
          <div className="field"><label htmlFor="aikey">{pr.label} API key</label>
            <SecretInput id="aikey" value={S.keys[p]} placeholder="Paste your key" onChange={e => { const v = e.target.value; set(s => { s.keys[p] = v; }, true); }} />
            {pr.keyUrl && <a className="small" href={pr.keyUrl} target="_blank" rel="noopener noreferrer">How to get this key <ExternalLink size={12} /></a>}
          </div>
          <div className="field"><label htmlFor="model">Model</label>
            <input id="model" className="input" list="modelList" value={S.models[p]} placeholder={p === 'compat' ? 'Model name from your provider' : ''} onChange={e => { const v = e.target.value; set(s => { s.models[p] = v; }, true); }} />
            <datalist id="modelList">{pr.models.map(m => <option key={m} value={m} />)}</datalist>
            <span className="hint">{p === 'compat' ? 'Copy the exact model name from your provider’s dashboard.' : 'Pre-selected automatically. Change only if you know the exact model name.'}{p === 'gemini' ? ' If it is unavailable, the next Gemini model is tried automatically.' : ''}</span>
          </div>
          <div className="row"><button className="btn" onClick={() => testAI()}>Test AI key</button><Status ok={S.aiOk ? true : S.aiTested ? false : null} idle="Not tested" /></div>
        </Section>

        <Section icon={Search} title="Web search (Tavily)" desc="Recommended. Finds trending content and researches story ideas. Free plan: 1,000 credits a month; one search uses 1 credit.">
          <div className="field"><label htmlFor="tkey">Tavily API key</label>
            <SecretInput id="tkey" value={S.tavilyKey} placeholder="tvly-…" onChange={e => { const v = e.target.value; set(s => { s.tavilyKey = v; }, false, true); }} />
            <span className="hint"><a href="https://app.tavily.com" target="_blank" rel="noopener noreferrer">Get a free Tavily key <ExternalLink size={12} /></a> · Credits used this month in this profile: <b>{creditsUsed}</b></span>
          </div>
          <div className="row"><button className="btn" disabled={!str(S.tavilyKey)} onClick={() => testTavily()}>Test Tavily key (uses 1 credit)</button>
            <Status ok={S.tavilyOk} idle={str(S.tavilyKey) ? 'Not tested' : 'Not set — built-in genres only'} /></div>
          <div><button className="btn danger sm" onClick={forgetKeys}><Trash2 size={14} /> Forget all keys</button></div>
        </Section>

        <ProfileSection />

        <Section icon={Server} title="Connection" desc="How the app reaches AI and search services. Automatic is right for almost everyone.">
          <div className="row"><span className="small">Built-in relay:</span>{relay ? <span className="badge ok"><CircleCheck size={13} /> Available</span> : <span className="badge">Not available here</span>}
            <span className="small muted">· Currently using: <b>{route === 'relay' ? 'built-in relay' : route === 'custom' ? 'your proxy' : 'direct from browser'}</b></span></div>
          <div className="opt-list">
            {[['auto', 'Automatic (recommended)', 'Uses the built-in relay when available (Docker or Vercel), otherwise connects directly.'],
              ['direct', 'Direct from browser', 'Calls each provider straight from this page.'],
              ['relay', 'Built-in relay', 'Routes calls through the app’s own server address. Avoids browser cross-site (CORS) blocks.'],
              ['custom', 'Custom proxy URL', 'Your own relay, e.g. a Cloudflare Worker.']].map(([v, t, d]) => (
              <label key={v} className={`opt ${S.connection === v ? 'on' : ''}`}>
                <input type="radio" name="conn" checked={S.connection === v} onChange={() => set(s => { s.connection = v; }, true, true)} />
                <span><b>{t}</b><span>{d}</span></span>
              </label>
            ))}
          </div>
          {S.connection === 'relay' && !relay && <Notice>The built-in relay is not available here. Choose another option.</Notice>}
          {S.connection === 'custom' && (
            <div className="field"><label htmlFor="proxy">Proxy URL</label>
              <input id="proxy" className="input" placeholder="https://your-worker.your-name.workers.dev" value={S.proxyUrl} onChange={e => { const v = e.target.value; set(s => { s.proxyUrl = v; }, true, true); }} /></div>
          )}
        </Section>

        <Section icon={Clapperboard} title="Video" desc="Match the clip length to your Flow plan.">
          <div className="field" style={{ maxWidth: 220 }}><label htmlFor="clip">Seconds per clip prompt</label>
            <input id="clip" className="input" type="number" min="4" max="20" value={S.clipSeconds}
              onChange={e => { const v = Math.min(20, Math.max(4, parseInt(e.target.value, 10) || 10)); set(s => { s.clipSeconds = v; }); }} /></div>
        </Section>

        <Section icon={Palette} title="Appearance">
          <div className="field" style={{ maxWidth: 260 }}><label htmlFor="theme">Theme</label>
            <select id="theme" className="select" value={S.theme} onChange={e => { const v = e.target.value; set(s => { s.theme = v; }); }}>
              <option value="light">Light</option><option value="dark">Dark</option><option value="auto">Follow device</option>
            </select></div>
        </Section>

        <div className="row end" style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
          <span className="small muted" style={{ marginRight: 'auto' }}><ShieldCheck size={14} style={{ verticalAlign: -2 }} /> Changes save automatically.</span>
          <button className="btn primary lg" onClick={cont}>Test & continue <ArrowRight size={17} /></button>
        </div>
      </section>
    </div>
  );
}
