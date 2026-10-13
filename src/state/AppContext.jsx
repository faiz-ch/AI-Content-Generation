import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LS, cleanTrendCache } from '../lib/storage.js';
import { arr, clone, str, uid, download, safeName } from '../lib/utils.js';
import { loadSettings, saveSettings, newProject, loadProjects, saveProjects } from '../lib/settings.js';
import { detectRelay, llmJSON, tavily, runtime } from '../lib/api.js';
import { builtinCards } from '../lib/genres.js';
import {
  buildQueries, trendCacheKey, collectResults, trendPrompt, normCards, mergeCards,
  masterPrompt, normMaster, ideasPrompt, storyPrompt, rewriteStoryPrompt, rewritePartPrompt, normStory, nClips,
  validateStory, clipsPrompt, regenClipPrompt, normClip, linkFrames
} from '../lib/prompts.js';

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

function initialProject() {
  const all = loadProjects();
  const cur = LS.get('fss_current', null);
  return all.find(p => p.id === cur) || all[0] || newProject();
}

export function AppProvider({ children }) {
  const [S, setS] = useState(loadSettings);
  const [P, setP] = useState(initialProject);
  const [projects, setProjects] = useState(loadProjects);
  const [busy, setBusy] = useState(null);
  const [toastState, setToastState] = useState(null);
  const [relay, setRelay] = useState(false);
  const [route, nav] = useHashRoute();
  const Sref = useRef(S); Sref.current = S;
  const Pref = useRef(P); Pref.current = P;
  const abortRef = useRef(null);
  const toastTimer = useRef(null);

  useEffect(() => { cleanTrendCache(); detectRelay().then(setRelay); }, []);
  useEffect(() => {
    const r = document.documentElement;
    if (S.theme === 'dark' || S.theme === 'light') r.setAttribute('data-theme', S.theme);
    else r.removeAttribute('data-theme');
  }, [S.theme]);

  /* ---------- persistence ---------- */
  const persist = useCallback(p => {
    const list = loadProjects();
    const rec = { ...p, updated: Date.now() };
    const i = list.findIndex(x => x.id === p.id);
    if (i >= 0) list[i] = rec; else list.unshift(rec);
    saveProjects(list); LS.set('fss_current', p.id); setProjects(list);
  }, []);
  useEffect(() => { const t = setTimeout(() => persist(P), 350); return () => clearTimeout(t); }, [P, persist]);

  const updateS = useCallback(fn => setS(prev => { const d = clone(prev); fn(d); saveSettings(d); return d; }), []);
  const updateP = useCallback(fn => setP(prev => { const d = clone(prev); fn(d); return d; }), []);

  const toast = useCallback((msg, isErr) => {
    setToastState({ msg, isErr, id: uid() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastState(null), isErr ? 8000 : 3500);
  }, []);

  const run = useCallback(async (msg, fn) => {
    const ac = new AbortController(); abortRef.current = ac;
    setBusy({ msg, t0: Date.now() });
    try { return await fn(ac.signal, m => setBusy(b => (b ? { ...b, msg: m } : b))); }
    catch (e) {
      if (e.name === 'AbortError') { toast('Cancelled'); return null; }
      console.error(e); toast(e.message || String(e), true); return null;
    } finally { setBusy(null); abortRef.current = null; }
  }, [toast]);
  const cancelBusy = useCallback(() => abortRef.current?.abort(), []);

  const ai = useCallback((user, signal) => llmJSON(Sref.current, user, signal, note => toast(note)), [toast]);
  const requireAI = useCallback(() => {
    if (Sref.current.aiOk) return true;
    toast('Connect and test your AI key in Settings first.'); nav('settings'); return false;
  }, [toast, nav]);

  /* ---------- setup ---------- */
  const testAI = useCallback(async silent => {
    const r = await run('Testing AI key…', async sig => { const j = await ai('Return exactly this JSON: {"ok": true}', sig); return !!j && j.ok === true; });
    updateS(s => { s.aiTested = true; s.aiOk = !!r; });
    if (!silent || !r) toast(r ? 'AI key works.' : 'AI key test failed — see the message above.', !r);
    return !!r;
  }, [run, ai, updateS, toast]);
  const testTavily = useCallback(async silent => {
    const r = await run('Testing Tavily key…', async sig => {
      const d = await tavily(Sref.current, 'AI video trends', sig, { max_results: 1, include_images: false, include_image_descriptions: false });
      return !!d && Array.isArray(d.results);
    });
    updateS(s => { s.tavilyOk = !!r; });
    if (!silent || !r) toast(r ? 'Tavily key works.' : 'Tavily test failed — trending search will use built-in genres.', !r);
    return !!r;
  }, [run, updateS, toast]);

  /* ---------- discover ---------- */
  const showBuiltin = useCallback(() => {
    updateP(p => { p.discover.cards = builtinCards(); p.discover.source = 'builtin'; });
  }, [updateP]);

  const runDiscover = useCallback(async ({ more = false, force = false, patch = null } = {}) => {
    let P0 = Pref.current;
    if (patch) { P0 = clone(P0); patch(P0); updateP(patch); }
    const S0 = Sref.current, d = P0.discover;
    if (d.mode === 'own' && !str(d.ownGenre)) { toast('Type your genre first, or switch to "All trends".'); return; }
    if (!str(S0.tavilyKey)) { showBuiltin(); toast('No Tavily key — showing built-in genres. Add a key in Settings for live trends.'); return; }
    if (!requireAI()) return;
    if (!d.pre.platforms.length) { toast('Select at least one platform.'); return; }
    const ck = trendCacheKey(P0);
    if (!more && !force) {
      const c = LS.get(ck, null);
      if (c && Date.now() - c.ts < 24 * 3600e3 && c.cards?.length) {
        updateP(p => { Object.assign(p.discover, { cards: c.cards, round: c.round || 0, source: 'search', searchedAt: c.ts }); });
        toast(`Loaded saved results from ${Math.max(1, Math.round((Date.now() - c.ts) / 3600e3))}h ago — no credits used. Use "Search again" for fresh results.`);
        return;
      }
    }
    const round = more ? (d.round || 0) + 1 : 0;
    const queries = buildQueries(P0, round);
    const res = await run(`Searching ${queries.length} sources…`, async (signal, setMsg) => {
      const settled = await Promise.allSettled(queries.map(q => tavily(S0, q.query, signal, { time_range: d.pre.recency })));
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const { results, images, failures, firstErr } = collectResults(queries, settled);
      if (!results.length) throw firstErr || new Error('Search returned no results. Try different filters.');
      setMsg(`Analysing ${results.length} results with AI…`);
      const j = await ai(trendPrompt(P0, results, images, more ? d.cards.map(c => c.name) : []), signal);
      return { cards: normCards(j, results, images), failures };
    });
    if (!res) return;
    const base = more ? clone(Pref.current.discover.cards) : [];
    const added = mergeCards(base, res.cards);
    const ts = Date.now();
    updateP(p => { Object.assign(p.discover, { cards: base, round, source: 'search', searchedAt: ts }); });
    LS.set(ck, { ts, round, cards: base });
    if (res.failures) toast(`${res.failures} search(es) failed; showing what was found.`);
    else if (more && !added) toast('No new trends found this round.');
    else if (!base.length) toast(d.mode === 'own' ? 'No trending results for that genre. You can still use it directly.' : 'No trends found. Try different filters or the built-in genres.');
  }, [toast, showBuiltin, requireAI, updateP, run, ai]);

  /* ---------- genre ---------- */
  const genMaster = useCallback(async card => {
    const j = await run('Building the master prompt for this genre…', s => ai(masterPrompt(card, Sref.current.clipSeconds), s));
    if (!j) return false;
    updateP(p => { if (p.genre && p.genre.id === card.id) p.genre.master = normMaster(j); });
    return true;
  }, [run, ai, updateP]);

  const selectCard = useCallback(async card => {
    const P0 = Pref.current;
    const changing = P0.genre && P0.genre.id !== card.id;
    if (changing && P0.story.data && !window.confirm('Choosing a different genre will clear this story and its prompts. Continue?')) return;
    updateP(p => {
      if (p.genre && p.genre.id !== card.id) { p.story.data = null; p.story.locked = false; p.story.ideas = []; p.clips = []; p.done = {}; }
      if (!p.genre || p.genre.id !== card.id) p.genre = clone(card);
    });
    nav('genre');
    const master = changing || !P0.genre ? card.master : P0.genre.master;
    if (!master && requireAI()) await genMaster(card);
  }, [updateP, nav, requireAI, genMaster]);

  /* ---------- story ---------- */
  const suggestIdeas = useCallback(async () => {
    if (!requireAI()) return;
    const j = await run('Thinking of story ideas…', s => ai(ideasPrompt(Pref.current, Sref.current), s));
    if (!j) return;
    const ideas = arr(j.ideas).map(i => ({ title: str(i.title), logline: str(i.logline) })).filter(i => i.title || i.logline).slice(0, 6);
    updateP(p => { p.story.ideas = ideas; });
  }, [requireAI, run, ai, updateP]);

  const writeStory = useCallback(async () => {
    if (!requireAI()) return;
    const P0 = Pref.current, n = nClips(P0, Sref.current);
    const j = await run('Writing your story…', s => ai(storyPrompt(P0, Sref.current), s));
    if (!j) return;
    const data = normStory(j, n, P0);
    updateP(p => {
      p.story.data = clone(data); p.clips = []; p.done = {};
      if (/^Untitled/.test(p.name)) p.name = data.title;
    });
    if (data.parts.length < n) toast(`The AI wrote ${data.parts.length} parts instead of ${n}. Add parts or write again.`);
  }, [requireAI, run, ai, updateP, toast]);

  const rewriteStory = useCallback(async ins => {
    if (!str(ins)) { toast('Type what you want to change first.'); return false; }
    if (!requireAI()) return false;
    const j = await run('Rewriting the story…', s => ai(rewriteStoryPrompt(Pref.current, Sref.current, ins), s));
    if (!j) return false;
    const data = normStory(j, null, Pref.current);
    updateP(p => { p.story.data = clone(data); p.clips = []; p.done = {}; });
    toast('Story updated.'); return true;
  }, [requireAI, run, ai, updateP, toast]);

  const rewritePart = useCallback(async (i, ins) => {
    if (!requireAI()) return false;
    const j = await run(`Rewriting part ${i + 1}…`, s => ai(rewritePartPrompt(Pref.current, Sref.current, i, str(ins)), s));
    if (!j) return false;
    updateP(p => {
      const part = p.story.data.parts[i];
      Object.assign(part, { title: str(j.title) || part.title, summary: str(j.summary) || part.summary,
        characters: arr(j.characters).map(str).filter(Boolean), location: str(j.location) || part.location });
      p.clips = []; p.done = {};
    });
    return true;
  }, [requireAI, run, ai, updateP]);

  /* ---------- clips ---------- */
  const generateClips = useCallback(async () => {
    if (!requireAI()) return false;
    const P0 = Pref.current, n = P0.story.data.parts.length;
    const j = await run(`Writing ${n} continuous clip prompts…`, s => ai(clipsPrompt(P0, Sref.current), s));
    if (!j) return false;
    let clips = arr(j.clips).map(normClip);
    if (!clips.length) { toast('The AI returned no clips. Try again.', true); return false; }
    clips = clips.slice(0, n); linkFrames(clips);
    updateP(p => { p.clips = clone(clips); p.done = {}; p.story.locked = true; });
    if (clips.length < n) toast(`Only ${clips.length} of ${n} clips were returned — use "Regenerate all" to try again.`, true);
    return true;
  }, [requireAI, run, ai, updateP, toast]);

  const finalize = useCallback(async () => {
    const errs = validateStory(Pref.current.story.data);
    if (errs.length) { toast(errs.slice(0, 3).join(' '), true); return; }
    if (await generateClips()) nav('prompts');
  }, [generateClips, nav, toast]);

  const regenClip = useCallback(async (i, ins) => {
    if (!requireAI()) return;
    const P0 = Pref.current;
    const j = await run(`Regenerating clip ${i + 1}…`, s => ai(regenClipPrompt(P0, Sref.current, i, str(ins)), s));
    if (!j) return;
    const c = normClip(j.clip || j, i);
    const oldEnd = P0.clips[i].end_frame, hasNext = !!P0.clips[i + 1];
    updateP(p => { p.clips[i] = clone(c); if (p.clips[i - 1]) p.clips[i].start_frame = p.clips[i - 1].end_frame; linkFrames(p.clips); });
    toast(hasNext && oldEnd !== c.end_frame ? `Clip ${i + 1} updated. Clip ${i + 2}'s opening frame was updated to match.` : `Clip ${i + 1} updated.`);
  }, [requireAI, run, ai, updateP, toast]);

  /* ---------- projects ---------- */
  const openProject = useCallback((id, to) => {
    persist(Pref.current);
    const p = loadProjects().find(x => x.id === id);
    if (!p) return;
    setP(p); LS.set('fss_current', p.id);
    if (to) nav(to);
  }, [persist, nav]);
  const createProject = useCallback(() => {
    persist(Pref.current);
    const p = newProject(); setP(p); persist(p); nav('trending');
  }, [persist, nav]);
  const deleteProject = useCallback(id => {
    const list = loadProjects().filter(x => x.id !== id);
    saveProjects(list); setProjects(list);
    if (id === Pref.current.id) { const p = list[0] || newProject(); setP(p); }
  }, []);
  const renameProject = useCallback((id, name) => {
    if (!str(name)) return;
    if (id === Pref.current.id) updateP(p => { p.name = str(name); });
    else { const list = loadProjects(); const p = list.find(x => x.id === id); if (p) { p.name = str(name); saveProjects(list); setProjects(list); } }
  }, [updateP]);
  const exportProject = useCallback(id => {
    const p = id === Pref.current.id ? Pref.current : loadProjects().find(x => x.id === id);
    if (p) download(safeName(p.name) + '.json', JSON.stringify(p, null, 2), 'application/json');
  }, []);
  const importProject = useCallback(async file => {
    try {
      const p = JSON.parse(await file.text());
      if (!p || !p.story || !p.discover) throw new Error('This file is not a Flow Story Studio project.');
      p.id = uid(); p.name = (p.name || 'Imported') + ' (imported)';
      persist(Pref.current); setP(p); persist(p); toast('Project imported.');
    } catch (e) { toast(e.message, true); }
  }, [persist, toast]);

  const value = useMemo(() => ({
    S, P, projects, route, nav, busy, toastState, relay, runtime,
    updateS, updateP, toast, run, cancelBusy, requireAI,
    testAI, testTavily, runDiscover, showBuiltin, selectCard, genMaster,
    suggestIdeas, writeStory, rewriteStory, rewritePart, finalize, generateClips, regenClip,
    openProject, createProject, deleteProject, renameProject, exportProject, importProject,
    dismissToast: () => setToastState(null)
  }), [S, P, projects, route, nav, busy, toastState, relay, updateS, updateP, toast, run, cancelBusy, requireAI,
    testAI, testTavily, runDiscover, showBuiltin, selectCard, genMaster, suggestIdeas, writeStory, rewriteStory, rewritePart,
    finalize, generateClips, regenClip, openProject, createProject, deleteProject, renameProject, exportProject, importProject]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
