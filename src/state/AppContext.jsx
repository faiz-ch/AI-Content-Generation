import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { arr, clone, str, uid, download, safeName, sleep } from '../lib/utils.js';
import { DEFAULT_SETTINGS, newProject, newDiscover, isMeaningful } from '../lib/settings.js';
import { detectRelay, llmJSON, tavily, runtime } from '../lib/api.js';
import { builtinCards, customCard } from '../lib/genres.js';
import * as PR from '../lib/prompts.js';
import { useDialog } from './Dialogs.jsx';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const ROUTES = ['home', 'trending', 'genre', 'stories', 'story', 'prompts', 'settings'];
function useHashRoute() {
  const get = () => { const r = location.hash.replace(/^#\/?/, '').split('?')[0]; return ROUTES.includes(r) ? r : 'home'; };
  const [route, setRoute] = useState(get);
  useEffect(() => {
    const h = () => setRoute(get());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const nav = useCallback(to => {
    if (location.hash !== '#/' + to) location.hash = '/' + to; else setRoute(to);
    window.scrollTo({ top: 0 });
  }, []);
  return [route, nav];
}

const monthKey = () => new Date().toISOString().slice(0, 7);
/** Short, readable line from a Gemini thought summary (usually starts with a **bold heading**). */
function summarizeThought(t) {
  const s = String(t || '');
  const h = s.match(/\*\*(.+?)\*\*/);
  const line = (h ? h[1] : s.replace(/\s+/g, ' ')).trim();
  return line.length > 110 ? line.slice(0, 107) + '…' : line;
}
const BATCH = 6;

/** Turns saved data (any version) into app state. */
export function hydrate(data = {}) {
  const S = Object.assign(clone(DEFAULT_SETTINGS), data.settings || {});
  S.keys = { ...DEFAULT_SETTINGS.keys, ...(data.settings?.keys || {}) };
  S.models = { ...DEFAULT_SETTINGS.models, ...(data.settings?.models || {}) };
  delete S.storage; delete S.displayName;
  const raw = arr(data.projects);
  const legacyDiscover = (raw.find(p => p.id === data.currentId) || raw[0])?.discover;
  const base = newDiscover();
  const D = { ...base, ...(data.discover || legacyDiscover || {}) };
  D.pre = { ...base.pre, ...(D.pre || {}) };
  D.post = { ...base.post, ...(D.post || {}) };
  if (D.mode === 'own') { D.mode = 'describe'; D.description = D.description || D.ownGenre || ''; }
  delete D.ownGenre;
  const projects = raw.map(PR.upgradeProject).filter(isMeaningful);
  return { S, D, projects, currentId: data.currentId, trends: data.trends || {}, credits: data.credits || {} };
}

export function AppProvider({ session, children }) {
  const { confirm } = useDialog();
  const init = useMemo(() => hydrate(session.data), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [S, setS] = useState(init.S);
  const [D, setD] = useState(init.D);
  const [projects, setProjects] = useState(init.projects);
  const [P, setP] = useState(() => init.projects.find(p => p.id === init.currentId) || newProject());
  const [credits, setCredits] = useState(init.credits);
  const [busy, setBusy] = useState(null);
  const [toastState, setToastState] = useState(null);
  const [relay, setRelay] = useState(false);
  const [route, nav] = useHashRoute();
  const trends = useRef(init.trends);
  const Sref = useRef(S); Sref.current = S;
  const Dref = useRef(D); Dref.current = D;
  const Pref = useRef(P); Pref.current = P;
  const latest = useRef(); latest.current = { S, D, projects, P, credits };
  const abortRef = useRef(null);
  const busyRef = useRef(false); busyRef.current = !!busy;
  const toastTimer = useRef(null);
  const saveTimer = useRef(null);

  useEffect(() => { detectRelay().then(setRelay); }, []);
  useEffect(() => {
    const r = document.documentElement;
    if (S.theme === 'dark' || S.theme === 'light') r.setAttribute('data-theme', S.theme); else r.removeAttribute('data-theme');
  }, [S.theme]);

  const toast = useCallback((msg, isErr) => {
    setToastState({ msg, isErr, id: uid() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), isErr ? 9000 : 3800);
  }, []);

  /* ---------- saving (encrypted by the session) ---------- */
  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current); saveTimer.current = null;
    const { S, D, projects, P, credits } = latest.current;
    try { await session.save({ v: 2, settings: S, discover: D, projects, currentId: P.id, trends: trends.current, credits }); }
    catch (e) { toast(e.message, true); }
  }, [session, toast]);
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, 600);
  }, [flush]);
  useEffect(() => { scheduleSave(); }, [S, D, projects, P.id, credits, scheduleSave]);
  useEffect(() => {
    const h = () => { if (document.visibilityState === 'hidden' && saveTimer.current) flush(); };
    document.addEventListener('visibilitychange', h);
    window.addEventListener('pagehide', h);
    return () => { document.removeEventListener('visibilitychange', h); window.removeEventListener('pagehide', h); };
  }, [flush]);

  /* The current story is added to "My Stories" only once it has a genre. */
  useEffect(() => {
    if (!isMeaningful(P)) return;
    setProjects(list => {
      const i = list.findIndex(x => x.id === P.id);
      if (i >= 0) { if (list[i] === P) return list; const n = list.slice(); n[i] = P; return n; }
      return [P, ...list];
    });
  }, [P]);

  const updateS = useCallback(fn => setS(prev => { const d = clone(prev); fn(d); return d; }), []);
  const updateD = useCallback(fn => setD(prev => { const d = clone(prev); fn(d); return d; }), []);
  const updateP = useCallback(fn => setP(prev => { const d = clone(prev); fn(d); d.updated = Date.now(); return d; }), []);

  /* ---------- locking ---------- */
  const lock = useCallback(async () => { await flush(); session.lock(); }, [flush, session]);
  useEffect(() => {
    if (session.plain || !S.autoLock) return undefined;
    let last = Date.now();
    const bump = () => { last = Date.now(); };
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    evs.forEach(e => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => {
      if (busyRef.current) { last = Date.now(); return; }
      if (Date.now() - last > S.autoLock * 60000) lock();
    }, 15000);
    return () => { evs.forEach(e => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [S.autoLock, session.plain, lock]);

  /* ---------- long-running work ---------- */
  const run = useCallback(async (msg, fn) => {
    const ac = new AbortController(); abortRef.current = ac;
    const ctl = {
      signal: ac.signal, cur: msg, detail: null, last: 0,
      setMsg(m) { ctl.cur = m; setBusy(b => (b ? { ...b, msg: m } : b)); },
      note(m) { setBusy(b => (b ? { ...b, msg: m } : b)); },
      progress(p) {
        if (p.phase === 'start') ctl.detail = { model: p.model, phase: 'waiting' };
        else if (p.phase === 'thinking') ctl.detail = { ...ctl.detail, phase: 'thinking', thought: summarizeThought(p.thought) || ctl.detail?.thought };
        else if (p.phase === 'writing') ctl.detail = { ...ctl.detail, phase: 'writing', chars: p.chars };
        const now = Date.now();
        if (p.phase === 'start' || now - ctl.last > 250) { ctl.last = now; const d = { ...ctl.detail }; setBusy(b => (b ? { ...b, detail: d } : b)); }
      }
    };
    setBusy({ msg, t0: Date.now() });
    try { return await fn(ctl); }
    catch (e) {
      if (e.name === 'AbortError') { toast('Stopped. Anything already finished has been kept.'); return null; }
      console.error(e); toast(e.message || String(e), true); return null;
    } finally { setBusy(null); abortRef.current = null; }
  }, [toast]);
  const cancelBusy = useCallback(() => abortRef.current?.abort(), []);

  /** AI call with automatic waiting/retrying when the provider is rate-limited. */
  const ai = useCallback(async (user, ctl, opts = {}) => {
    const llmOpts = { thinking: opts.thinking || 'medium', onProgress: p => ctl.progress?.(p) };
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await llmJSON(Sref.current, user, ctl.signal, n => toast(n), llmOpts);
        if (attempt) ctl.note(ctl.cur);
        return r;
      } catch (e) {
        if (e.name === 'AbortError' || ![429, 500, 503].includes(e.status) || attempt >= 2) throw e;
        for (let s = attempt ? 40 : 20; s > 0; s--) {
          if (ctl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
          ctl.note(`The AI service is busy or rate-limited — retrying in ${s}s…`);
          await sleep(1000);
        }
      }
    }
  }, [toast]);
  const tv = useCallback(async (q, signal, extra) => {
    const d = await tavily(Sref.current, q, signal, extra);
    const n = Number(d?.usage?.credits) || 1, k = monthKey();
    setCredits(c => ({ ...c, [k]: (c[k] || 0) + n }));
    return d;
  }, []);
  const requireAI = useCallback(() => {
    if (Sref.current.aiOk) return true;
    toast('Connect and test your AI key in Settings first.'); nav('settings'); return false;
  }, [toast, nav]);

  /* ---------- settings ---------- */
  const testAI = useCallback(async silent => {
    const r = await run('Testing AI key…', async ctl => { const j = await ai('Return exactly this JSON: {"ok": true}', ctl, { thinking: 'low' }); return !!j && j.ok === true; });
    updateS(s => { s.aiTested = true; s.aiOk = !!r; });
    if (!silent || !r) toast(r ? 'AI key works.' : 'AI key test failed — see the message above.', !r);
    return !!r;
  }, [run, ai, updateS, toast]);
  const testTavily = useCallback(async silent => {
    const r = await run('Testing Tavily key…', async ctl => {
      const d = await tv('AI video trends', ctl.signal, { max_results: 1, include_images: false, include_image_descriptions: false });
      return !!d && Array.isArray(d.results);
    });
    updateS(s => { s.tavilyOk = !!r; });
    if (!silent || !r) toast(r ? 'Tavily key works.' : 'Tavily test failed — trending search will use built-in genres.', !r);
    return !!r;
  }, [run, tv, updateS, toast]);
  const forgetKeys = useCallback(async () => {
    if (!await confirm({ title: 'Forget all keys?', message: 'Your AI and Tavily keys will be removed from this profile. Stories are kept.', confirmLabel: 'Forget keys', danger: true })) return;
    updateS(s => { s.keys = clone(DEFAULT_SETTINGS.keys); s.tavilyKey = ''; s.aiOk = false; s.aiTested = false; s.tavilyOk = null; });
    toast('Keys removed.');
  }, [confirm, updateS, toast]);

  /* ---------- discover ---------- */
  const storeTrend = useCallback((k, v) => {
    const t = { ...trends.current, [k]: v };
    const keys = Object.keys(t).sort((a, b) => (t[b].ts || 0) - (t[a].ts || 0));
    keys.slice(6).forEach(x => delete t[x]);
    trends.current = t; scheduleSave();
  }, [scheduleSave]);

  const showBuiltin = useCallback(() => {
    updateD(d => { d.cards = builtinCards(); d.source = 'builtin'; d.plan = null; });
  }, [updateD]);

  const runDiscover = useCallback(async ({ more = false, force = false, patch = null } = {}) => {
    let D0 = Dref.current;
    if (patch) { D0 = clone(D0); patch(D0); setD(D0); }
    const S0 = Sref.current, describe = D0.mode === 'describe';
    if (describe && !str(D0.description)) { toast('Describe the kind of videos you want first.'); return; }
    if (!str(S0.tavilyKey)) { showBuiltin(); toast('No Tavily key — showing built-in genres. Add a key in Settings for live trends.'); return; }
    if (!requireAI()) return;
    if (!D0.pre.platforms.length) { toast('Select at least one platform.'); return; }
    const ck = PR.trendCacheKey(D0);
    if (!more && !force) {
      const c = trends.current[ck];
      if (c && Date.now() - c.ts < 24 * 3600e3 && c.cards?.length) {
        setD(d => ({ ...d, cards: c.cards, round: c.round || 0, source: 'search', searchedAt: c.ts, plan: c.plan || null, queriesUsed: c.queriesUsed || [] }));
        toast(`Loaded saved results from ${Math.max(1, Math.round((Date.now() - c.ts) / 3600e3))}h ago — no credits used. Use "Search again" for fresh results.`);
        return;
      }
    }
    const round = more ? (D0.round || 0) + 1 : 0;
    const res = await run(describe ? 'Reading your description and planning searches…' : 'Searching…', async ctl => {
      let plan = null, queries;
      if (describe) {
        plan = PR.normPlan(await ai(PR.searchPlanPrompt(D0, more ? D0.queriesUsed || [] : []), ctl), D0);
        queries = plan.queries;
      } else queries = PR.buildQueries(D0, round);
      ctl.setMsg(`Searching ${queries.length} sources…`);
      const settled = await Promise.allSettled(queries.map(q => tv(q.query, ctl.signal, { time_range: D0.pre.recency })));
      if (ctl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const { results, images, failures, firstErr } = PR.collectResults(queries, settled);
      if (!results.length) throw firstErr || new Error('Search returned no results. Try a different description or filters.');
      ctl.setMsg(`Analysing ${results.length} results with AI…`);
      const j = await ai(PR.trendPrompt(D0, plan, results, images, more ? D0.cards.map(c => c.name) : []), ctl);
      return { cards: PR.normCards(j, results, images), failures, plan, queries };
    });
    if (!res) return;
    const base = more ? clone(Dref.current.cards) : [];
    const added = PR.mergeCards(base, res.cards);
    const ts = Date.now();
    const used = [...(more ? D0.queriesUsed || [] : []), ...res.queries.map(q => q.query)];
    const plan = describe ? (res.plan ? { ...res.plan, queries: undefined } : D0.plan) : null;
    setD(d => ({ ...d, cards: base, round, source: 'search', searchedAt: ts, plan, queriesUsed: used }));
    storeTrend(ck, { ts, round, cards: base, plan, queriesUsed: used });
    if (res.failures) toast(`${res.failures} search(es) failed; showing what was found.`);
    else if (more && !added) toast('No new trends found this round.');
    else if (!base.length) toast('No trends found. Try a different description, or use your description directly as the genre.');
  }, [toast, showBuiltin, requireAI, run, ai, tv, storeTrend]);

  /* ---------- genre ---------- */
  const genMaster = useCallback(async card => {
    const j = await run('Building the master prompt for this genre…', ctl => ai(PR.masterPrompt(card, Sref.current.clipSeconds), ctl));
    if (!j) return false;
    updateP(p => { if (p.genre && p.genre.id === card.id) p.genre.master = PR.normMaster(j); });
    return true;
  }, [run, ai, updateP]);

  const selectCard = useCallback(async card => {
    const P0 = Pref.current;
    if (P0.genre && P0.genre.id === card.id) { nav('genre'); return; }
    if (P0.story.data) {
      const p = newProject(); p.genre = clone(card);
      setP(p);
      toast('Started a new story with this genre. Your previous story is kept in My Stories.');
    } else {
      updateP(p => { p.genre = clone(card); p.story.ideas = []; });
    }
    nav('genre');
    if (!card.master && Sref.current.aiOk) await genMaster(card);
    else if (!card.master) requireAI();
  }, [updateP, nav, toast, genMaster, requireAI]);

  const genreFromDescription = useCallback(async () => {
    const d = Dref.current, desc = str(d.description);
    if (!desc) { toast('Describe the kind of videos you want first.'); return; }
    const name = (d.plan && d.plan.forDescription === desc && d.plan.genre_name) || desc.split(/\s+/).slice(0, 6).join(' ');
    await selectCard(customCard(name, desc));
  }, [selectCard, toast]);

  const regenMaster = useCallback(async () => {
    const g = Pref.current.genre;
    if (!g) return;
    if (g.master && !await confirm({ title: 'Replace the genre master prompt?', message: 'A new master prompt will be generated and your edits to the current one will be replaced.', confirmLabel: 'Replace' })) return;
    if (!requireAI()) return;
    await genMaster(g);
  }, [confirm, requireAI, genMaster]);

  /* ---------- story ---------- */
  const suggestIdeas = useCallback(async () => {
    if (!requireAI()) return;
    const j = await run('Thinking of story ideas…', ctl => ai(PR.ideasPrompt(Pref.current, Sref.current), ctl));
    if (!j) return;
    const ideas = arr(j.ideas).map(i => ({ title: str(i.title), logline: str(i.logline) })).filter(i => i.title || i.logline).slice(0, 6);
    updateP(p => { p.story.ideas = ideas; });
  }, [requireAI, run, ai, updateP]);

  const developStory = useCallback(async (forced, keepStorylines) => {
    const P0 = Pref.current, S0 = Sref.current;
    const res = await run('Developing storylines…', async ctl => {
      let research = '';
      if (!forced && P0.story.settings.research !== false && str(S0.tavilyKey)) {
        ctl.setMsg('Researching similar stories on the web…');
        const settled = await Promise.allSettled(PR.storyResearchQueries(P0).map(q =>
          tv(q, ctl.signal, { max_results: 5, include_images: false, include_image_descriptions: false })));
        if (ctl.signal.aborted) throw new DOMException('Aborted', 'AbortError');
        research = PR.researchNotes(settled);
      }
      ctl.setMsg(forced ? 'Outlining your chosen storyline…' : 'Developing 3 storylines and choosing the strongest…');
      const o = PR.normOutline(await ai(PR.outlinePrompt(P0, S0, research, forced), ctl, { thinking: 'high' }), P0, S0);
      if (!o.characters.length || !o.locations.length) throw new Error('The AI returned an incomplete outline. Please try again.');
      ctl.setMsg(`Writing the full story — ${o.clip_count} parts, one per clip…`);
      const parts = PR.normParts(await ai(PR.partsPrompt(P0, S0, o), ctl), o);
      if (parts.length < 2) throw new Error('The AI returned an incomplete story. Please try again.');
      return { ...o, parts, clip_count: parts.length, researched: !!research };
    });
    if (!res) return false;
    if (keepStorylines) { res.storylines = keepStorylines.list; res.chosen = keepStorylines.chosen; res.choice_reason = 'Chosen by you.'; }
    updateP(p => {
      const oldTitle = p.story.data?.title;
      p.story.data = res; p.story.master = null; p.clips = []; p.done = {}; p.review = null;
      if (/^Untitled/.test(p.name) || p.name === oldTitle) p.name = res.title;
    });
    return true;
  }, [run, ai, tv, updateP]);

  const writeStory = useCallback(async () => {
    if (!requireAI()) return;
    if (Pref.current.story.data && !await confirm({ title: 'Write a new story?', message: 'Your current story and all edits to it will be replaced.', confirmLabel: 'Write new story' })) return;
    await developStory(null);
  }, [requireAI, confirm, developStory]);

  const chooseStoryline = useCallback(async i => {
    const st = Pref.current.story.data;
    if (!st?.storylines?.[i] || !requireAI()) return;
    if (!await confirm({ title: `Use “${st.storylines[i].title}” instead?`, message: 'The story will be rewritten from this storyline. Your current parts and edits will be replaced.', confirmLabel: 'Use this storyline' })) return;
    await developStory(st.storylines[i], { list: st.storylines, chosen: i });
  }, [requireAI, confirm, developStory]);

  const rewriteStory = useCallback(async ins => {
    if (!str(ins)) { toast('Type what you want to change first.'); return false; }
    if (!requireAI()) return false;
    const j = await run('Rewriting the story…', ctl => ai(PR.rewriteStoryPrompt(Pref.current, Sref.current, ins), ctl));
    if (!j) return false;
    let st;
    try { st = PR.normRewrite(j, Pref.current, Sref.current); } catch (e) { toast(e.message, true); return false; }
    updateP(p => { p.story.data = st; p.clips = []; p.done = {}; p.review = null; });
    toast('Story updated.'); return true;
  }, [requireAI, run, ai, updateP, toast]);

  const rewritePart = useCallback(async (i, ins) => {
    if (!requireAI()) return false;
    const j = await run(`Rewriting part ${i + 1}…`, ctl => ai(PR.rewritePartPrompt(Pref.current, Sref.current, i, str(ins)), ctl));
    if (!j) return false;
    updateP(p => {
      const st = p.story.data, part = st.parts[i];
      const [n] = PR.normParts({ parts: [{ ...part, ...j }] }, st);
      const tr = str(j.transition || part.transition).toLowerCase().startsWith('cont') ? 'continuous' : 'cut';
      if (n) Object.assign(part, { ...n, id: part.id, transition: i === 0 ? 'cut' : tr });
      p.clips = []; p.done = {}; p.review = null;
    });
    return true;
  }, [requireAI, run, ai, updateP]);

  /* ---------- clips: production design → batched shot plans → continuity review ---------- */
  const reviewAll = useCallback(async (P1, clips, ctl) => {
    const S0 = Sref.current, n = clips.length, fixes = [];
    let skipped = false;
    for (const [a, b] of PR.reviewWindows(n)) {
      ctl.setMsg(`Checking continuity: clips ${a + 1}–${b} of ${n}…`);
      try {
        const j = await ai(PR.reviewPrompt(P1, S0, clips, a, b), ctl, { thinking: 'high' });
        fixes.push(...PR.applyFixes(clips, j, a, b));
        PR.linkAndValidate(clips, P1, S0);
      } catch (e) { if (e.name === 'AbortError') throw e; skipped = true; }
    }
    return { fixes, skipped, at: Date.now() };
  }, [ai]);

  const genClips = useCallback(async (P1, ctl, from) => {
    const S0 = Sref.current, st = P1.story.data, n = st.parts.length;
    let clips = clone(P1.clips.slice(0, from));
    for (let a = from; a < n; a += BATCH) {
      const b = Math.min(n, a + BATCH);
      ctl.setMsg(`Planning clips ${a + 1}–${b} of ${n}: start frame, action and end frame of each shot…`);
      const got = PR.normBatch(await ai(PR.clipBatchPrompt(P1, S0, a, b, clips[a - 1]), ctl), P1, S0, a, b);
      if (got.length < b - a) throw new Error(`The AI returned ${got.length} of ${b - a} clips for clips ${a + 1}–${b}. Use "Continue" to try again.`);
      clips = clips.concat(got);
      PR.linkAndValidate(clips, P1, S0);
      const snap = clone(clips);
      setP(p => ({ ...p, clips: snap, updated: Date.now() }));
    }
    const review = await reviewAll(P1, clips, ctl);
    const snap = clone(clips);
    setP(p => ({ ...p, clips: snap, review, updated: Date.now() }));
    return true;
  }, [ai, reviewAll]);

  const finalize = useCallback(async () => {
    const errs = PR.validateStory(Pref.current.story.data);
    if (errs.length) { toast(errs.slice(0, 3).join(' '), true); return; }
    if (!requireAI()) return;
    const ok = await run('Designing characters, locations and style from your final story…', async ctl => {
      const P1 = clone(Pref.current);
      PR.applyDesign(P1, await ai(PR.designPrompt(P1, Sref.current), ctl));
      P1.story.locked = true; P1.clips = []; P1.done = {}; P1.review = null; P1.updated = Date.now();
      setP(P1);
      return genClips(P1, ctl, 0);
    });
    nav(ok ? 'prompts' : (Pref.current.story.locked ? 'prompts' : 'story'));
  }, [toast, requireAI, run, ai, genClips, nav]);

  const continueClips = useCallback(async () => {
    if (!requireAI()) return;
    const P0 = clone(Pref.current);
    await run('Continuing…', ctl => genClips(P0, ctl, P0.clips.length));
  }, [requireAI, run, genClips]);

  const regenerateAll = useCallback(async () => {
    if (!await confirm({ title: 'Regenerate all clip prompts?', message: 'Every clip will be planned again from the locked story. Your manual edits and "done" ticks will be lost.', confirmLabel: 'Regenerate all' })) return;
    if (!requireAI()) return;
    const P0 = { ...clone(Pref.current), clips: [] };
    setP(p => ({ ...p, clips: [], done: {}, review: null, updated: Date.now() }));
    await run('Regenerating…', ctl => genClips(P0, ctl, 0));
  }, [confirm, requireAI, run, genClips]);

  const checkContinuity = useCallback(async () => {
    if (!requireAI()) return;
    const P0 = clone(Pref.current), clips = P0.clips;
    const review = await run('Checking continuity…', ctl => reviewAll(P0, clips, ctl));
    if (!review) return;
    setP(p => ({ ...p, clips: clone(clips), review, updated: Date.now() }));
    toast(review.fixes.length ? `${review.fixes.length} continuity fix(es) applied.` : 'No continuity problems found.');
  }, [requireAI, run, reviewAll, toast]);

  const regenClip = useCallback(async (i, ins) => {
    if (!requireAI()) return;
    const P0 = Pref.current, S0 = Sref.current;
    const j = await run(`Regenerating clip ${i + 1}…`, ctl => ai(PR.regenClipPrompt(P0, S0, i, str(ins)), ctl));
    if (!j) return;
    const clips = clone(P0.clips);
    const c = PR.normClip(j.clip || j, i, S0.clipSeconds);
    c.transition = clips[i].transition;
    const oldEnd = JSON.stringify(clips[i].end_state);
    clips[i] = c;
    PR.linkAndValidate(clips, P0, S0);
    const next = clips[i + 1];
    const rippled = next && next.transition === 'continuous' && JSON.stringify(c.end_state) !== oldEnd;
    if (rippled) next.stale = true;
    setP(p => ({ ...p, clips, updated: Date.now() }));
    toast(rippled ? `Clip ${i + 1} updated. Clip ${i + 2} now opens on the new ending — check it still fits, or regenerate it.` : `Clip ${i + 1} updated.`);
  }, [requireAI, run, ai, toast]);

  const unlockStory = useCallback(async () => {
    if (!await confirm({ title: 'Unlock the story for editing?', message: 'The clip prompts will be cleared. When you finalize again, the characters, locations, style and master prompt are rebuilt from your edited story and new prompts are created.', confirmLabel: 'Unlock' })) return;
    updateP(p => { p.story.locked = false; p.clips = []; p.done = {}; p.review = null; });
  }, [confirm, updateP]);

  /* ---------- stories ---------- */
  const openProject = useCallback((id, to) => {
    const p = latest.current.projects.find(x => x.id === id);
    if (!p) return;
    setP(p);
    if (to) nav(to);
  }, [nav]);
  const createProject = useCallback(() => { setP(newProject()); nav('trending'); }, [nav]);
  const deleteProject = useCallback(async id => {
    const p = latest.current.projects.find(x => x.id === id);
    if (!p) return;
    if (!await confirm({ title: 'Delete this story?', message: `“${p.name}” will be permanently deleted from this profile.`, confirmLabel: 'Delete', danger: true })) return;
    const remaining = latest.current.projects.filter(x => x.id !== id);
    setProjects(remaining);
    if (id === Pref.current.id) setP(remaining[0] || newProject());
    toast('Story deleted.');
  }, [confirm, toast]);
  const renameProject = useCallback((id, name) => {
    const n = str(name);
    if (!n) return;
    if (id === Pref.current.id) updateP(p => { p.name = n; });
    else setProjects(list => list.map(x => (x.id === id ? { ...x, name: n, updated: Date.now() } : x)));
  }, [updateP]);
  const exportProject = useCallback(id => {
    const p = id === Pref.current.id ? Pref.current : latest.current.projects.find(x => x.id === id);
    if (p) download(safeName(p.name) + '.json', JSON.stringify(p, null, 2), 'application/json');
  }, []);
  const importProject = useCallback(async file => {
    try {
      const raw = JSON.parse(await file.text());
      if (!raw || !raw.story) throw new Error('This file is not a Flow Story Studio story.');
      const p = PR.upgradeProject({ ...raw, id: uid(), name: (raw.name || 'Imported') + ' (imported)', updated: Date.now() });
      if (!isMeaningful(p)) throw new Error('This story file has no genre or story to import.');
      setProjects(list => [p, ...list]);
      setP(p);
      toast('Story imported.');
    } catch (e) { toast(e.message, true); }
  }, [toast]);

  const creditsUsed = credits[monthKey()] || 0;
  const value = useMemo(() => ({
    S, D, P, projects, route, nav, busy, toastState, relay, runtime, creditsUsed,
    profile: session.profile, plain: !!session.plain, session,
    updateS, updateD, updateP, toast, run, cancelBusy, requireAI, confirm, lock, flush,
    testAI, testTavily, forgetKeys,
    runDiscover, showBuiltin, selectCard, genreFromDescription, genMaster, regenMaster,
    suggestIdeas, writeStory, chooseStoryline, rewriteStory, rewritePart, finalize, unlockStory,
    continueClips, regenerateAll, regenClip, checkContinuity,
    openProject, createProject, deleteProject, renameProject, exportProject, importProject,
    dismissToast: () => setToastState(null)
  }), [S, D, P, projects, route, nav, busy, toastState, relay, creditsUsed, session,
    updateS, updateD, updateP, toast, run, cancelBusy, requireAI, confirm, lock, flush,
    testAI, testTavily, forgetKeys, runDiscover, showBuiltin, selectCard, genreFromDescription, genMaster, regenMaster,
    suggestIdeas, writeStory, chooseStoryline, rewriteStory, rewritePart, finalize, unlockStory,
    continueClips, regenerateAll, regenClip, checkContinuity,
    openProject, createProject, deleteProject, renameProject, exportProject, importProject]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
