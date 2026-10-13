/* Prompt builders, response normalisers and the deterministic clip-prompt assembler. */
import { arr, str, uid, today, monthYear, endDot, fmtT, hashStr } from './utils.js';
import { ALL_PLATFORMS } from './settings.js';

/* ---------------- Discover ---------------- */
export function buildQueries(P, round) {
  const d = P.discover;
  const g = d.mode === 'own' ? str(d.ownGenre) : '';
  const aud = d.pre.audience !== 'Any' ? ` for ${d.pre.audience.toLowerCase()}` : '';
  const lang = d.pre.language !== 'Any' ? ` ${d.pre.language}` : '';
  const mods = [['trending', 'viral'], ['new', 'popular'], ['most viewed', 'fastest growing'], ['top', 'breakout']][round % 4];
  const subject = g ? `${g} AI video` : 'AI generated video';
  const platforms = d.pre.platforms.length ? d.pre.platforms : ALL_PLATFORMS;
  const qs = platforms.map(pl => ({ query: `${mods[0]} ${subject}${lang}${aud} ${pl} ${monthYear()}`, platform: pl }));
  qs.push({ query: `${mods[1]} ${subject} formats and trends${lang}${aud} ${monthYear()}`, platform: 'General' });
  return qs;
}
export const trendCacheKey = P => {
  const d = P.discover;
  return 'fss_trend_' + hashStr(JSON.stringify([d.mode, d.mode === 'own' ? str(d.ownGenre).toLowerCase() : '', d.pre]));
};

