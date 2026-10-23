import { uid } from './utils.js';

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
  compatBase: '', tavilyKey: '', connection: 'auto', proxyUrl: '', clipSeconds: 10,
  aiOk: false, aiTested: false, tavilyOk: null, theme: 'light', autoLock: 30
};

export const ALL_PLATFORMS = ['TikTok', 'YouTube Shorts', 'Instagram Reels', 'Facebook Reels'];

/** Discovery is shared across all stories of a profile. */
export function newDiscover() {
  return {
    mode: 'open', description: '', plan: null, queriesUsed: [],
    pre: { platforms: ALL_PLATFORMS.slice(), audience: 'Any', language: 'Any', recency: 'month' },
    post: { platform: 'All', audience: 'All', strength: 'All', q: '' },
    cards: [], round: 0, source: '', searchedAt: 0
  };
}

/** A story is only saved once it has a genre. */
export function newProject() {
  return {
    id: uid(), name: 'Untitled story', created: Date.now(), updated: Date.now(), genre: null,
    story: {
      settings: { length: 'short', aspect: '9:16', dialogue: 'narration', voices: 'natural', language: 'English', languageOther: '', research: true },
      idea: '', ideas: [], data: null, master: null, locked: false
    },
    clips: [], done: {}, review: null
  };
}
export const isMeaningful = p => !!(p && (p.genre || p.story?.data));

export function projectStage(p) {
  const parts = p.story?.data?.parts?.length || 0;
  if (p.story?.locked && p.clips?.length) {
    if (p.clips.length < parts) return { key: 'prompts', label: `Prompts · ${p.clips.length}/${parts} planned`, step: 2 };
    const done = p.clips.filter((_, i) => p.done?.[i]).length;
    return { key: 'prompts', label: done === p.clips.length ? 'Completed' : `Prompts · ${done}/${p.clips.length} done`, step: done === p.clips.length ? 3 : 2 };
  }
  if (p.story?.data) return { key: 'story', label: 'Story draft', step: 1 };
  if (p.genre) return { key: 'story', label: 'Genre chosen', step: 1 };
  return { key: 'trending', label: 'Choose a genre', step: 0 };
}
