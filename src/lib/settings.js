import { LS, SS } from './storage.js';
import { clone, uid } from './utils.js';

export const PROVIDERS = {
  gemini: { label: 'Google Gemini', badge: 'Free tier', free: true, keyUrl: 'https://aistudio.google.com/apikey',
    models: ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-flash-latest'],
    note: 'Recommended. Free key from Google AI Studio.' },
  claude: { label: 'Anthropic Claude', badge: 'Paid', keyUrl: 'https://console.anthropic.com/settings/keys',
    models: ['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'], note: 'Strong story writing. Pay per use.' },
  openai: { label: 'OpenAI', badge: 'Paid', keyUrl: 'https://platform.openai.com/api-keys',
    models: ['gpt-6.1-sol', 'gpt-6-luna', 'gpt-6-astra'], note: 'Pay per use.' },
  compat: { label: 'Other (OpenAI-compatible)', badge: 'Varies', keyUrl: '', models: [],
    note: 'DeepSeek, Groq, OpenRouter and similar. Enter base URL and model name.' }
};
export const COMPAT_BASES = ['https://api.deepseek.com', 'https://api.groq.com/openai/v1', 'https://openrouter.ai/api/v1'];
export const FLOW_URL = 'https://flow.google.com/';

export const DEFAULT_SETTINGS = {
  provider: 'gemini',
  keys: { gemini: '', claude: '', openai: '', compat: '' },
  models: { gemini: PROVIDERS.gemini.models[0], claude: PROVIDERS.claude.models[0], openai: PROVIDERS.openai.models[0], compat: '' },
  compatBase: '', tavilyKey: '', connection: 'auto', proxyUrl: '', clipSeconds: 10, storage: 'local',
  aiOk: false, aiTested: false, tavilyOk: null, theme: 'light', displayName: ''
};

export function loadSettings() {
  const prefs = LS.get('fss_prefs', {});
  const s = Object.assign(clone(DEFAULT_SETTINGS), prefs);
  s.models = Object.assign({}, DEFAULT_SETTINGS.models, prefs.models || {});
  const sec = (s.storage === 'session' ? SS : LS).get('fss_secrets', {});
  s.keys = Object.assign({}, DEFAULT_SETTINGS.keys, sec.keys || {});
  s.tavilyKey = sec.tavilyKey || '';
  return s;
}
export function saveSettings(S) {
  const { keys, tavilyKey, ...prefs } = S;
  LS.set('fss_prefs', prefs);
  const target = S.storage === 'session' ? SS : LS;
  const other = S.storage === 'session' ? LS : SS;
  target.set('fss_secrets', { keys, tavilyKey });
  other.del('fss_secrets');
}

export const ALL_PLATFORMS = ['TikTok', 'YouTube Shorts', 'Instagram Reels', 'Facebook Reels'];
export function newProject() {
  return {
    id: uid(), name: 'Untitled story', created: Date.now(), updated: Date.now(),
    discover: { mode: 'open', ownGenre: '', pre: { platforms: ALL_PLATFORMS.slice(), audience: 'Any', language: 'Any', recency: 'month' },
      post: { platform: 'All', audience: 'All', strength: 'All', q: '' }, cards: [], round: 0, source: '', searchedAt: 0 },
    genre: null,
    story: { settings: { totalSeconds: 30, aspect: '9:16', dialogue: 'narration', language: 'English', languageOther: '' },
      idea: '', ideas: [], data: null, locked: false },
    clips: [], done: {}
  };
}
export const loadProjects = () => LS.get('fss_projects', []);
export const saveProjects = list => LS.set('fss_projects', list);

export function projectStage(p) {
  if (p.story?.locked && p.clips?.length) {
    const done = p.clips.filter((_, i) => p.done?.[i]).length;
    return { key: 'prompts', label: done === p.clips.length ? 'Completed' : `Prompts · ${done}/${p.clips.length} done`, step: 3 };
  }
  if (p.story?.data) return { key: 'story', label: 'Story draft', step: 2 };
  if (p.genre) return { key: 'story', label: 'Genre chosen', step: 1 };
  return { key: 'trending', label: 'Choose a genre', step: 0 };
}