export function collectResults(queries, settled) {
  const results = [], images = [], seen = new Set();
  let failures = 0, firstErr = null;
  settled.forEach((s, qi) => {
    if (s.status !== 'fulfilled') { failures++; firstErr = firstErr || s.reason; return; }
    const data = s.value || {};
    const addImg = im => {
      const url = typeof im === 'string' ? im : im?.url; const desc = typeof im === 'string' ? '' : str(im?.description);
      if (!url || !/^https?:\/\//i.test(url) || seen.has(url) || images.length >= 45) return;
      seen.add(url); images.push({ url, desc });
    };
    arr(data.images).forEach(addImg);
    arr(data.results).slice(0, 6).forEach(r => {
      results.push({ platform: queries[qi].platform, title: str(r.title), url: str(r.url), content: str(r.content).slice(0, 380) });
      arr(r.images).slice(0, 2).forEach(addImg);
    });
  });
  return { results, images, failures, firstErr };
}

export function trendPrompt(P, results, images, existing) {
  const d = P.discover, g = d.mode === 'own' ? str(d.ownGenre) : '';
  return `Today is ${today()}. Task: identify trending AI-generated short-video genres and formats from the web search results below${g ? `, limited to the user's genre "${g}" — return the trending sub-styles and formats WITHIN that genre` : ''}.
Filters requested: platforms=${d.pre.platforms.join(', ')}; audience=${d.pre.audience}; content language=${d.pre.language}.
${existing.length ? `Already shown — do NOT repeat or rename these: ${existing.join('; ')}` : ''}
Instructions:
- Return every distinct trend the results support (usually 6–20). Merge duplicates that describe the same format under different names into one card listing all its platforms.
- Include only formats that can realistically be produced as a sequence of short AI video clips.
- strength: "High" if several sources or platforms mention it, otherwise "Medium". Never invent view counts or statistics.
- image_ids: up to 3 numbers from the IMAGES list that visually match the card; empty array if none fit.
- source_ids: numbers from the RESULTS list that support the card.
JSON schema: {"cards":[{"name":"short genre name","description":"max 2 sentences","platforms":["TikTok","YouTube Shorts","Instagram Reels","Facebook Reels","General"],"strength":"High or Medium","audience":"Kids, Teens, Adults or All","language":"content language or Any","why_trending":"1-2 sentences","example_concepts":["3 short example video ideas"],"visual_style":"typical look","image_ids":[0],"source_ids":[0]}]}

RESULTS:
${results.map((r, i) => `[R${i}] (${r.platform}) ${r.title} — ${r.content} <${r.url}>`).join('\n')}

IMAGES:
${images.map((im, i) => `[I${i}] ${im.desc || '(no description)'}`).join('\n') || '(none)'}`;
}

const idx = v => parseInt(String(v).replace(/\D/g, ''), 10);
export function normCards(j, results, images) {
  return arr(j.cards).map(c => ({
    id: uid(), name: str(c.name).slice(0, 80) || 'Untitled trend', description: str(c.description),
    platforms: arr(c.platforms).map(str).filter(Boolean), strength: str(c.strength) === 'High' ? 'High' : 'Medium',
    audience: ['Kids', 'Teens', 'Adults', 'All'].includes(str(c.audience)) ? str(c.audience) : 'All',
    language: str(c.language) || 'Any', why: str(c.why_trending), examples: arr(c.example_concepts).map(str).filter(Boolean).slice(0, 5),
    visualStyle: str(c.visual_style),
    images: arr(c.image_ids).map(i => images[idx(i)]?.url).filter(Boolean),
    sources: arr(c.source_ids).map(i => results[idx(i)]).filter(Boolean).map(r => ({ title: r.title, url: r.url })),
    master: null, origin: 'search'
  }));
}

const STOP = new Set(['ai', 'video', 'videos', 'the', 'a', 'an', 'of', 'and', 'style', 'generated', 'trend', 'format', 'content']);
const singular = w => (w.length > 3 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
export const normName = n => [...new Set(str(n).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).map(singular).filter(w => w && !STOP.has(w)))].sort().join(' ');
/** Merges incoming cards into existing (mutates existing). Returns number of new cards. */
export function mergeCards(existing, incoming) {
  const map = new Map(existing.map(c => [normName(c.name), c]));
  let added = 0;
  for (const c of incoming) {
    const k = normName(c.name);
    if (!k) continue;
    if (map.has(k)) {
      const e = map.get(k);
      e.platforms = [...new Set([...e.platforms, ...c.platforms])];
      e.images = [...new Set([...e.images, ...c.images])];
      e.sources = [...e.sources, ...c.sources.filter(s => !e.sources.some(x => x.url === s.url))];
      if (c.strength === 'High') e.strength = 'High';
    } else { map.set(k, c); existing.push(c); added++; }
  }
  return added;
}
export function filterCards(P) {
  const d = P.discover, f = d.post, q = str(f.q).toLowerCase();
  const order = { High: 0, Medium: 1, Evergreen: 2, Custom: 3 };
  return d.cards.filter(c =>
    (f.platform === 'All' || c.platforms.includes(f.platform)) &&
    (f.audience === 'All' || c.audience === f.audience || c.audience === 'All') &&
    (f.strength === 'All' || c.strength === f.strength) &&
    (!q || (c.name + ' ' + c.description + ' ' + (c.examples || []).join(' ')).toLowerCase().includes(q))
  ).sort((a, b) => (order[a.strength] ?? 9) - (order[b.strength] ?? 9));
}

/* ---------------- Master prompt ---------------- */
export const MASTER_FIELDS = [
  ['style', 'Art style & rendering'], ['look', 'Genre look / signature'], ['camera', 'Camera'], ['lighting', 'Lighting'],
  ['pacing', 'Pacing per clip'], ['audio', 'Audio & voice'], ['character_rules', 'Character design rules'],
  ['hook', 'Opening hook (clip 1)'], ['avoid', 'Avoid']];
export const masterText = m => MASTER_FIELDS.map(([k, l]) => `${l}: ${str(m?.[k])}`).join('\n');
export function masterPrompt(g, sec) {
  return `Create a reusable MASTER PROMPT style guide for the AI video genre below. It will be combined with a specific story to write one prompt per ${sec}-second clip for Google Flow.
Genre: ${g.name}
Description: ${g.description}
Why it is trending: ${g.why || 'n/a'}
Typical visual style: ${g.visualStyle || 'n/a'}
Example concepts: ${(g.examples || []).join(' | ') || 'n/a'}
Audience: ${g.audience}
Be concrete and visual; each field max 40 words.
JSON: {"style":"overall art style & rendering","look":"recurring visual signature of the genre","camera":"shot sizes and simple camera moves that suit it","lighting":"lighting approach","pacing":"how much happens in one ${sec}-second clip","audio":"music mood, sound design, voice style","character_rules":"how characters should be designed","hook":"how the first 2 seconds of clip 1 grab attention","avoid":"comma-separated artefacts, clichés and policy risks to avoid"}`;
}
export const normMaster = j => Object.fromEntries(MASTER_FIELDS.map(([k]) => [k, str(j?.[k])]));

/* ---------------- Story ---------------- */
export const nClips = (P, S) => Math.max(1, Math.round(P.story.settings.totalSeconds / S.clipSeconds));
export const wordLimit = S => Math.round(S.clipSeconds * 2.3);
export const spokenLang = P => { const s = P.story.settings; return s.language === 'Other' ? (str(s.languageOther) || 'English') : s.language; };
export function speechDesc(P) {
  const s = P.story.settings, lang = spokenLang(P);
  if (s.dialogue === 'none') return 'no speech — music and sound effects only';
  if (s.dialogue === 'narration') return `narrator voice-over only, in ${lang}`;
  return `characters speak short dialogue lines, in ${lang}`;
}
function storyContext(P, S) {
  const s = P.story.settings, n = nClips(P, S);
  return `Genre: ${P.genre.name} — ${P.genre.description}
Master prompt (style guide):
${masterText(P.genre.master)}
Video plan: ${n} clips × ${S.clipSeconds} s = ${n * S.clipSeconds} s. Aspect ratio ${s.aspect}. Audience: ${P.genre.audience}. Speech: ${speechDesc(P)}.`;
}
const STORY_SCHEMA = n => `{"title":"","logline":"one sentence","tone":"","characters":[{"id":"c1","name":"","role":"","appearance":"","wardrobe":"","voice":""}],"locations":[{"id":"l1","name":"","description":""}],"style_lock":{"art_style":"","lighting":"","color_palette":"","time_of_day":"","camera_language":""},"parts":[{"title":"","summary":"2-3 sentences: what happens in this moment","characters":["c1"],"location":"l1"}]} — exactly ${n} parts.`;
const STORY_RULES = (n, sec) => `Rules:
- Exactly ${n} parts. Each part is ONE continuous ${sec}-second moment that can be filmed as a single shot with one main action.
- Part 1 opens with a strong hook; the last part delivers a satisfying payoff or ending; parts flow directly into each other.
- At most 3 characters and at most 3 locations, so the separately generated clips stay consistent.
- Character "appearance" (25–45 words): species if not human, age, skin tone, face shape, eye colour, hair style and colour, height/build, one distinctive feature.
- "wardrobe" (15–30 words): exact garments with colours and materials. Same outfit for the whole video unless the story truly requires a change.
- "voice": short voice description, e.g. "warm elderly male voice".
- Location "description" (25–45 words): precise and visual, with fixed landmarks and props.
- style_lock: one fixed art style, lighting, colour palette, time of day and camera language for the whole video.
- Parts reference characters and locations by id. No on-screen text is needed to understand the story.`;

export function ideasPrompt(P, S) {
  const draft = str(P.story.idea);
  return `${storyContext(P, S)}
Suggest 5 original, scroll-stopping story ideas for this genre that work in ${nClips(P, S)} clips, with at most 3 characters and 3 locations.
${draft ? `Build on the user's rough idea: "${draft}" — give 5 different directions.` : ''}
JSON: {"ideas":[{"title":"","logline":"1-2 sentences"}]}`;
}
export function storyPrompt(P, S) {
  const n = nClips(P, S);
  return `${storyContext(P, S)}
User idea: "${str(P.story.idea) || 'none — invent the strongest idea for this genre'}"
Write the story.
${STORY_RULES(n, S.clipSeconds)}
JSON: ${STORY_SCHEMA(n)}`;
}
export function rewriteStoryPrompt(P, S, ins) {
  const n = P.story.data.parts.length;
  return `${storyContext(P, S)}
Current story JSON:
${JSON.stringify(P.story.data)}
Change request from the user: "${ins}"
Rewrite the story applying the change request. Keep the same ids for unchanged characters and locations. Keep ${n} parts unless the request requires a different number.
${STORY_RULES(n, S.clipSeconds)}
JSON: ${STORY_SCHEMA(n)}`;
}
export function rewritePartPrompt(P, S, i, ins) {
  const st = P.story.data;
  return `${storyContext(P, S)}
Full story JSON:
${JSON.stringify(st)}
Rewrite ONLY part ${i + 1} ("${st.parts[i].title}"). ${ins ? `User request: "${ins}".` : 'Make it stronger and more visual.'}
It must still follow on from part ${i} and lead naturally into part ${i + 2} (if they exist), fit one ${S.clipSeconds}-second shot with one main action, and use existing character/location ids.
JSON: {"title":"","summary":"2-3 sentences","characters":["c1"],"location":"l1"}`;
}
export function normStory(j, n, P) {
  const chars = arr(j.characters).slice(0, 4).map((c, i) => ({ id: str(c.id) || 'c' + (i + 1), name: str(c.name) || 'Character ' + (i + 1), role: str(c.role), appearance: str(c.appearance), wardrobe: str(c.wardrobe), voice: str(c.voice) }));
  const locs = arr(j.locations).slice(0, 4).map((l, i) => ({ id: str(l.id) || 'l' + (i + 1), name: str(l.name) || 'Location ' + (i + 1), description: str(l.description) }));
  const sl = j.style_lock || {};
  let parts = arr(j.parts).map(p => ({ id: uid(), title: str(p.title), summary: str(p.summary), characters: arr(p.characters).map(str).filter(Boolean), location: str(p.location) }));
  if (n && parts.length > n) parts = parts.slice(0, n);
  return { title: str(j.title) || 'Untitled story', logline: str(j.logline), tone: str(j.tone), characters: chars, locations: locs,
    style_lock: { art_style: str(sl.art_style) || str(P.genre?.master?.style), lighting: str(sl.lighting), color_palette: str(sl.color_palette), time_of_day: str(sl.time_of_day), camera_language: str(sl.camera_language) },
    parts };
}
export function validateStory(st) {
  const errs = [];
  if (!st.parts.length) errs.push('Add at least one story part.');
  st.parts.forEach((p, i) => { if (!str(p.summary)) errs.push(`Part ${i + 1} is empty.`); });
  st.characters.forEach(c => { if (!str(c.appearance)) errs.push(`${c.name}: appearance is empty.`); });
  st.locations.forEach(l => { if (!str(l.description)) errs.push(`${l.name}: description is empty.`); });
  return errs;
}

/* ---------------- Clips ---------------- */
const CLIP_SCHEMA = `{"part":1,"characters_present":["c1"],"location_id":"l1","start_frame":"","action":"","camera":"","end_frame":"","dialogue":[{"speaker":"c1 or narrator","line":"","delivery":"e.g. whispering"}],"sound":""}`;
function clipRules(P, S) {
  const none = P.story.settings.dialogue === 'none';
  return `Continuity rules (critical — each clip is generated separately, possibly in a different account, so nothing carries over except the prompt text):
- Do NOT repeat character appearance/wardrobe or location descriptions; the tool inserts them itself. Refer to characters only by id.
- The tool uses each clip's "end_frame" as the next clip's opening, so every "end_frame" must be a calm, stable, fully described composition: who is where, pose, facing direction, shot size (e.g. medium shot) and camera angle.
- One main action per clip that fits in ${S.clipSeconds} seconds. Camera: at most one simple move (static, slow push-in, slow pan, tracking).
- Dialogue: ${none ? 'none — always return an empty array.' : `at most ${wordLimit(S)} words in total per clip. speaker = character id or "narrator". Write the lines in ${spokenLang(P)}.`}
- "sound": ambience and music mood, consistent with neighbouring clips.`;
}
export function clipsPrompt(P, S) {
  const st = P.story.data, n = st.parts.length;
  return `${storyContext(P, S)}
Locked story JSON:
${JSON.stringify(st)}
Convert the story into exactly ${n} clip specifications, one per part, in order, for Google Flow (${S.clipSeconds}-second clips).
${clipRules(P, S)}
Clip 1 "start_frame" describes the opening composition and applies the genre hook.
JSON: {"clips":[${CLIP_SCHEMA}]}`;
}
export function regenClipPrompt(P, S, i, ins) {
  const st = P.story.data, prev = P.clips[i - 1], next = P.clips[i + 1];
  return `${storyContext(P, S)}
Locked story JSON:
${JSON.stringify(st)}
Rewrite clip ${i + 1} of ${P.clips.length} (story part ${i + 1}: "${st.parts[i]?.summary || ''}").
Current clip: ${JSON.stringify(P.clips[i])}
${prev ? `It MUST start exactly from the previous clip's end frame: "${prev.end_frame}".` : 'It is the opening clip: apply the genre hook.'}
${next ? `Its end_frame should lead naturally into the next clip, whose action is: "${next.action}".` : 'It is the final clip: end on a satisfying, steady closing frame.'}
${ins ? `User request: "${ins}"` : 'Make it more vivid and cinematic while keeping continuity.'}
${clipRules(P, S)}
JSON: {"clip":${CLIP_SCHEMA}}`;
}
export function normClip(c, i) {
  return { part: i + 1, characters_present: arr(c.characters_present).map(str).filter(Boolean), location_id: str(c.location_id),
    start_frame: str(c.start_frame), action: str(c.action), camera: str(c.camera), end_frame: str(c.end_frame),
    dialogue: arr(c.dialogue).map(d => ({ speaker: str(d.speaker) || 'narrator', line: str(d.line), delivery: str(d.delivery) })).filter(d => d.line),
    sound: str(c.sound), custom: null };
}
/** Each clip opens on the previous clip's ending frame (mutates). */
export function linkFrames(clips) { for (let i = 1; i < clips.length; i++) clips[i].start_frame = clips[i - 1].end_frame; }

const charById = (st, id) => st.characters.find(c => c.id === id);
/** Deterministic assembly: locked text is inserted word-for-word. */
export function buildPrompt(P, S, clip, i) {
  if (clip.custom != null) return clip.custom;
  const st = P.story.data, set = P.story.settings, m = P.genre?.master || {}, sl = st.style_lock || {};
  const loc = st.locations.find(l => l.id === clip.location_id) || st.locations.find(l => l.id === st.parts[i]?.location) || st.locations[0];
  let ids = clip.characters_present.length ? clip.characters_present : (st.parts[i]?.characters || []);
  clip.dialogue.forEach(d => { if (d.speaker !== 'narrator' && !ids.includes(d.speaker) && charById(st, d.speaker)) ids = [...ids, d.speaker]; });
  const chars = ids.map(id => charById(st, id)).filter(Boolean);
  const orient = { '9:16': 'Vertical 9:16 video', '16:9': 'Widescreen 16:9 video', '1:1': 'Square 1:1 video' }[set.aspect] || 'Video';
  const L = [];
  L.push(`${orient}, one continuous ${S.clipSeconds}-second shot. Style: ${sl.art_style || m.style}.`);
  if (loc) L.push(`Setting: ${loc.name} — ${loc.description}`);
  const env = [sl.time_of_day && `Time of day: ${sl.time_of_day}.`, sl.lighting && `Lighting: ${sl.lighting}.`, sl.color_palette && `Colour palette: ${sl.color_palette}.`].filter(Boolean).join(' ');
  if (env) L.push(env);
  if (chars.length) {
    L.push('Characters (identical appearance in every clip):');
    chars.forEach(c => L.push(`- ${c.name}: ${endDot(c.appearance)} Wearing: ${endDot(c.wardrobe)}`));
  }
  L.push(`Opening frame: ${clip.start_frame}`);
  L.push(`Action: ${clip.action}`);
  L.push(`Camera: ${clip.camera || sl.camera_language}`);
  L.push(`Ending frame: ${clip.end_frame}`);
  if (clip.dialogue.length && set.dialogue !== 'none') {
    L.push(`Audio — spoken in ${spokenLang(P)}:`);
    clip.dialogue.forEach(d => {
      if (d.speaker === 'narrator') L.push(`- Narrator (voice-over${d.delivery ? ', ' + d.delivery : ''}): "${d.line}"`);
      else { const c = charById(st, d.speaker); L.push(`- ${c ? c.name : d.speaker} (${[c?.voice, d.delivery].filter(Boolean).join(', ') || 'speaking'}) says: "${d.line}"`); }
    });
  } else L.push('No speech.');
  if (clip.sound) L.push(`Sound: ${clip.sound}`);
  if (m.look) L.push(`Genre look: ${m.look}`);
  L.push('Continuity: keep every character’s face, hairstyle, body and outfit exactly as described; same environment, lighting and colour grade; no text, captions, subtitles, logos or watermarks; no cuts or transitions inside the clip; smooth natural motion; finish on a steady, held frame.');
  if (m.avoid) L.push(`Avoid: ${m.avoid}`);
  return L.filter(Boolean).join('\n');
}
export function refPrompt(P, c) {
  return `Character reference sheet, ${endDot(P.story.data.style_lock.art_style)} ${c.name}: ${endDot(c.appearance)} Wearing: ${endDot(c.wardrobe)} Full body, front view, neutral expression, plain light-grey background, even soft lighting, no text.`;
}
export function allPromptsText(P, S) {
  const st = P.story.data;
  const head = [st.title, st.logline, `Genre: ${P.genre.name} · ${P.clips.length} clips × ${S.clipSeconds}s · ${P.story.settings.aspect}`, '',
    'CHARACTER REFERENCE PROMPTS (optional, for image reference features):', ...st.characters.map(c => `- ${refPrompt(P, c)}`), ''];
  return head.concat(P.clips.flatMap((c, i) => [`=== CLIP ${i + 1} of ${P.clips.length} (${fmtT(i * S.clipSeconds)}–${fmtT((i + 1) * S.clipSeconds)}) ===`, buildPrompt(P, S, c, i), ''])).join('\n');
}
