/*
 * Network layer: routes every provider call directly, through the built-in
 * same-origin relay (Docker/nginx or Vite dev), or through a custom proxy.
 */
import { str } from './utils.js';
import { PROVIDERS } from './settings.js';

export const runtime = { relay: false, cspBlocked: '' };

if (typeof window !== 'undefined') {
  window.addEventListener('securitypolicyviolation', e => { runtime.cspBlocked = e.blockedURI || 'unknown'; });
}

/** Detects the built-in relay served by the Docker image (or the Vite dev server). */
export async function detectRelay() {
  if (location.protocol === 'file:') return (runtime.relay = false);
  try {
    const r = await fetch(new URL('relay-health', document.baseURI), { cache: 'no-store' });
    runtime.relay = r.ok && (await r.text()).trim() === 'ok';
  } catch { runtime.relay = false; }
  return runtime.relay;
}

export function connectionRoute(S) {
  const mode = S.connection || 'auto';
  if (mode === 'custom' && str(S.proxyUrl)) return 'custom';
  if (mode === 'relay' || (mode === 'auto' && runtime.relay)) return 'relay';
  return 'direct';
}
function routeUrl(S, url) {
  const route = connectionRoute(S);
  if (route === 'custom') return str(S.proxyUrl).replace(/\/+$/, '') + '/?target=' + encodeURIComponent(url);
  if (route === 'relay') { const u = new URL(url); return new URL(`relay/${u.host}${u.pathname}${u.search}`, document.baseURI).toString(); }
  return url;
}

function networkError(S, label) {
  const route = connectionRoute(S);
  const inFrame = (() => { try { return window.self !== window.top; } catch { return true; } })();
  if (runtime.cspBlocked || inFrame) {
    return `Could not reach ${label}: this page is running inside a preview window that blocks outside connections. Open the app in its own browser tab (for example http://localhost:8080 when using Docker).`;
  }
  if (route === 'relay') return `The built-in relay could not reach ${label}. Check that the computer or server running Docker has internet access.`;
  if (route === 'custom') return `Could not reach your proxy (${S.proxyUrl}). Check the proxy URL in Settings → Connection.`;
  const tip = runtime.relay ? 'Switch Settings → Connection to "Built-in relay".' : 'Run the app with Docker (it includes a built-in relay), or set a proxy in Settings → Connection.';
  return `Could not reach ${label}. The request was blocked before reaching ${label} — usually by the browser's cross-site rules (CORS), an ad-blocker/VPN, or the network. ${tip}`;
}

export async function http(S, url, opts, label) {
  let res;
  try { res = await fetch(routeUrl(S, url), opts); }
  catch (e) { if (e.name === 'AbortError') throw e; const err = new Error(networkError(S, label)); err.network = true; throw err; }
  const text = await res.text();
  let data = null; try { data = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    let msg = data && (data.error?.message || data.detail?.error || data.detail || data.error || data.message);
    if (msg && typeof msg !== 'string') msg = JSON.stringify(msg);
    if (!msg) msg = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 200) || res.statusText;
    const hint = { 400: '', 401: ' (check the key)', 403: ' (check the key or its permissions)', 429: ' (rate limit or quota reached — wait and retry)',
      432: ' (Tavily monthly credits used up)', 502: ' (relay could not reach the provider)', 504: ' (provider took too long)' }[res.status] || '';
    const err = new Error(`${label} error ${res.status}${hint}: ${msg}`); err.status = res.status; throw err;
  }
  return data ?? text;
}

/* ---------------- LLM ---------------- */
export const SYS = `You are a senior short-form video producer and prompt engineer for AI text-to-video tools such as Google Flow (Veo). Creators generate one short clip per prompt and join the clips into one continuous story.
Rules: respond with ONE valid JSON object only — no markdown, no code fences, no commentary. Keep content suitable for mainstream social platforms (no explicit, hateful or graphic content). Never use real celebrities, real public figures, brands, logos or copyrighted characters; invent original ones.`;

export async function llmRaw(S, system, user, signal, onNote) {
  const p = S.provider, key = str(S.keys[p]), model = str(S.models[p]);
  if (!key) throw new Error('No AI key set. Open Settings.');
  if (p === 'gemini') {
    const chain = [model || PROVIDERS.gemini.models[0], ...PROVIDERS.gemini.models.filter(m => m !== model)];
    let lastErr;
    for (const m of chain) {
      try {
        const d = await http(S, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, signal,
          body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 32768 } })
        }, 'Gemini');
        const cand = d?.candidates?.[0];
        const t = (cand?.content?.parts || []).filter(x => !x.thought && x.text).map(x => x.text).join('');
        if (!t) { const e = new Error('Gemini returned no text (' + (cand?.finishReason || d?.promptFeedback?.blockReason || 'empty reply') + ')'); e.status = 0; throw e; }
        if (m !== model && onNote) onNote(`Model ${model} was unavailable — used ${m} instead.`);
        return t;
      } catch (e) {
        lastErr = e;
        if (e.name === 'AbortError' || ![404, 429, 500, 503].includes(e.status)) throw e;
      }
    }
    throw lastErr;
  }
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

export async function llmJSON(S, user, signal, onNote) {
  const t = await llmRaw(S, SYS, user, signal, onNote);
  try { return extractJSON(t); }
  catch {
    const t2 = await llmRaw(S, SYS, user + '\n\nIMPORTANT: your previous reply was not valid JSON. Reply again with ONLY one valid JSON object matching the schema.', signal, onNote);
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
