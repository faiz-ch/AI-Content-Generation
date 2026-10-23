/*
 * Network layer.
 *  - Every call can go direct from the browser, through the app's own relay
 *    (Docker/nginx, Vercel rewrites, Vite dev) or through a custom proxy.
 *  - If one route fails at the network/relay level (e.g. Vercel 502
 *    ROUTER_EXTERNAL_TARGET_ERROR), the next route is tried automatically and
 *    the working route is remembered for the rest of the session.
 *  - Gemini answers are streamed, with thought summaries, so the connection is
 *    active from the first seconds and progress can be shown live.
 */
import { str } from './utils.js';
import { PROVIDERS } from './settings.js';

export const runtime = { relay: false, cspBlocked: '', preferred: {} };

if (typeof window !== 'undefined') {
  window.addEventListener('securitypolicyviolation', e => { runtime.cspBlocked = e.blockedURI || 'unknown'; });
}

/** Detects the built-in relay (Docker image, Vercel rewrites or the Vite dev server). */
export async function detectRelay() {
  if (location.protocol === 'file:') return (runtime.relay = false);
  try {
    const r = await fetch(new URL('relay-health', document.baseURI), { cache: 'no-store' });
    runtime.relay = r.ok && (await r.text()).trim() === 'ok';
  } catch { runtime.relay = false; }
  return runtime.relay;
}

const hostOf = url => { try { return new URL(url).host; } catch { return ''; } };
/** Ordered list of routes to try for this request. The route that last worked for this service goes first. */
function routeList(S, url) {
  const mode = S.connection || 'auto';
  let order;
  if (mode === 'custom' && str(S.proxyUrl)) order = ['custom', 'direct'];
  else if (mode === 'direct') order = ['direct', 'relay'];
  else if (mode === 'relay') order = ['relay', 'direct'];
  else order = [url ? runtime.preferred[hostOf(url)] : '', 'relay', 'direct'];
  return [...new Set(order.filter(Boolean))].filter(r => r !== 'relay' || runtime.relay);
}
export const connectionRoute = (S, url) => routeList(S, url)[0] || 'direct';

function routeUrl(S, url, route) {
  if (route === 'custom') return str(S.proxyUrl).replace(/\/+$/, '') + '/?target=' + encodeURIComponent(url);
  if (route === 'relay') { const u = new URL(url); return new URL(`relay/${u.host}${u.pathname}${u.search}`, document.baseURI).toString(); }
  return url;
}

function networkError(S, label, route) {
  const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
  if (runtime.cspBlocked || inFrame) {
    return `Could not reach ${label}: this page is running inside a preview window that blocks outside connections. Open the app in its own browser tab.`;
  }
  if (route === 'relay') return `The app's relay could not reach ${label}, and a direct connection also failed. Check your internet connection and try again.`;
  if (route === 'custom') return `Could not reach your proxy (${S.proxyUrl}). Check the proxy URL in Settings → Connection.`;
  return `Could not reach ${label}. The request was blocked before reaching ${label} — usually by the browser's cross-site rules (CORS), an ad-blocker/VPN, or the network.`;
}

async function toError(res, label) {
  const text = await res.text().catch(() => '');
  let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
  let msg = data && (data.error?.message || data.detail?.error || data.detail || data.error || data.message);
  if (msg && typeof msg !== 'string') msg = JSON.stringify(msg);
  if (!msg) msg = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200) || res.statusText;
  const hint = { 401: ' (check the key)', 403: ' (check the key or its permissions)', 429: ' (rate limit or quota reached — wait and retry)',
    432: ' (Tavily monthly credits used up)', 502: ' (the connection to the provider failed)', 504: ' (the provider took too long)' }[res.status] || '';
  const err = new Error(`${label} error ${res.status}${hint}: ${msg}`);
  err.status = res.status;
  return err;
}

/** Sends a request, falling back to the next route when a route fails at network/relay level. */
async function send(S, url, opts, label) {
  const routes = routeList(S, url);
  let lastErr;
  for (let k = 0; k < routes.length; k++) {
    const route = routes[k], last = k === routes.length - 1;
    let res;
    try { res = await fetch(routeUrl(S, url, route), opts); }
    catch (e) {
      if (e.name === 'AbortError') throw e;
      lastErr = Object.assign(new Error(networkError(S, label, route)), { network: true });
      continue;
    }
    if (res.ok) { if (k > 0) runtime.preferred[hostOf(url)] = route; return res; }
    const err = await toError(res, label);
    if (route !== 'direct' && [502, 504].includes(res.status) && !last) { lastErr = err; continue; }
    throw err;
  }
  throw lastErr || new Error(`Could not reach ${label}.`);
}

export async function http(S, url, opts, label) {
  const res = await send(S, url, opts, label);
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
}

/* ---------------- LLM ---------------- */
export const SYS = `You are a senior short-form video producer and prompt engineer for AI text-to-video tools such as Google Flow (Veo). Creators generate one short clip per prompt and join the clips into one continuous story.
Rules: respond with ONE valid JSON object only — no markdown, no code fences, no commentary. Keep content suitable for mainstream social platforms (no explicit, hateful or graphic content). Never use real celebrities, real public figures, brands, logos or copyrighted characters; invent original ones.`;

