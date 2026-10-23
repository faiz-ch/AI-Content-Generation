/*
 * Prompt builders, response normalisers, the continuity engine and the
 * deterministic clip-prompt assembler.
 *
 * Continuity model
 *  - Every clip has a structured START frame, timed BEATS and an END frame.
 *  - "continuous" clips: the code copies the previous END frame into START
 *    (same place, time, weather, positions, held objects) — the AI cannot drift.
 *  - "cut" clips: a new scene with its own establishing START frame.
 *  - Locked character / outfit / location text is inserted word-for-word by code.
 *  - Code checks + an AI continuity review catch the remaining contradictions.
 */
import { arr, str, uid, today, monthYear, endDot, fmtDur, hashStr } from './utils.js';
import { ALL_PLATFORMS, newProject } from './settings.js';

const idx = v => parseInt(String(v).replace(/\D/g, ''), 10);

/* =================================================================
   DISCOVER
   ================================================================= */
export function buildQueries(D, round, subject) {
  const aud = D.pre.audience !== 'Any' ? ` for ${D.pre.audience.toLowerCase()}` : '';
  const lang = D.pre.language !== 'Any' ? ` ${D.pre.language}` : '';
  const mods = [['trending', 'viral'], ['new', 'popular'], ['most viewed', 'fastest growing'], ['top', 'breakout']][round % 4];
  const subj = subject ? `${subject} AI video` : 'AI generated video';
  const platforms = D.pre.platforms.length ? D.pre.platforms : ALL_PLATFORMS;
  const qs = platforms.map(pl => ({ query: `${mods[0]} ${subj}${lang}${aud} ${pl} ${monthYear()}`, platform: pl }));
  qs.push({ query: `${mods[1]} ${subj} formats and trends${lang}${aud} ${monthYear()}`, platform: 'General' });
  return qs;
}
export const trendCacheKey = D =>
  'trend_' + hashStr(JSON.stringify([D.mode, D.mode === 'describe' ? str(D.description).toLowerCase() : '', D.pre]));

export function searchPlanPrompt(D, already = []) {
  return `Today is ${today()}. A creator described, in their own words, the kind of AI-generated videos they want to make:
"""${str(D.description)}"""
Platforms they care about: ${D.pre.platforms.join(', ') || 'all'}. Audience filter: ${D.pre.audience}. Content language filter: ${D.pre.language}. Time window: last ${D.pre.recency}.
${already.length ? `These searches were already run — plan NEW angles, do not repeat them:\n${already.map(q => '- ' + q).join('\n')}\n` : ''}
Task: understand exactly what kind of content they mean (genre, tone, audience, culture, language, visual style), then plan web searches that will reveal what is trending RIGHT NOW for that kind of content — popular formats, story angles, hooks, series ideas and visual styles.
Rules:
- 4 to 7 queries, each a natural web-search phrase (not an instruction to an AI), specific to the described content. Add "${monthYear()}" or "${new Date().getFullYear()}" where it helps freshness.
- Cover every selected platform at least once, plus one general query about AI video trends for this content.
- If the description implies a culture or language (e.g. Pakistani, Urdu, Hindi, Arabic), include that in some queries.
JSON: {"understood":"2-3 sentences restating what they want, in plain English","genre_name":"short name for this genre (max 6 words)","keywords":["..."],"audience":"Kids, Teens, Adults or All","language":"content language or Any","queries":[{"query":"...","platform":"TikTok, YouTube Shorts, Instagram Reels, Facebook Reels or General"}]}`;
}
export function normPlan(j, D) {
  const plan = {
    forDescription: str(D.description),
    understood: str(j.understood), genre_name: str(j.genre_name).slice(0, 60),
    keywords: arr(j.keywords).map(str).filter(Boolean).slice(0, 10),
    audience: str(j.audience) || 'All', language: str(j.language) || 'Any',
    queries: arr(j.queries).map(q => ({ query: str(typeof q === 'string' ? q : q.query), platform: str(q?.platform) || 'General' }))
      .filter(q => q.query).slice(0, 8)
  };
  if (!plan.queries.length) plan.queries = buildQueries(D, 0, plan.genre_name || str(D.description).split(/\s+/).slice(0, 8).join(' '));
  return plan;
}

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

