/*
 * In-app confirmation dialogs. Replaces window.confirm(), which some browsers,
 * preview windows and embedded views block — making buttons silently do nothing.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { TriangleAlert, Info } from 'lucide-react';

const Ctx = createContext(null);
export const useDialog = () => useContext(Ctx);

export function DialogProvider({ children }) {
  const [dlg, setDlg] = useState(null);
  const [text, setText] = useState('');
  const okRef = useRef(null);

  const confirm = useCallback(opts => new Promise(resolve => {
    setText('');
    setDlg({ confirmLabel: 'Confirm', cancelLabel: 'Cancel', ...opts, resolve });
  }), []);
  const close = useCallback(v => { setDlg(d => { d?.resolve(v); return null; }); }, []);

  useEffect(() => {
    if (!dlg) return undefined;
    if (!dlg.requireText) setTimeout(() => okRef.current?.focus(), 0);
    const h = e => { if (e.key === 'Escape') close(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [dlg, close]);

  const blocked = !!dlg?.requireText && text.trim() !== dlg.requireText;
  return (
    <Ctx.Provider value={{ confirm }}>
      {children}
      {dlg && (
        <div className="modal-scrim" onMouseDown={e => { if (e.target === e.currentTarget) close(false); }}>
          <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg">
            <div className={`modal-icon ${dlg.danger ? 'bad' : ''}`}>{dlg.danger ? <TriangleAlert size={22} /> : <Info size={22} />}</div>
            <h2 id="dlg-title">{dlg.title}</h2>
            {dlg.message && <p id="dlg-msg" className="muted">{dlg.message}</p>}
            {dlg.requireText && (
              <div className="field" style={{ marginTop: 14 }}>
                <label htmlFor="dlg-text">Type <b>{dlg.requireText}</b> to confirm</label>
                <input id="dlg-text" className="input" autoFocus value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !blocked) close(true); }} />
              </div>
            )}
            <div className="row end" style={{ marginTop: 20 }}>
              <button className="btn" onClick={() => close(false)}>{dlg.cancelLabel}</button>
              <button ref={okRef} className={`btn ${dlg.danger ? 'danger-solid' : 'primary'}`} disabled={blocked} onClick={() => close(true)}>{dlg.confirmLabel}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}
