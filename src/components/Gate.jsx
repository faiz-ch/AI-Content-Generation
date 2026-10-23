import { useEffect, useMemo, useRef, useState } from 'react';
import { Video, Lock, Plus, ArrowLeft, ShieldCheck, TriangleAlert, KeyRound, UserRound, LoaderCircle } from 'lucide-react';
import * as V from '../lib/vault.js';
import { useDialog } from '../state/Dialogs.jsx';
import { SecretInput } from './ui.jsx';

function initial(name) { return (String(name || '?').trim().charAt(0) || '?').toUpperCase(); }

function CreateForm({ first, hasLegacy, onCreate, onBack }) {
  const [name, setName] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [err, setErr] = useState('');
  const [working, setWorking] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (!name.trim()) return setErr('Enter your name.');
    if (pass.length < 6) return setErr('Use a passcode of at least 6 characters.');
    if (pass !== pass2) return setErr('The two passcodes do not match.');
    setErr(''); setWorking(true);
    try { await onCreate(name.trim(), pass); } catch (x) { setErr(x.message); setWorking(false); }
  };
  return (
    <form className="gate-card" onSubmit={submit}>
      {onBack && <button type="button" className="btn sm ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}><ArrowLeft size={14} /> Back</button>}
      <div className="gate-icon"><UserRound size={24} /></div>
      <h1>{first ? 'Create your private profile' : 'New profile'}</h1>
      <p className="muted">Your stories and API keys are encrypted with your passcode and stay in this browser. Anyone else using this computer creates their own profile and cannot see yours.</p>
      {hasLegacy && <div className="notice info"><ShieldCheck size={18} /><div>Stories and keys already saved in this browser will be moved into this profile and encrypted.</div></div>}
      <div className="field"><label htmlFor="g-name">Your name</label><input id="g-name" className="input" autoFocus value={name} onChange={e => setName(e.target.value)} maxLength={40} /></div>
      <div className="field"><label htmlFor="g-pass">Passcode</label><SecretInput id="g-pass" value={pass} onChange={e => setPass(e.target.value)} placeholder="At least 6 characters" /></div>
      <div className="field"><label htmlFor="g-pass2">Repeat passcode</label><SecretInput id="g-pass2" value={pass2} onChange={e => setPass2(e.target.value)} /></div>
      <div className="notice"><TriangleAlert size={18} /><div>A forgotten passcode cannot be recovered. Use <b>My Stories → Export</b> to keep backups.</div></div>
      {err && <div className="notice bad"><TriangleAlert size={18} /><div>{err}</div></div>}
      <button className="btn primary lg" type="submit" disabled={working}>{working ? <LoaderCircle size={18} className="spin-ic" /> : <ShieldCheck size={18} />} Create profile</button>
    </form>
  );
}

function UnlockForm({ profile, onUnlock, onBack, onForgot }) {
  const [pass, setPass] = useState('');
  const [err, setErr] = useState('');
  const [working, setWorking] = useState(false);
  const submit = async e => {
    e.preventDefault();
    if (!pass) return;
    setErr(''); setWorking(true);
    try { await onUnlock(profile, pass); }
    catch (x) { setErr(x.code === 'WRONG' ? 'Wrong passcode. Try again.' : x.message); setWorking(false); setPass(''); }
  };
  return (
    <form className="gate-card" onSubmit={submit}>
      <button type="button" className="btn sm ghost" onClick={onBack} style={{ alignSelf: 'flex-start' }}><ArrowLeft size={14} /> All profiles</button>
      <div className="gate-avatar">{initial(profile.name)}</div>
      <h1>{profile.name}</h1>
      <div className="field"><label htmlFor="u-pass">Passcode</label>
        <SecretInput id="u-pass" value={pass} onChange={e => setPass(e.target.value)} placeholder="Enter your passcode" autoFocus /></div>
      {err && <div className="notice bad"><TriangleAlert size={18} /><div>{err}</div></div>}
      <button className="btn primary lg" type="submit" disabled={working || !pass}>{working ? <LoaderCircle size={18} className="spin-ic" /> : <Lock size={18} />} Unlock</button>
      <button type="button" className="btn sm ghost" onClick={() => onForgot(profile)}>Forgot passcode?</button>
    </form>
  );
}