export function trendPrompt(D, plan, results, images, existing) {
  const desc = D.mode === 'describe' && plan
    ? `The creator described what they want: """${str(D.description)}"""
Interpreted as: ${plan.understood}
Every card MUST be a trending format, sub-genre or story angle that fits this description.\n` : '';
  return `Today is ${today()}. Task: identify trending AI-generated short-video genres and formats from the web search results below.
${desc}Filters requested: platforms=${D.pre.platforms.join(', ')}; audience=${D.pre.audience}; content language=${D.pre.language}.
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
/** Merges incoming cards into existing (mutates existing). Returns the number of new cards. */
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
export function filterCards(D) {
  const f = D.post, q = str(f.q).toLowerCase();
  const order = { High: 0, Medium: 1, Evergreen: 2, Custom: 3 };
  return D.cards.filter(c =>
    (f.platform === 'All' || c.platforms.includes(f.platform)) &&
    (f.audience === 'All' || c.audience === f.audience || c.audience === 'All') &&
    (f.strength === 'All' || c.strength === f.strength) &&
    (!q || (c.name + ' ' + c.description + ' ' + (c.examples || []).join(' ')).toLowerCase().includes(q))
  ).sort((a, b) => (order[a.strength] ?? 9) - (order[b.strength] ?? 9));
}

/* =================================================================
   MASTER PROMPT (genre template, and story-specific version)
   ================================================================= */
export const MASTER_FIELDS = [
  ['style', 'Art style & rendering'], ['look', 'Genre look / signature'], ['camera', 'Camera'], ['lighting', 'Lighting'],
  ['pacing', 'Pacing per clip'], ['audio', 'Audio & voice'], ['character_rules', 'Character design rules'],
  ['hook', 'Opening hook (clip 1)'], ['avoid', 'Avoid']];
export const masterText = m => MASTER_FIELDS.map(([k, l]) => `${l}: ${str(m?.[k])}`).join('\n');
const MASTER_SCHEMA = sec => `{"style":"overall art style & rendering","look":"recurring visual signature","camera":"shot sizes and simple camera moves that suit it","lighting":"lighting approach","pacing":"how much happens in one ${sec}-second clip","audio":"music mood, sound design, voice style","character_rules":"how characters are designed","hook":"how the first 2 seconds of clip 1 grab attention","avoid":"comma-separated artefacts, clichés and policy risks to avoid"}`;
export function masterPrompt(g, sec) {
  return `Create a reusable MASTER PROMPT style guide for the AI video genre below. It will be combined with a specific story to write one prompt per ${sec}-second clip for Google Flow.
Genre: ${g.name}
Description${g.origin === 'custom' ? ' (written by the creator)' : ''}: ${g.description}
Why it is trending: ${g.why || 'n/a'}
Typical visual style: ${g.visualStyle || 'n/a'}
Example concepts: ${(g.examples || []).join(' | ') || 'n/a'}
Audience: ${g.audience}
Be concrete and visual; each field max 40 words.
JSON: ${MASTER_SCHEMA(sec)}`;
}
export const normMaster = (j, fallback) => Object.fromEntries(MASTER_FIELDS.map(([k]) => [k, str(j?.[k]) || str(fallback?.[k])]));

/* =================================================================
   STORY
   ================================================================= */
export const LENGTHS = {
  short: { label: 'Short', sub: 'Reels · TikTok · Shorts', minS: 30, maxS: 90, chars: 3, locs: 2 },
  long: { label: 'Long', sub: 'YouTube · several minutes', minS: 180, maxS: 480, chars: 5, locs: 6 }
};
export function clipRange(P, S) {
  const L = LENGTHS[P.story.settings.length] || LENGTHS.short, sec = S.clipSeconds;
  return { L, min: Math.max(2, Math.ceil(L.minS / sec)), max: Math.max(3, Math.floor(L.maxS / sec)) };
}
export const wordLimit = S => Math.round(S.clipSeconds * 2.3);
export const spokenLang = P => { const s = P.story.settings; return s.language === 'Other' ? (str(s.languageOther) || 'English') : s.language; };
export function speechDesc(P) {
  const s = P.story.settings, lang = spokenLang(P);
  if (s.dialogue === 'none') return 'no speech — music and sound effects only';
  const voices = s.voices === 'comedy'
    ? ' Voice style: COMEDY — characters may deliberately use voices that do not match their age (e.g. a baby with a deep adult voice).'
    : ' Voice style: NATURAL — every character must sound their real age, gender and species (a baby sounds like a baby, a child like a child).';
  if (s.dialogue === 'narration') return `narrator voice-over only, in ${lang}.${voices}`;
  return `characters speak short dialogue lines, in ${lang}.${voices}`;
}

/* ---------- voices ---------- */
const CHILD_RE = /\b(baby|babies|infant|newborn|toddler|child|kid|little (?:boy|girl)|(?:[1-9]|1[0-2])[- ]?(?:year|yr)s?[- ]old|\d{1,2}[- ]?months?[- ]old)\b/i;
const CHILD_VOICE_RE = /\b(baby|babyish|infant|toddler|child|childlike|child's|kid|young (?:boy|girl)|little (?:boy|girl)|high[- ]pitched|(?:[1-9]|1[0-2])[- ]?(?:year|yr)s?[- ]old)\b/i;
/** Uses the age field when present, otherwise the appearance text. */
export const isChildLike = c => CHILD_RE.test(str(c.age) || str(c.appearance));
export const voiceNeedsAgeFix = (P, c) => P.story.settings.voices !== 'comedy' && isChildLike(c) && !CHILD_VOICE_RE.test(str(c.voice));
/** The voice text used in prompts; guarantees a child-like voice for babies and children in natural mode. */
export function voiceFor(P, c) {
  const v = str(c.voice);
  // The written voice contradicts the age, so it is replaced rather than combined (a mixed description confuses the video model).
  if (voiceNeedsAgeFix(P, c)) return `the natural voice of ${str(c.age) || 'a young child'} — high-pitched, soft and childlike`;
  return v || (str(c.age) ? `natural voice of ${str(c.age)}` : '');
}
function formatLine(P, S) {
  const { min, max } = clipRange(P, S), s = P.story.settings, sec = S.clipSeconds;
  return `Format: ${s.length === 'long' ? 'LONG story for YouTube' : 'SHORT story for Reels / TikTok / YouTube Shorts'} — ${min} to ${max} clips of ${sec} s (${fmtDur(min * sec)} to ${fmtDur(max * sec)}). Aspect ratio ${s.aspect}. Audience: ${P.genre.audience}. Speech: ${speechDesc(P)}.`;
}
const genreBlock = P => `Genre: ${P.genre.name} — ${P.genre.description}\nGenre style guide:\n${masterText(P.genre.master)}`;
function lengthRules(P, S) {
  const { min, max, L } = clipRange(P, S);
  if (P.story.settings.length === 'long') {
    return `LONG format (YouTube): between ${min} and ${max} clips. Three acts. Hook in the first 2 seconds, then plant the central question early. Give viewers a new question, reveal or cliffhanger roughly every 3–4 clips so they keep watching. Midpoint twist. Climax, then an ending that answers the central question and lands emotionally. At most ${L.chars} characters and ${L.locs} locations.`;
  }
  return `SHORT format (Reels/TikTok/Shorts): between ${min} and ${max} clips. Hook in the first 2 seconds, fast escalation, one strong twist or reveal, and a punchy payoff in the last clip (looping back to the opening image is a plus). At most ${L.chars} characters and ${L.locs} locations — fewer is better.`;
}
const charRules = P => `Character and location rules:
- Character "age": exact age or age group as a short label, e.g. "2-year-old toddler", "about 8 years old", "woman in her 30s", "elderly man, about 70", "adult cat".
- "appearance" (25–45 words): species if not human, age, skin tone, face shape, eye colour, hair style and colour, height/build, one distinctive feature.
- "wardrobe" (15–30 words): exact garments with colours and materials — ONE outfit for the whole story unless a change is essential.
- "voice" (12–25 words): age group, gender, pitch, tone, pace and accent, and it MUST fit the character's age and species: babies and toddlers have high-pitched, soft voices with babbling or very simple words; young children sound like young children; teenagers sound youthful; adults and elderly people sound their age; animals get a voice that fits their size and age. ${P.story.settings.voices === 'comedy' ? 'COMEDY voice style is chosen: a deliberately mismatched voice is allowed — if you use one, state it explicitly (e.g. "deep, serious adult male voice, comically mismatched for a baby").' : 'NEVER give a baby or child an adult voice.'}
- "narrator_voice" (only matters when there is narration): age group, gender, tone, pace and accent of the narrator, suited to the audience and the story's tone.
- Location "description" (30–50 words): precise and visual, with fixed landmarks and props.
- Never use real celebrities, brands or copyrighted characters.`;
const OUTLINE_FIELDS = `"title":"","logline":"","theme":"","tone":"","narrator_voice":"","characters":[{"id":"c1","name":"","role":"","age":"","appearance":"","wardrobe":"","voice":""}],"locations":[{"id":"l1","name":"","description":""}],"style_lock":{"art_style":"","color_palette":"","lighting":"","camera_language":"","film_look":""}`;
const PART_SCHEMA = `{"title":"","summary":"","purpose":"hook | setup | rising | reveal | twist | cliffhanger | climax | payoff | ending","transition":"cut | continuous","characters":["c1"],"location":"l1","time_of_day":"","weather":""}`;
const PART_RULES = sec => `Rules for every part:
- ONE continuous moment that can be filmed as a single ${sec}-second shot with one main action (no montage, no time jump inside a part).
- "transition": "continuous" when it continues the same moment and place as the previous part with no time jump; "cut" when it jumps to another place or time. Part 1 is "cut".
- "location": a location id. Keep "time_of_day" and "weather" identical across continuous parts.
- "characters": ids of everyone visible in the part.
- "summary": 2–3 concrete visual sentences — where everyone is at the start, what happens, and the exact situation at the end of the moment.
- Each part starts from the situation the previous part ended in (or clearly after a cut) and never contradicts earlier parts.
- The last part resolves the story and ends on a strong, memorable final image.`;

export function ideasPrompt(P, S) {
  const draft = str(P.story.idea);
  return `${genreBlock(P)}
${formatLine(P, S)}
Suggest 5 original, scroll-stopping story ideas for this genre and format, each with a hook, a twist and a satisfying ending.
${draft ? `Build on the user's rough idea: "${draft}" — give 5 different directions.` : ''}
JSON: {"ideas":[{"title":"","logline":"1-2 sentences"}]}`;
}

export function storyResearchQueries(P) {
  const g = P.genre.name, idea = str(P.story.idea).split(/\s+/).slice(0, 12).join(' ');
  const fmt = P.story.settings.length === 'long' ? 'YouTube short film' : 'viral reel';
  return [
    `${g} ${fmt} story ideas plot twist ending ${new Date().getFullYear()}`,
    idea ? `${idea} story plot twist suspense ending` : `best ${g} story twists that keep viewers watching`
  ];
}
export function researchNotes(settled) {
  const rows = [];
  settled.forEach(s => { if (s.status === 'fulfilled') arr(s.value?.results).slice(0, 4).forEach(r => rows.push(`${str(r.title)} — ${str(r.content).slice(0, 300)}`)); });
  return rows.slice(0, 8).map((r, i) => `[W${i + 1}] ${r}`).join('\n');
}

export function outlinePrompt(P, S, research, forced) {
  const { min } = clipRange(P, S), sec = S.clipSeconds;
  return `${genreBlock(P)}
${formatLine(P, S)}
User's idea: ${str(P.story.idea) ? `"${str(P.story.idea)}"` : 'none — invent the strongest original idea for this genre'}
${research ? `Web research on similar stories (inspiration only — never copy plots, names or characters):\n${research}\n` : ''}${forced ? `The user chose this storyline — develop exactly it:\n${JSON.stringify(forced)}\n` : ''}
You are the head writer of a channel whose videos people watch to the very end.
1. ${forced ? 'Keep the chosen storyline as storyline 1 and add 2 alternatives for reference.' : 'Develop 3 genuinely different storylines for this idea (or for the genre). Each needs a hook in the first 2 seconds, rising tension, a twist or reveal, and an ending that pays off the hook.'}
2. Score each 1–10 for hook, suspense, payoff and feasibility (can it be filmed as separate ${sec}-second AI clips with the same characters?). ${forced ? 'Set "chosen" to 0.' : 'Choose the best one; if the user gave an idea, stay faithful to it.'}
3. Decide how many ${sec}-second clips the chosen story really needs to be told completely — no padding, no rushing, within the format range.
4. Write the outline of the chosen storyline: acts with beats, characters, locations and a style lock.
${lengthRules(P, S)}
${charRules(P)}
JSON: {"storylines":[{"title":"","logline":"","hook":"","twist":"","ending":"","why_it_holds_attention":"","scores":{"hook":0,"suspense":0,"payoff":0,"feasibility":0}}],"chosen":0,"choice_reason":"","clip_count":${min},"pacing_note":"why this many clips",${OUTLINE_FIELDS},"acts":[{"name":"","purpose":"","beats":[""],"clips":"1-4"}]}`;
}

function normChars(v, max) {
  return arr(v).slice(0, max).map((c, i) => ({ id: str(c.id) || 'c' + (i + 1), name: str(c.name) || 'Character ' + (i + 1), role: str(c.role), age: str(c.age), appearance: str(c.appearance), wardrobe: str(c.wardrobe), voice: str(c.voice) }));
}
function normLocs(v, max) {
  return arr(v).slice(0, max).map((l, i) => ({ id: str(l.id) || 'l' + (i + 1), name: str(l.name) || 'Location ' + (i + 1), description: str(l.description) }));
}
const normStyle = (sl, P) => ({ art_style: str(sl?.art_style) || str(P.genre?.master?.style), color_palette: str(sl?.color_palette), lighting: str(sl?.lighting), camera_language: str(sl?.camera_language), film_look: str(sl?.film_look) });

export function normOutline(j, P, S) {
  const { min, max, L } = clipRange(P, S);
  const storylines = arr(j.storylines).slice(0, 3).map(s => ({
    title: str(s.title), logline: str(s.logline), hook: str(s.hook), twist: str(s.twist), ending: str(s.ending),
    why: str(s.why_it_holds_attention), scores: Object.fromEntries(['hook', 'suspense', 'payoff', 'feasibility'].map(k => [k, Math.max(0, Math.min(10, Number(s.scores?.[k]) || 0))]))
  }));
  const n = Math.max(min, Math.min(max, Math.round(Number(j.clip_count)) || min));
  return {
    storylines, chosen: Math.max(0, Math.min(storylines.length - 1, Number(j.chosen) || 0)), choice_reason: str(j.choice_reason),
    title: str(j.title) || 'Untitled story', logline: str(j.logline), theme: str(j.theme), tone: str(j.tone), narrator_voice: str(j.narrator_voice),
    clip_count: n, pacing_note: str(j.pacing_note),
    characters: normChars(j.characters, L.chars + 1), locations: normLocs(j.locations, L.locs + 1), style_lock: normStyle(j.style_lock, P),
    acts: arr(j.acts).map(a => ({ name: str(a.name), purpose: str(a.purpose), beats: arr(a.beats).map(str).filter(Boolean), clips: str(a.clips) }))
  };
}

export function partsPrompt(P, S, o) {
  const brief = { title: o.title, logline: o.logline, theme: o.theme, tone: o.tone,
    characters: o.characters.map(c => ({ id: c.id, name: c.name, role: c.role })),
    locations: o.locations.map(l => ({ id: l.id, name: l.name, description: l.description })), acts: o.acts };
  return `${genreBlock(P)}
${formatLine(P, S)}
Story outline (chosen storyline):
${JSON.stringify(brief)}
Write EXACTLY ${o.clip_count} story parts — one per ${S.clipSeconds}-second clip — telling this story from the first frame to the final image, following the acts and beats.
${PART_RULES(S.clipSeconds)}
JSON: {"parts":[${PART_SCHEMA}]}`;
}

export function normParts(j, st) {
  const charIds = new Set(st.characters.map(c => c.id)), locIds = new Set(st.locations.map(l => l.id));
  const parts = arr(j.parts).map((p, i) => ({
    id: uid(), title: str(p.title), summary: str(p.summary), purpose: str(p.purpose).split(/[\s|]/)[0].toLowerCase(),
    transition: i === 0 ? 'cut' : (str(p.transition).toLowerCase().startsWith('cont') ? 'continuous' : 'cut'),
    characters: arr(p.characters).map(str).filter(id => charIds.has(id)),
    location: locIds.has(str(p.location)) ? str(p.location) : (st.locations[0]?.id || ''),
    time_of_day: str(p.time_of_day), weather: str(p.weather)
  })).filter(p => p.summary);
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].transition === 'continuous' && parts[i].location !== parts[i - 1].location) parts[i].transition = 'cut';
  }
  return parts;
}

/** Story data without bulky fields, for prompts. */
function storyBrief(st) {
  return { title: st.title, logline: st.logline, theme: st.theme, tone: st.tone, narrator_voice: st.narrator_voice, characters: st.characters, locations: st.locations,
    style_lock: st.style_lock, parts: st.parts.map(({ id, ...p }) => p) };
}
export function rewriteStoryPrompt(P, S, ins) {
  const { min, max } = clipRange(P, S);
  return `${genreBlock(P)}
${formatLine(P, S)}
Current story JSON:
${JSON.stringify(storyBrief(P.story.data))}
Change request from the user: "${ins}"
Rewrite the story applying the change request. Keep ids of unchanged characters and locations. Keep roughly the same number of parts unless the change needs more or fewer (stay within ${min}–${max}). The story must still have a hook, rising suspense and a complete ending.
${lengthRules(P, S)}
${charRules(P)}
${PART_RULES(S.clipSeconds)}
JSON: {${OUTLINE_FIELDS},"parts":[${PART_SCHEMA}]}`;
}
export function normRewrite(j, P, S) {
  const { L } = clipRange(P, S), old = P.story.data;
  const st = { ...old, title: str(j.title) || old.title, logline: str(j.logline) || old.logline, theme: str(j.theme) || old.theme, tone: str(j.tone) || old.tone, narrator_voice: str(j.narrator_voice) || old.narrator_voice || '',
    characters: normChars(j.characters, L.chars + 1), locations: normLocs(j.locations, L.locs + 1), style_lock: normStyle(j.style_lock, P) };
  if (!st.characters.length) st.characters = old.characters;
  if (!st.locations.length) st.locations = old.locations;
  st.parts = normParts(j, st);
  if (st.parts.length < 2) throw new Error('The AI returned an incomplete story. Please try again.');
  st.clip_count = st.parts.length;
  return st;
}
export function rewritePartPrompt(P, S, i, ins) {
  const st = P.story.data;
  return `${genreBlock(P)}
${formatLine(P, S)}
Full story JSON:
${JSON.stringify(storyBrief(st))}
Rewrite ONLY part ${i + 1} ("${st.parts[i].title}"). ${ins ? `User request: "${ins}".` : 'Make it stronger and more visual.'}
It must start from where part ${i} ends and lead naturally into part ${i + 2} (if they exist), fit one ${S.clipSeconds}-second shot with one main action, and use existing character and location ids.
${PART_RULES(S.clipSeconds)}
JSON: ${PART_SCHEMA}`;
}
export function validateStory(st) {
  const errs = [], locIds = new Set(st.locations.map(l => l.id));
  if (!st.parts.length) errs.push('Add at least one story part.');
  st.parts.forEach((p, i) => {
    if (!str(p.summary)) errs.push(`Part ${i + 1} is empty.`);
    if (!locIds.has(p.location)) errs.push(`Part ${i + 1} has no valid location.`);
  });
  st.characters.forEach(c => { if (!str(c.appearance)) errs.push(`${c.name}: appearance is empty.`); });
  st.locations.forEach(l => { if (!str(l.description)) errs.push(`${l.name}: description is empty.`); });
  return errs;
}

/* =================================================================
   PRODUCTION DESIGN — rebuilt from the FINAL story at finalize time
   ================================================================= */
export function designPrompt(P, S) {
  const st = P.story.data;
  return `${genreBlock(P)}
${formatLine(P, S)}
FINAL story (written and edited by the user — this is the source of truth):
${JSON.stringify(storyBrief(st))}
You are the production designer. Rebuild the visual bible for THIS story so that every separately generated ${S.clipSeconds}-second clip looks like the same film.
1. "master": a story-specific style guide. Adapt the genre style guide to this story's tone, setting and events; where they conflict, the story wins.
2. "characters": for EVERY character id: keep every detail already written (never contradict or remove it) and add only missing precise details. age (short label); appearance 30–50 words; wardrobe 15–35 words (one outfit for the whole film unless the story requires a change); voice 12–25 words that fits the character's age, gender and species (see the voice rules below).
3. "locations": for EVERY location id: 35–60 words — layout, architecture or landscape, fixed landmarks and props with colours and positions, materials, background elements. It must fit every part set there (time of day and weather vary per part, so do not fix them here).
4. "style_lock": art_style, color_palette, lighting, camera_language, film_look — one consistent look for the whole film.
5. "narrator_voice": the narrator's voice (only matters when there is narration).
${charRules(P)}
Do not add or remove characters or locations; keep their ids and names.
JSON: {"master":${MASTER_SCHEMA(S.clipSeconds)},"narrator_voice":"","characters":[{"id":"c1","name":"","role":"","age":"","appearance":"","wardrobe":"","voice":""}],"locations":[{"id":"l1","name":"","description":""}],"style_lock":{"art_style":"","color_palette":"","lighting":"","camera_language":"","film_look":""}}`;
}
/** Mutates P (a working copy). */
export function applyDesign(P, j) {
  const st = P.story.data;
  P.story.master = normMaster(j.master || {}, P.genre?.master);
  const jc = arr(j.characters), jl = arr(j.locations);
  st.characters = st.characters.map(c => {
    const n = jc.find(x => str(x.id) === c.id) || jc.find(x => str(x.name).toLowerCase() === c.name.toLowerCase());
    return n ? { ...c, age: str(n.age) || c.age || '', appearance: str(n.appearance) || c.appearance, wardrobe: str(n.wardrobe) || c.wardrobe, voice: str(n.voice) || c.voice, role: c.role || str(n.role) } : c;
  });
  st.locations = st.locations.map(l => {
    const n = jl.find(x => str(x.id) === l.id) || jl.find(x => str(x.name).toLowerCase() === l.name.toLowerCase());
    return n ? { ...l, description: str(n.description) || l.description } : l;
  });
  st.narrator_voice = str(j.narrator_voice) || st.narrator_voice || '';
  const sl = j.style_lock || {};
  st.style_lock = Object.fromEntries(Object.keys({ art_style: 1, color_palette: 1, lighting: 1, camera_language: 1, film_look: 1 })
    .map(k => [k, str(sl[k]) || str(st.style_lock?.[k])]));
  P.story.designedAt = Date.now();
}

/* =================================================================
   CLIPS — structured shot plans
   ================================================================= */
const NOTHING = /^(nothing|none|empty|n\/a|no|-)\.?$/i;
export function normState(s) {
  if (!s) return { shot: '', angle: '', characters: [], props: '', background: '' };
  if (typeof s === 'string') return { text: str(s) };
  if (s.text && !s.characters) return { text: str(s.text) };
  return {
    shot: str(s.shot), angle: str(s.angle),
    characters: arr(s.characters).map(c => ({ id: str(c.id), position: str(c.position), pose: str(c.pose), facing: str(c.facing), expression: str(c.expression), holding: str(c.holding) })).filter(c => c.id),
    props: str(s.props), background: str(s.background)
  };
}
const stateEmpty = s => !s || (s.text !== undefined ? !str(s.text) : !(s.shot || s.characters?.length || s.props || s.background));
const stateChars = s => (s && s.characters ? s.characters.map(c => c.id) : []);
function normBeats(v, legacyAction, sec) {
  const b = arr(v).map(x => (typeof x === 'string' ? { t: '', action: str(x) } : { t: str(x.t || x.time), action: str(x.action || x.description) })).filter(x => x.action);
  if (!b.length && str(legacyAction)) b.push({ t: `0-${sec}s`, action: str(legacyAction) });
  return b;
}
const normDialogue = v => arr(v).map(d => ({ speaker: str(d.speaker) || 'narrator', line: str(d.line), delivery: str(d.delivery) })).filter(d => d.line);

export function normClip(c, i, sec = 10) {
  return {
    part: i + 1,
    transition: i === 0 ? 'cut' : (str(c.transition).toLowerCase().startsWith('cont') ? 'continuous' : 'cut'),
    location_id: str(c.location_id || c.location), time_of_day: str(c.time_of_day), weather: str(c.weather),
    characters_present: arr(c.characters_present).map(str).filter(Boolean),
    start_state: normState(c.start_state || c.start_frame), beats: normBeats(c.beats, c.action, sec),
    camera: str(c.camera), end_state: normState(c.end_state || c.end_frame),
    dialogue: normDialogue(c.dialogue), sound: str(c.sound), custom: null, issues: [], stale: false
  };
}
const charById = (st, id) => st.characters.find(c => c.id === id);
const clone = o => JSON.parse(JSON.stringify(o));

/** Renders a frame description deterministically. */
export function renderState(st, s) {
  if (!s) return '';
  if (s.text !== undefined) return endDot(s.text);
  const out = [];
  const head = [s.shot, s.angle].filter(Boolean).join(', ');
  if (head) out.push(head.charAt(0).toUpperCase() + head.slice(1));
  for (const c of s.characters || []) {
    const ch = charById(st, c.id), name = ch ? ch.name : c.id;
    const bits = [c.position, c.pose,
      c.facing && (/^facing\b/i.test(c.facing) ? c.facing : `facing ${c.facing}`),
      c.expression && (/expression|look|smil|frown|eyes/i.test(c.expression) ? c.expression : `${c.expression} expression`),
      c.holding && !NOTHING.test(c.holding) && (/^(holding|carrying|gripping|clutching)\b/i.test(c.holding) ? c.holding : `holding ${c.holding}`)
    ].filter(Boolean);
    out.push(`${name}: ${bits.join(', ')}`);
  }
  if (s.props && !NOTHING.test(s.props)) out.push(`Props: ${s.props}`);
  if (s.background) out.push(`Background: ${s.background}`);
  return out.map(endDot).join(' ');
}

/** Enforces continuity and records problems on each clip (mutates clips). */
export function linkAndValidate(clips, P, S) {
  const st = P.story.data, wl = wordLimit(S);
  const locIds = new Set(st.locations.map(l => l.id));
  clips.forEach((c, i) => {
    const part = st.parts[i] || {};
    const issues = [];
    if (!locIds.has(c.location_id)) c.location_id = locIds.has(part.location) ? part.location : (st.locations[0]?.id || '');
    if (i === 0) c.transition = 'cut';
    if (i > 0 && c.transition === 'continuous') {
      const prev = clips[i - 1];
      if (prev.location_id !== c.location_id) {
        c.transition = 'cut';
        c.autoCut = `Set as a new scene: the location differs from clip ${i}.`;
      } else {
        c.start_state = clone(prev.end_state);
        c.time_of_day = prev.time_of_day;
        c.weather = prev.weather;
      }
    }
    if (c.autoCut) issues.push(c.autoCut);
    if (c.transition === 'cut') {
      if (!c.time_of_day) c.time_of_day = part.time_of_day || '';
      if (!c.weather) c.weather = part.weather || '';
    }
    const present = new Set(c.characters_present.filter(id => charById(st, id)));
    [...stateChars(c.start_state), ...stateChars(c.end_state)].forEach(id => { if (charById(st, id)) present.add(id); else issues.push(`Unknown character "${id}" in a frame description.`); });
    c.characters_present = [...present];
    const words = c.dialogue.reduce((a, d) => a + d.line.split(/\s+/).filter(Boolean).length, 0);
    if (P.story.settings.dialogue !== 'none' && words > wl) issues.push(`${words} spoken words — may not fit ${S.clipSeconds}s (aim for ${wl} or fewer).`);
    c.dialogue.forEach(d => {
      if (d.speaker !== 'narrator' && charById(st, d.speaker) && !present.has(d.speaker)) issues.push(`${charById(st, d.speaker).name} speaks but is not in the shot.`);
    });
    if (!c.beats.length) issues.push('No action described.');
    if (stateEmpty(c.start_state)) issues.push('Start frame is missing.');
    if (stateEmpty(c.end_state)) issues.push('End frame is missing.');
    c.issues = issues;
  });
  return clips;
}

function bible(P) {
  const st = P.story.data, m = P.story.master || P.genre.master, sl = st.style_lock || {};
  return `Story: ${st.title} — ${st.logline}
Style guide for this film:
${masterText(m)}
Style lock: ${Object.entries(sl).filter(([, v]) => v).map(([k, v]) => `${k.replace('_', ' ')}: ${v}`).join('; ')}
Characters (the tool inserts their full appearance and outfit — refer to them by id only): ${st.characters.map(c => `${c.id} = ${c.name}${c.role ? ` (${c.role})` : ''}`).join('; ')}
Locations: ${st.locations.map(l => `${l.id} = ${l.name}: ${l.description}`).join(' | ')}`;
}
const partsList = st => st.parts.map((p, i) =>
  `${i + 1}. [${p.transition}${p.location ? `, ${p.location}` : ''}${p.time_of_day ? `, ${p.time_of_day}` : ''}${p.weather ? `, ${p.weather}` : ''}${p.purpose ? `, ${p.purpose}` : ''}] ${p.title ? p.title + ': ' : ''}${p.summary}`).join('\n');
const STATE_SCHEMA = `{"shot":"wide | medium | medium close-up | close-up","angle":"eye level | low angle | high angle | over-the-shoulder","characters":[{"id":"c1","position":"where in frame and in the location","pose":"","facing":"","expression":"","holding":""}],"props":"state and position of important objects","background":"what is visible behind"}`;
function clipSchema(sec) {
  const t1 = Math.round(sec / 3), t2 = Math.round((sec * 2) / 3);
  return `{"part":1,"transition":"continuous | cut","location_id":"l1","time_of_day":"","weather":"","characters_present":["c1"],"start_state":${STATE_SCHEMA},"beats":[{"t":"0-${t1}s","action":""},{"t":"${t1}-${t2}s","action":""},{"t":"${t2}-${sec}s","action":""}],"camera":"one simple move","end_state":${STATE_SCHEMA},"dialogue":[{"speaker":"c1 or narrator","line":"","delivery":""}],"sound":""}`;
}
function clipRules(P, S) {
  const sec = S.clipSeconds, none = P.story.settings.dialogue === 'none';
  return `Rules (critical — every clip is generated separately, possibly in different accounts; only the prompt text carries continuity):
1. One clip per story part, in order. Each clip is ONE continuous ${sec}-second shot: no cuts, no time jumps, no montage inside it.
2. "transition" = the part's transition. "continuous": the clip starts EXACTLY on the previous clip's end_state (the tool copies it) — same location, time of day, weather, positions, poses, held objects and prop states — so write the beats starting from that exact state. "cut": a new scene — write a fresh, fully described establishing start_state.
3. start_state and end_state each describe ONE frame: shot size, camera angle and, for EVERY visible character, position (in frame and in the location), pose, facing direction, expression and what they hold; plus the state of important props and the background.
4. end_state is the clip's last second: calm and stable (no motion blur, no mid-jump, no half-finished action) and it must already match the beginning of the next story part, so the next clip can start from it.
5. beats: three timed beats covering 0–${sec}s that move physically and plausibly from start_state to end_state. Every change of position, pose, held object or prop must happen on screen in the beats — nothing appears, disappears or teleports.
6. characters_present: everyone visible at any moment. No one else may appear. Refer to characters only by id; never describe their looks.
7. camera: at most one simple move (static, slow push-in, slow pan, tracking, slow orbit), consistent with the start and end shot sizes.
8. dialogue: ${none ? 'none — always return an empty array.' : `at most ${wordLimit(S)} words in total per clip, in ${spokenLang(P)}. speaker = the id of a character who is present, or "narrator".${P.story.settings.voices === 'comedy' ? '' : ' Lines must suit the speaker\'s age: a baby or toddler only babbles or says one or two simple words; a young child speaks in short, simple sentences.'}`}
9. sound: ambience and music mood, consistent with neighbouring clips.`;
}
export function clipBatchPrompt(P, S, a, b, prev) {
  const st = P.story.data;
  return `${bible(P)}
Format: ${P.story.settings.aspect}, ${S.clipSeconds}-second clips. Speech: ${speechDesc(P)}.
FULL STORY (one part = one clip):
${partsList(st)}

${prev ? `PREVIOUS CLIP (${a}) ENDED ON THIS FRAME — location ${prev.location_id}${prev.time_of_day ? ', ' + prev.time_of_day : ''}${prev.weather ? ', ' + prev.weather : ''}:\n${renderState(st, prev.end_state)}` : 'This batch starts with the OPENING clip of the film — hook the viewer in the first 2 seconds.'}
${b === st.parts.length ? `Clip ${b} is the FINAL clip: end on a strong, steady closing image that completes the story.` : ''}

Write the shot plans for clips ${a + 1} to ${b} (story parts ${a + 1}–${b}).
${clipRules(P, S)}
JSON: {"clips":[${clipSchema(S.clipSeconds)}]} — exactly ${b - a} clips with "part" ${a + 1} to ${b}.`;
}
/** Normalises one batch; the story part decides the transition. */
export function normBatch(j, P, S, a, b) {
  const st = P.story.data;
  let got = arr(j.clips);
  if (got.some(c => Number(c.part))) got = got.slice().sort((x, y) => (Number(x.part) || 0) - (Number(y.part) || 0));
  return got.slice(0, b - a).map((c, k) => {
    const i = a + k, clip = normClip(c, i, S.clipSeconds), part = st.parts[i];
    if (part?.transition) clip.transition = i === 0 ? 'cut' : part.transition;
    if (!clip.location_id && part?.location) clip.location_id = part.location;
    return clip;
  });
}

const stripClip = ({ custom, issues, stale, autoCut, ...c }) => c;
export function regenClipPrompt(P, S, i, ins) {
  const st = P.story.data, clips = P.clips, prev = clips[i - 1], next = clips[i + 1], c = clips[i];
  return `${bible(P)}
Format: ${P.story.settings.aspect}, ${S.clipSeconds}-second clips. Speech: ${speechDesc(P)}.
FULL STORY:
${partsList(st)}

Rewrite the shot plan for clip ${i + 1} of ${clips.length} (story part ${i + 1}: "${st.parts[i]?.summary || ''}").
Current plan: ${JSON.stringify(stripClip(c))}
${prev ? (c.transition === 'continuous'
    ? `It continues directly from clip ${i}, which ended on: ${renderState(st, prev.end_state)} (location ${prev.location_id}${prev.time_of_day ? ', ' + prev.time_of_day : ''}). Start exactly there.`
    : `It is a new scene after clip ${i}.`) : 'It is the opening clip: hook the viewer in the first 2 seconds.'}
${next ? (next.transition === 'continuous' ? `Clip ${i + 2} starts from this clip's end frame and currently opens on: ${renderState(st, next.start_state)} End in that same state unless the user's request requires a different ending.` : '') : 'It is the final clip: end on a strong, steady closing image.'}
${ins ? `User request: "${ins}"` : 'Make it clearer, more vivid and more cinematic while keeping continuity.'}
${clipRules(P, S)}
JSON: {"clip":${clipSchema(S.clipSeconds)}}`;
}

/* ---------- AI continuity review ---------- */
export function reviewWindows(n, size = 10) {
  const w = [];
  for (let a = 0; a < n; a += size - 1) { w.push([a, Math.min(n, a + size)]); if (a + size >= n) break; }
  return w;
}
function clipDigest(P, c, i) {
  const st = P.story.data, loc = st.locations.find(l => l.id === c.location_id);
  return `Clip ${i + 1} [${c.transition}; ${loc ? loc.name : c.location_id}${c.time_of_day ? '; ' + c.time_of_day : ''}${c.weather ? '; ' + c.weather : ''}; present: ${c.characters_present.map(id => charById(st, id)?.name || id).join(', ') || 'nobody'}]
 STORY PART: ${st.parts[i]?.summary || ''}
 START: ${renderState(st, c.start_state)}
 BEATS: ${c.beats.map(b => `${b.t ? b.t + ' ' : ''}${b.action}`).join(' | ')}
 END: ${renderState(st, c.end_state)}
 CAMERA: ${c.camera}${c.dialogue.length ? `\n DIALOGUE: ${c.dialogue.map(d => `${d.speaker}: "${d.line}"`).join(' ')}` : ''}`;
}
export function reviewPrompt(P, S, clips, a, b) {
  return `${bible(P)}
You are the script supervisor (continuity) for this AI film. Each ${S.clipSeconds}-second clip is generated separately, so any contradiction between clips breaks the film.
Clips ${a + 1}–${b}:
${clips.slice(a, b).map((c, k) => clipDigest(P, c, a + k)).join('\n\n')}

Check every clip for:
1. Contradictions with the previous clip — positions, poses, facing, held objects, prop states, time of day, weather, who is present. A "continuous" clip must begin exactly where the previous clip ended.
2. Beats that do not physically lead from START to END, or changes that happen off screen.
3. Characters or objects that appear or disappear without being shown.
4. Clips that do not match their story part, or that break the story's logic or suspense.
5. Dialogue over ${wordLimit(S)} words, or spoken by a character who is not present.
6. Anything a single ${S.clipSeconds}-second continuous shot cannot show.
Return ONLY real problems, each with the full corrected value of one field. Fields you may fix: beats, end_state, start_state (only for "cut" clips), characters_present, camera, dialogue, sound. If you change an end_state, make sure the next clip's beats still start correctly (fix them too if needed). Return an empty list if everything is consistent.
JSON: {"fixes":[{"part":${a + 1},"problem":"short description","field":"beats","value":"<full corrected value: beats = array of {t, action}; states = ${STATE_SCHEMA.replace(/"/g, "'")}; dialogue = array of {speaker, line, delivery}; characters_present = array of ids; camera/sound = string>"}]}`;
}
const FIX_FIELDS = {
  beats: v => normBeats(v), end_state: normState, start_state: normState,
  characters_present: v => arr(v).map(str).filter(Boolean), camera: str, sound: str, dialogue: normDialogue
};
/** Applies review fixes (mutates clips). Returns the list of applied fixes. */
export function applyFixes(clips, j, a, b) {
  const applied = [];
  for (const f of arr(j?.fixes)) {
    const i = idx(f.part) - 1, field = str(f.field);
    if (!(i >= a && i < b) || !clips[i] || !FIX_FIELDS[field] || clips[i].custom != null) continue;
    if (field === 'start_state' && clips[i].transition === 'continuous') continue;
    const value = FIX_FIELDS[field](f.value);
    if ((field === 'beats' && !value.length) || ((field === 'end_state' || field === 'start_state') && stateEmpty(value))) continue;
    clips[i][field] = value;
    applied.push({ part: i + 1, field, problem: str(f.problem) });
  }
  return applied;
}

/* =================================================================
   FINAL PROMPT TEXT (deterministic)
   ================================================================= */
export function buildPrompt(P, S, clip, i) {
  if (clip.custom != null) return clip.custom;
  const st = P.story.data, set = P.story.settings, m = P.story.master || P.genre?.master || {}, sl = st.style_lock || {}, sec = S.clipSeconds;
  const loc = st.locations.find(l => l.id === clip.location_id) || st.locations[0];
  const chars = clip.characters_present.map(id => charById(st, id)).filter(Boolean);
  const orient = { '9:16': 'Vertical 9:16 video', '16:9': 'Widescreen 16:9 video', '1:1': 'Square 1:1 video' }[set.aspect] || 'Video';
  const where = [loc?.name, clip.time_of_day, clip.weather].filter(Boolean).join(', ');
  const L = [];
  L.push(`${orient}, one continuous ${sec}-second shot with no cuts. Style: ${endDot([sl.art_style || m.style, sl.film_look].filter(Boolean).join('; '))}`);
  if (i === 0) L.push(`Scene: opening scene — ${where}.`);
  else if (clip.transition === 'continuous') L.push(`Scene: continues directly from the previous clip — same place, same moment (${where}).`);
  else L.push(`Scene: new scene — ${where}.`);
  if (loc) L.push(`Setting: ${loc.name} — ${endDot(loc.description)}`);
  const look = [sl.lighting && `Lighting: ${endDot(sl.lighting)}`, sl.color_palette && `Colour palette: ${endDot(sl.color_palette)}`].filter(Boolean).join(' ');
  if (look) L.push(look);
  if (chars.length) {
    L.push('Characters — only these appear, and they look exactly the same in every clip:');
    const speech = set.dialogue !== 'none';
    chars.forEach(c => {
      const voice = speech ? voiceFor(P, c) : '';
      L.push(`- ${c.name}${str(c.age) ? ` (${str(c.age)})` : ''}: ${endDot(c.appearance)} Wearing: ${endDot(c.wardrobe)}${voice ? ` Voice: ${endDot(voice)}` : ''}`);
    });
  } else L.push('No people or characters appear in this clip.');
  L.push(`START FRAME (the first second must look exactly like this): ${renderState(st, clip.start_state)}`);
  L.push('ACTION:');
  clip.beats.forEach(b => L.push(`- ${b.t ? b.t + ': ' : ''}${endDot(b.action)}`));
  L.push(`END FRAME (hold steady for the last second): ${renderState(st, clip.end_state)}`);
  L.push(`Camera: ${endDot(clip.camera || sl.camera_language || 'steady, locked-off shot')}`);
  if (clip.dialogue.length && set.dialogue !== 'none') {
    L.push(`Audio — spoken in ${spokenLang(P)}:`);
    clip.dialogue.forEach(d => {
      if (d.speaker === 'narrator') L.push(`- Narrator (voice-over${st.narrator_voice ? '; ' + str(st.narrator_voice) : ''}${d.delivery ? '; ' + d.delivery : ''}): "${d.line}"`);
      else {
        const c = charById(st, d.speaker);
        const v = c ? voiceFor(P, c) : '';
        L.push(`- ${c ? c.name : d.speaker} says, in ${c ? c.name + '’s' : 'their'} own voice${v ? ` (${v}${d.delivery ? '; ' + d.delivery : ''})` : d.delivery ? ` (${d.delivery})` : ''}: "${d.line}"`);
      }
    });
    L.push(set.voices === 'comedy'
      ? 'Voices: each character speaks only in the voice described for them — mismatched voices are intentional for comedy.'
      : 'Voices: each character speaks only in their own voice as described, matching their age — babies and children must sound like babies and children, never like adults.');
  } else L.push('No speech.');
  if (clip.sound) L.push(`Sound: ${endDot(clip.sound)}`);
  if (m.look) L.push(`Look: ${endDot(m.look)}`);
  L.push('Rules: keep every character’s face, hairstyle, body and outfit exactly as described; keep the same environment, lighting and colour grade; natural, physically plausible motion; nothing appears or disappears without being shown; no text, captions, subtitles, logos or watermarks; no cuts or transitions.');
  if (m.avoid) L.push(`Avoid: ${endDot(m.avoid)}`);
  return L.filter(Boolean).join('\n');
}
export function refPrompt(P, c) {
  const sl = P.story.data.style_lock || {};
  return `Character reference sheet, ${endDot(sl.art_style)} ${c.name}: ${endDot(c.appearance)} Wearing: ${endDot(c.wardrobe)} Full body, front view, neutral expression, plain light-grey background, even soft lighting, no text.`;
}
export function allPromptsText(P, S) {
  const st = P.story.data, sec = S.clipSeconds, fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const head = [st.title, st.logline, `Genre: ${P.genre.name} · ${P.clips.length} clips × ${sec}s (${fmtDur(P.clips.length * sec)}) · ${P.story.settings.aspect}`, '',
    'CHARACTER REFERENCE PROMPTS (optional, for image reference features):', ...st.characters.map(c => `- ${refPrompt(P, c)}`), ''];
  return head.concat(P.clips.flatMap((c, i) => [`=== CLIP ${i + 1} of ${P.clips.length} (${fmt(i * sec)}–${fmt((i + 1) * sec)}) ===`, buildPrompt(P, S, c, i), ''])).join('\n');
}

/* =================================================================
   UPGRADE projects saved by earlier versions
   ================================================================= */
export function upgradeProject(p) {
  const base = newProject();
  const q = { ...base, ...p, story: { ...base.story, ...(p.story || {}) } };
  q.story.settings = { ...base.story.settings, ...(p.story?.settings || {}) };
  if (p.story?.settings?.totalSeconds && !p.story.settings.length) q.story.settings.length = p.story.settings.totalSeconds > 120 ? 'long' : 'short';
  delete q.story.settings.totalSeconds;
  delete q.discover;
  const st = q.story.data;
  if (st) {
    st.parts = arr(st.parts).map((pt, i) => ({ id: pt.id || uid(), title: str(pt.title), summary: str(pt.summary), purpose: str(pt.purpose),
      transition: i === 0 ? 'cut' : (pt.transition || 'continuous'), characters: arr(pt.characters), location: str(pt.location),
      time_of_day: str(pt.time_of_day), weather: str(pt.weather) }));
    st.characters = arr(st.characters).map(c => ({ age: '', voice: '', ...c })); st.locations = arr(st.locations);
    st.narrator_voice = str(st.narrator_voice);
    st.style_lock = { art_style: '', color_palette: '', lighting: '', camera_language: '', film_look: '', ...(st.style_lock || {}) };
    st.storylines = arr(st.storylines); st.acts = arr(st.acts);
    st.clip_count = st.clip_count || st.parts.length;
  }
  q.clips = arr(p.clips).map((c, i) => (c.start_state || c.beats
    ? { issues: [], stale: false, custom: null, ...c }
    : { ...normClip({ ...c, transition: i ? 'continuous' : 'cut' }, i), custom: c.custom ?? null }));
  q.done = p.done || {};
  q.review = p.review || null;
  return q;
}
