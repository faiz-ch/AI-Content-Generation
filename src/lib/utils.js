export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
export const arr = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
export const str = v => (v == null ? '' : String(v)).trim();
export const clone = o => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));
export const monthYear = () => new Date().toLocaleString('en', { month: 'long', year: 'numeric' });
export const today = () => new Date().toISOString().slice(0, 10);
export const hashStr = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
export const wordCount = s => str(s).split(/\s+/).filter(Boolean).length;
export const endDot = s => { s = str(s); return s && !/[.!?…。]$/.test(s) ? s + '.' : s; };
export const fmtT = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const fmtDur = s => (s >= 60 ? `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}` : `${s} s`);
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const safeName = s => str(s).replace(/[^\w-]+/g, '_').slice(0, 60) || 'project';
export const timeAgo = ts => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString();
};

export function getPath(o, path) { return path.split('.').reduce((a, k) => (a == null ? a : a[k]), o); }
export function setPath(o, path, val) {
  const ks = path.split('.'); let cur = o;
  for (let i = 0; i < ks.length - 1; i++) { if (cur[ks[i]] == null) cur[ks[i]] = {}; cur = cur[ks[i]]; }
  cur[ks[ks.length - 1]] = val;
}

export function download(name, text, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove(); return ok;
  }
}
