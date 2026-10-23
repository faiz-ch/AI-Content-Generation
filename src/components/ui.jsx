import { useEffect, useState } from 'react';
import { Eye, EyeOff, Info, TriangleAlert, CircleCheck, X, Flame } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { getPath, hashStr } from '../lib/utils.js';

/** Binds an input to a path in the current story ("P", default) or in discovery ("D"). */
export function useBind(target = 'P') {
  const { P, D, updateP, updateD } = useApp();
  const src = target === 'D' ? D : P, upd = target === 'D' ? updateD : updateP;
  return (path, { num = false } = {}) => ({
    value: getPath(src, path) ?? '',
    onChange: e => {
      const v = e.target.type === 'checkbox' ? e.target.checked : num ? Number(e.target.value) : e.target.value;
      upd(o => {
        const ks = path.split('.'); let cur = o;
        for (let i = 0; i < ks.length - 1; i++) cur = cur[ks[i]];
        cur[ks[ks.length - 1]] = v;
      });
    }
  });
}

export function PageHead({ title, sub, children }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Notice({ kind = 'warn', children }) {
  const Icon = kind === 'info' ? Info : kind === 'ok' ? CircleCheck : TriangleAlert;
  return <div className={`notice ${kind === 'warn' ? '' : kind}`}><Icon size={18} /><div>{children}</div></div>;
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <div className="empty-icon"><Icon size={26} /></div>}
      {title && <b style={{ color: 'var(--ink)' }}>{title}</b>}
      {children}
    </div>
  );
}

export function SecretInput({ value, onChange, placeholder, id, autoFocus }) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input id={id} className="input" type={show ? 'text' : 'password'} autoComplete="off" spellCheck={false}
        value={value} onChange={onChange} placeholder={placeholder} autoFocus={autoFocus} />
      <button type="button" className="eye" onClick={() => setShow(s => !s)} aria-label={show ? 'Hide key' : 'Show key'}>
        {show ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}

export function StrengthBadge({ s }) {
  if (s === 'High') return <span className="badge ok"><Flame size={12} /> High</span>;
  if (s === 'Medium') return <span className="badge warn">Rising</span>;
  return <span className="badge accent">{s}</span>;
}

function Placeholder({ card }) {
  const hue = hashStr(card.name) % 360;
  return (
    <div className="ph" style={{ background: `linear-gradient(135deg, hsl(${hue} 80% 88%), hsl(${(hue + 60) % 360} 75% 80%))` }}>
      {card.emoji || '🎬'}
    </div>
  );
}
/** Card image with fallback to the next image, then to a soft placeholder. */
export function Thumb({ card, children }) {
  const [i, setI] = useState(0);
  useEffect(() => setI(0), [card.id]);
  const src = card.images?.[i];
  return (
    <div className="thumb">
      {src ? <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setI(x => x + 1)} /> : <Placeholder card={card} />}
      {children}
    </div>
  );
}

export function BusyOverlay() {
  const { busy, cancelBusy } = useApp();
  const [, tick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => tick(x => x + 1), 500);
    return () => clearInterval(t);
  }, [busy]);
  if (!busy) return null;
  return (
    <div className="busy" role="dialog" aria-modal="true" aria-live="polite">
      <div className="busy-box">
        <div className="spinner" />
        <b>{busy.msg}</b>
        {busy.detail && (
          <div className="busy-detail">
            {busy.detail.phase === 'thinking' && <span>Thinking{busy.detail.thought ? <>: <i>{busy.detail.thought}</i></> : '…'}</span>}
            {busy.detail.phase === 'writing' && <span>Writing the answer… {busy.detail.chars.toLocaleString()} characters received</span>}
            {busy.detail.phase === 'waiting' && <span>Waiting for the AI to start…</span>}
            {busy.detail.model && <span className="tiny muted">Model: {busy.detail.model}</span>}
          </div>
        )}
        <div className="small muted" style={{ margin: '4px 0 14px' }}>{Math.round((Date.now() - busy.t0) / 1000)}s</div>
        <button className="btn sm" onClick={cancelBusy}>Cancel</button>
      </div>
    </div>
  );
}

export function Toast() {
  const { toastState, dismissToast } = useApp();
  if (!toastState) return null;
  return (
    <div className={`toast ${toastState.isErr ? 'err' : ''}`} role="status" key={toastState.id}>
      <div style={{ flex: 1 }}>{toastState.msg}</div>
      <button onClick={dismissToast} aria-label="Dismiss"><X size={16} /></button>
    </div>
  );
}