export default function Gate({ children }) {
  const { confirm } = useDialog();
  const [phase, setPhase] = useState('loading');
  const [profiles, setProfiles] = useState(() => V.listProfiles());
  const [picked, setPicked] = useState(null);
  const [active, setActive] = useState(null);
  const keyRef = useRef(null);
  const legacy = useRef(V.legacyData());

  const enter = async (profile, key, data) => {
    keyRef.current = key;
    V.updateProfileMeta(profile.id, { lastUsed: Date.now() });
    await V.rememberSession(profile.id, key);
    setActive({ profile, data });
    setPhase('app');
  };
  const openPlain = () => {
    V.choosePlain();
    setActive({ plain: true, profile: { id: 'plain', name: 'You' }, data: V.loadPlain() || legacy.current || {} });
    setPhase('app');
  };

  useEffect(() => {
    (async () => {
      if (!V.secureAvailable()) { if (V.plainChosen()) openPlain(); else setPhase('insecure'); return; }
      const r = await V.resumeSession();
      if (r) await enter(r.profile, r.key, r.data);
      else setPhase(V.listProfiles().length ? 'pick' : 'create');
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const backToGate = () => { setPicked(null); setProfiles(V.listProfiles()); setPhase(V.listProfiles().length ? 'pick' : 'create'); };

  const create = async (name, pass) => {
    const useLegacy = !V.listProfiles().length && legacy.current;
    const data = useLegacy ? legacy.current : {};
    const { profile, key } = await V.createProfile(name, pass, data);
    if (useLegacy) { V.clearLegacy(); legacy.current = null; }
    await enter(profile, key, data);
  };
  const unlock = async (profile, pass) => {
    const { key, data } = await V.unlockProfile(profile, pass);
    await enter(profile, key, data);
  };
  const forgot = async profile => {
    const ok = await confirm({
      title: 'Forgot your passcode?',
      message: `The passcode cannot be recovered, because your data is encrypted with it. The only option is to remove the profile “${profile.name}” and all its stories and keys from this browser.`,
      confirmLabel: 'Remove profile', danger: true, requireText: profile.name
    });
    if (!ok) return;
    V.deleteProfile(profile.id);
    backToGate();
  };

  const session = useMemo(() => {
    if (!active) return null;
    const pid = active.profile.id;
    return {
      plain: !!active.plain, profile: active.profile, data: active.data,
      save: active.plain ? d => V.savePlain(d) : d => V.saveVault(pid, keyRef.current, d),
      lock: () => { V.clearSession(); keyRef.current = null; setActive(null); backToGate(); },
      rename: name => { V.updateProfileMeta(pid, { name }); setActive(a => ({ ...a, profile: { ...a.profile, name } })); },
      changePasscode: async (oldPass, newPass, data) => {
        const prof = V.listProfiles().find(p => p.id === pid);
        await V.unlockProfile(prof, oldPass);
        const r = await V.changePasscode(prof, newPass, data);
        keyRef.current = r.key;
        await V.rememberSession(pid, r.key);
      },
      remove: () => { V.deleteProfile(pid); keyRef.current = null; setActive(null); backToGate(); }
    };
  }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  if (phase === 'app' && session) return children(session);

  return (
    <div className="gate">
      <div className="gate-brand"><span className="brand-mark"><Video size={18} /></span>Flow Story Studio</div>
      {phase === 'loading' && <div className="gate-card"><div className="spinner" /></div>}
      {phase === 'insecure' && (
        <div className="gate-card">
          <div className="gate-icon"><TriangleAlert size={24} /></div>
          <h1>Private profiles are not available here</h1>
          <p className="muted">Encryption needs a secure connection (an <b>https://</b> address or <b>localhost</b>). This page was opened over plain http, for example by its network IP address.</p>
          <p className="muted">Open it as <b>http://localhost:8080</b> on the computer running Docker, or through an https link, to use passcode-protected profiles.</p>
          <button className="btn" onClick={openPlain}>Continue without protection</button>
        </div>
      )}
      {phase === 'create' && <CreateForm first hasLegacy={!!legacy.current} onCreate={create} />}
      {phase === 'new' && <CreateForm onCreate={create} onBack={() => setPhase('pick')} />}
      {phase === 'pick' && !picked && (
        <div className="gate-card wide">
          <h1>Who’s creating?</h1>
          <p className="muted">Each profile’s stories and keys are private and encrypted.</p>
          <div className="profile-grid">
            {profiles.map(p => (
              <button key={p.id} className="profile-tile" onClick={() => setPicked(p)}>
                <span className="gate-avatar sm">{initial(p.name)}</span><b>{p.name}</b><span className="tiny muted"><Lock size={11} /> Locked</span>
              </button>
            ))}
            <button className="profile-tile add" onClick={() => setPhase('new')}>
              <span className="gate-avatar sm add"><Plus size={20} /></span><b>New profile</b><span className="tiny muted">For someone else</span>
            </button>
          </div>
        </div>
      )}
      {phase === 'pick' && picked && <UnlockForm profile={picked} onUnlock={unlock} onBack={() => setPicked(null)} onForgot={forgot} />}
      <p className="tiny muted gate-foot"><KeyRound size={12} /> Encrypted on this device with AES-256. Nothing is sent to any server.</p>
    </div>
  );
}
