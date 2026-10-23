/*
 * Private profiles. Each profile's stories, settings and API keys are stored
 * encrypted (AES-GCM 256, key derived from the passcode with PBKDF2-SHA-256).
 * Nothing leaves the browser. A forgotten passcode cannot be recovered.
 */
import { LS, SS } from './storage.js';
import { uid } from './utils.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const ITERATIONS = 250000;
const PROFILES = 'fss_profiles';
const SESSION = 'fss_session';
const PLAIN = 'fss_plain';
const PLAIN_OK = 'fss_plain_ok';
const vaultKey = id => 'fss_vault_' + id;

export const secureAvailable = () =>
  typeof window !== 'undefined' && !!window.isSecureContext && !!window.crypto?.subtle;

function b64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function seal(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}
async function unseal(key, box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}
function write(k, v) {
  if (!LS.set(k, v)) throw new Error('Could not save: browser storage is full or blocked. Export and delete old stories, then try again.');
}

/* ---------- profiles ---------- */
export const listProfiles = () => LS.get(PROFILES, []);
const saveProfiles = list => write(PROFILES, list);
export function updateProfileMeta(id, patch) {
  saveProfiles(listProfiles().map(p => (p.id === id ? { ...p, ...patch } : p)));
}

export async function createProfile(name, pass, data) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(pass, salt);
  const profile = { id: uid(), name: String(name).trim(), salt: b64(salt), created: Date.now(), lastUsed: Date.now() };
  write(vaultKey(profile.id), await seal(key, data || {}));
  saveProfiles([...listProfiles(), profile]);
  return { profile, key };
}

export async function unlockProfile(profile, pass) {
  const key = await deriveKey(pass, unb64(profile.salt));
  const box = LS.get(vaultKey(profile.id), null);
  if (!box) return { key, data: {} };
  try { return { key, data: await unseal(key, box) }; }
  catch { const e = new Error('Wrong passcode.'); e.code = 'WRONG'; throw e; }
}

export async function saveVault(profileId, key, data) {
  write(vaultKey(profileId), await seal(key, data));
}

export async function changePasscode(profile, newPass, data) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveKey(newPass, salt);
  const box = await seal(key, data);
  write(vaultKey(profile.id), box);
  updateProfileMeta(profile.id, { salt: b64(salt) });
  return { profile: { ...profile, salt: b64(salt) }, key };
}

export function deleteProfile(id) {
  LS.del(vaultKey(id));
  saveProfiles(listProfiles().filter(p => p.id !== id));
  const s = SS.get(SESSION, null);
  if (s && s.id === id) SS.del(SESSION);
}

/* ---------- tab session (survives reload, cleared when the tab closes or on Lock) ---------- */
export async function rememberSession(profileId, key) {
  const raw = await crypto.subtle.exportKey('raw', key);
  SS.set(SESSION, { id: profileId, k: b64(raw) });
}
export const clearSession = () => SS.del(SESSION);
export async function resumeSession() {
  const s = SS.get(SESSION, null);
  if (!s || !secureAvailable()) return null;
  const profile = listProfiles().find(p => p.id === s.id);
  if (!profile) { clearSession(); return null; }
  try {
    const key = await crypto.subtle.importKey('raw', unb64(s.k), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
    const box = LS.get(vaultKey(profile.id), null);
    return { profile, key, data: box ? await unseal(key, box) : {} };
  } catch { clearSession(); return null; }
}

/* ---------- data saved by earlier versions (unencrypted) ---------- */
export function legacyData() {
  const projects = LS.get('fss_projects', null);
  const prefs = LS.get('fss_prefs', null);
  const secrets = LS.get('fss_secrets', null) || SS.get('fss_secrets', null);
  if (!projects && !prefs && !secrets) return null;
  const settings = { ...(prefs || {}) };
  if (secrets) { settings.keys = secrets.keys; settings.tavilyKey = secrets.tavilyKey; }
  return { projects: projects || [], currentId: LS.get('fss_current', null), settings };
}
export function clearLegacy() {
  ['fss_projects', 'fss_current', 'fss_prefs', 'fss_secrets'].forEach(k => LS.del(k));
  SS.del('fss_secrets');
  for (const k of LS.keys()) if (k.startsWith('fss_trend_') || k.startsWith('fss_credits_')) LS.del(k);
}

/* ---------- unprotected mode (only when the page is not https/localhost) ---------- */
export const plainChosen = () => LS.get(PLAIN_OK, false) === true;
export const choosePlain = () => LS.set(PLAIN_OK, true);
export const loadPlain = () => LS.get(PLAIN, null);
export async function savePlain(data) { write(PLAIN, data); }
