import { KeyRound, Search, Server, Clapperboard, UserRound, ShieldCheck, CircleCheck, CircleX, ExternalLink, Trash2, ArrowRight } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { PROVIDERS, COMPAT_BASES, DEFAULT_SETTINGS } from '../lib/settings.js';
import { creditsUsed, connectionRoute } from '../lib/api.js';
import { LS, SS } from '../lib/storage.js';
import { clone, str } from '../lib/utils.js';
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

export default function Settings() {
  const { S, updateS, testAI, testTavily, relay, nav, P, toast } = useApp();
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
      <PageHead title="Settings" sub="Keys stay in this browser and are sent only to the provider you choose (through the built-in relay or your own proxy, if set)." />
      <section className="panel">
        <Section icon={KeyRound} title="AI provider" desc="Required. Writes stories, master prompts and clip prompts.">
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

        <Section icon={Search} title="Web search (Tavily)" desc="Recommended. Finds trending AI video content. Free plan: 1,000 credits a month; one basic search uses 1 credit.">
          <div className="field"><label htmlFor="tkey">Tavily API key</label>
            <SecretInput id="tkey" value={S.tavilyKey} placeholder="tvly-…" onChange={e => { const v = e.target.value; set(s => { s.tavilyKey = v; }, false, true); }} />
            <span className="hint"><a href="https://app.tavily.com" target="_blank" rel="noopener noreferrer">Get a free Tavily key <ExternalLink size={12} /></a> · Credits used this month on this device: <b>{creditsUsed()}</b></span>
          </div>
          <div className="row"><button className="btn" disabled={!str(S.tavilyKey)} onClick={() => testTavily()}>Test Tavily key (uses 1 credit)</button>
            <Status ok={S.tavilyOk} idle={str(S.tavilyKey) ? 'Not tested' : 'Not set — built-in genres only'} /></div>
        </Section>

        <Section icon={Server} title="Connection" desc="How the app reaches AI and search services. Automatic is right for almost everyone.">
          <div className="row"><span className="small">Built-in relay:</span>{relay ? <span className="badge ok"><CircleCheck size={13} /> Available</span> : <span className="badge">Not available (app not running from Docker)</span>}
            <span className="small muted">· Currently using: <b>{route === 'relay' ? 'built-in relay' : route === 'custom' ? 'your proxy' : 'direct from browser'}</b></span></div>
          <div className="opt-list">
            {[['auto', 'Automatic (recommended)', 'Uses the built-in relay when the app runs from Docker, otherwise connects directly.'],
              ['direct', 'Direct from browser', 'Calls each provider straight from this page.'],
              ['relay', 'Built-in relay', 'Routes calls through the Docker container. Avoids browser cross-site (CORS) blocks.'],
              ['custom', 'Custom proxy URL', 'Your own relay, e.g. the Cloudflare Worker from the README.']].map(([v, t, d]) => (
              <label key={v} className={`opt ${S.connection === v ? 'on' : ''}`}>
                <input type="radio" name="conn" checked={S.connection === v} onChange={() => set(s => { s.connection = v; }, true, true)} />
                <span><b>{t}</b><span>{d}</span></span>
              </label>
            ))}
          </div>
          {S.connection === 'relay' && !relay && <Notice>The built-in relay is not available here. Run the app with Docker, or choose another option.</Notice>}
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

        <Section icon={UserRound} title="Profile & appearance">
          <div className="cols">
            <div className="field"><label htmlFor="dn">Your name (for the avatar)</label>
              <input id="dn" className="input" value={S.displayName} placeholder="Optional" onChange={e => { const v = e.target.value; set(s => { s.displayName = v; }); }} /></div>
            <div className="field"><label htmlFor="theme">Theme</label>
              <select id="theme" className="select" value={S.theme} onChange={e => { const v = e.target.value; set(s => { s.theme = v; }); }}>
                <option value="light">Light</option><option value="dark">Dark</option><option value="auto">Follow device</option>
              </select></div>
          </div>
        </Section>

        <Section icon={ShieldCheck} title="Key storage">
          <div className="opt-list">
            {[['local', 'Remember keys on this device', 'Convenient on your own computer.'], ['session', 'This session only', 'Keys are forgotten when this tab closes. Best on shared computers.']].map(([v, t, d]) => (
              <label key={v} className={`opt ${S.storage === v ? 'on' : ''}`}>
                <input type="radio" name="storage" checked={S.storage === v} onChange={() => set(s => { s.storage = v; })} />
                <span><b>{t}</b><span>{d}</span></span>
              </label>
            ))}
          </div>
          <div><button className="btn danger" onClick={() => {
            if (!window.confirm('Remove all saved keys from this browser?')) return;
            LS.del('fss_secrets'); SS.del('fss_secrets');
            set(s => { s.keys = clone(DEFAULT_SETTINGS.keys); s.tavilyKey = ''; }, true, true); toast('Keys removed.');
          }}><Trash2 size={16} /> Forget all keys</button></div>
        </Section>

        <div className="row end" style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
          <button className="btn primary lg" onClick={cont}>Save & continue <ArrowRight size={17} /></button>
        </div>
      </section>
    </div>
  );
}