/** Reads a Gemini server-sent-events stream. Thought summaries are reported, never returned. */
async function readGeminiStream(res, onProgress) {
  let text = '', finish = '', block = '', buf = '', dataLines = [];
  let streamErr = null;
  const flush = () => {
    if (!dataLines.length) return;
    const raw = dataLines.join('\n'); dataLines = [];
    let d; try { d = JSON.parse(raw); } catch { return; }
    if (d.error) { streamErr = Object.assign(new Error(`Gemini error: ${d.error.message || 'stream failed'}`), { status: d.error.code || 0 }); return; }
    const c = d.candidates?.[0];
    for (const p of c?.content?.parts || []) {
      if (!p.text) continue;
      if (p.thought) onProgress?.({ phase: 'thinking', thought: p.text });
      else { text += p.text; onProgress?.({ phase: 'writing', chars: text.length }); }
    }
    if (c?.finishReason) finish = c.finishReason;
    if (d.promptFeedback?.blockReason) block = d.promptFeedback.blockReason;
  };
  const eat = chunk => {
    buf += chunk;
    const lines = buf.split(/\r?\n/);
    buf = lines.pop();
    for (const line of lines) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      else if (line === '') flush();
    }
  };
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader(), dec = new TextDecoder();
    for (;;) { const { value, done } = await reader.read(); if (done) break; eat(dec.decode(value, { stream: true })); }
    eat(dec.decode());
  } else eat(await res.text());
  eat('\n\n');
  flush();
  if (streamErr) throw streamErr;
  return { text, finish, block };
}

async function geminiCall(S, model, key, system, user, signal, thinking, onProgress) {
  const generationConfig = { responseMimeType: 'application/json', maxOutputTokens: 32768 };
  if (thinking) generationConfig.thinkingConfig = { thinkingLevel: thinking, includeThoughts: true };
  const res = await send(S, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal,
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig })
  }, 'Gemini');
  return readGeminiStream(res, onProgress);
}

/**
 * opts.thinking: 'low' | 'medium' | 'high' (Gemini 3 thinking level)
 * opts.onProgress({ phase: 'start'|'thinking'|'writing', model?, thought?, chars? })
 */
export async function llmRaw(S, system, user, signal, onNote, opts = {}) {
  const p = S.provider, key = str(S.keys[p]), model = str(S.models[p]);
  const { thinking = 'medium', onProgress } = opts;
  if (!key) throw new Error('No AI key set. Open Settings.');
  if (p === 'gemini') {
    const chain = [model || PROVIDERS.gemini.models[0], ...PROVIDERS.gemini.models.filter(m => m !== model)];
    let lastErr;
    for (const m of chain) {
      try {
        onProgress?.({ phase: 'start', model: m });
        let r;
        try { r = await geminiCall(S, m, key, system, user, signal, thinking, onProgress); }
        catch (e) {
          // Models that do not accept a thinking level (e.g. older ones) — retry with their defaults.
          if (e.status === 400 && /thinking/i.test(e.message)) r = await geminiCall(S, m, key, system, user, signal, null, onProgress);
          else throw e;
        }
        if (!r.text) { const e = new Error('Gemini returned no text (' + (r.finish || r.block || 'empty reply') + ')'); e.status = 0; throw e; }
        if (m !== model && onNote) onNote(`Model ${model} was unavailable — used ${m} instead.`);
        return r.text;
      } catch (e) {
        lastErr = e;
        if (e.name === 'AbortError' || ![404, 429, 500, 503].includes(e.status)) throw e;
      }
    }
    throw lastErr;
  }
  onProgress?.({ phase: 'start', model });
  if (p === 'claude') {
    const d = await http(S, 'https://api.anthropic.com/v1/messages', {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 16000, system, messages: [{ role: 'user', content: user }] })
    }, 'Claude');
    return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  }
  if (p === 'openai') {
    const d = await http(S, 'https://api.openai.com/v1/responses', {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, instructions: system, input: user, max_output_tokens: 16000 })
    }, 'OpenAI');
    if (typeof d.output_text === 'string' && d.output_text) return d.output_text;
    return (d.output || []).filter(o => o.type === 'message').flatMap(o => o.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('');
  }
  const base = str(S.compatBase).replace(/\/+$/, '');
  if (!base || !model) throw new Error('For the "Other" provider, enter the base URL and model name in Settings.');
  const d = await http(S, base + '/chat/completions', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
  }, 'AI provider');
  return d?.choices?.[0]?.message?.content || '';
}

export function extractJSON(t) {
  const s = str(t).replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const iO = s.indexOf('{'), iA = s.indexOf('[');
  const start = iO === -1 ? iA : iA === -1 ? iO : Math.min(iO, iA);
  if (start === -1) throw new Error('No JSON found');
  return JSON.parse(s.slice(start, s.lastIndexOf(s[start] === '{' ? '}' : ']') + 1));
}

export async function llmJSON(S, user, signal, onNote, opts) {
  const t = await llmRaw(S, SYS, user, signal, onNote, opts);
  try { return extractJSON(t); }
  catch {
    const t2 = await llmRaw(S, SYS, user + '\n\nIMPORTANT: your previous reply was not valid JSON. Reply again with ONLY one valid JSON object matching the schema.', signal, onNote, opts);
    try { return extractJSON(t2); } catch { throw new Error('The AI did not return valid data twice. Try again, or choose a stronger model in Settings.'); }
  }
}

/* ---------------- Tavily ---------------- */
export async function tavily(S, query, signal, extra = {}) {
  return http(S, 'https://api.tavily.com/search', {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + str(S.tavilyKey) },
    body: JSON.stringify({ query, search_depth: 'basic', max_results: 8, include_images: true, include_image_descriptions: true, include_usage: true, ...extra })
  }, 'Tavily');
}
