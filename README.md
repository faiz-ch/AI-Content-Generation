# Flow Story Studio (React)

Find trending AI video genres, write a story, and get continuous clip prompts for Google Flow
(one prompt = one 10-second clip by default).

React + Vite frontend, served by nginx in Docker. The container also includes a **built-in relay**
so the browser never calls Gemini, Tavily, Claude or OpenAI cross-site. This fixes the
"Could not reach Gemini … (CORS)" error that the single-file version could hit.

## Run with Docker (recommended)

Requirements: Docker Desktop (Windows/macOS) or Docker Engine (Linux).

```bash
cd flow-story-studio
docker compose up -d --build
```

Open **http://localhost:8080** in Chrome or Edge (in its own tab, not inside a preview window).

Useful commands:

| Task | Command |
|---|---|
| Stop | `docker compose down` |
| View logs | `docker compose logs -f` |
| Rebuild after changing code | `docker compose up -d --build` |
| Use another port (e.g. 3000) | change `"8080:8080"` to `"3000:8080"` in `docker-compose.yml` |

Without Compose:

```bash
docker build -t flow-story-studio .
docker run -d --name flow-story-studio -p 8080:8080 --restart unless-stopped flow-story-studio
```

## First use

1. Open **Settings**, choose **Google Gemini** (free) and paste your key from aistudio.google.com/apikey.
2. Optional: paste a Tavily key (app.tavily.com, free 1,000 credits/month) for live trend search.
3. Click **Save & continue**. Under **Connection**, "Built-in relay: Available" confirms the Docker relay is active.

## How the built-in relay works

```
Browser ──► http://localhost:8080/relay/generativelanguage.googleapis.com/...  (same origin, no CORS)
                 nginx ──► https://generativelanguage.googleapis.com/...
```

- Only these hosts are allowed: `api.tavily.com`, `generativelanguage.googleapis.com`, `api.anthropic.com`,
  `api.openai.com`, `api.deepseek.com`, `api.groq.com`, `openrouter.ai`. Anything else returns 403.
- It stores nothing. Each user's key travels inside their own request.
- Settings → Connection lets you choose **Automatic** (default: relay when available, otherwise direct),
  **Direct**, **Built-in relay**, or a **Custom proxy URL**.
- The relay resolves those hosts with the DNS servers in `NGINX_RESOLVER` (default `1.1.1.1 8.8.8.8`).
  If your network blocks them, set your own in `docker-compose.yml`.
- If you put this on a public server, anyone who can open the page can use the relay with their own keys.
  For a private install, keep it on localhost or behind your company network/VPN.

## Develop without Docker

Requires Node.js 20.19+ or 22+.

```bash
npm install
npm run dev        # http://localhost:5173 — includes the same relay for development
npm run build      # production files in dist/
```

`dist/` can also be hosted on any static host (GitHub Pages, Netlify). There is no relay there,
so the app connects directly from the browser.

## Features

| Area | What it does |
|---|---|
| Private profiles | Each person creates a profile with a passcode. Stories, settings and API keys are encrypted (AES-256-GCM, key from the passcode via PBKDF2) and only visible after unlocking. Lock button, auto-lock when idle, change passcode, delete profile. A new browser tab always starts locked. A forgotten passcode cannot be recovered — export backups. |
| Trending Genres | "All trends", or **Describe what I want**: write the kind of content you want in your own words; the AI interprets it, plans the web searches, and shows how it understood you. Filters before and after search, duplicates merged, 24 h cache, "Find more", 16 built-in genres, or use your description directly as the genre. |
| Genre | Details, sources, editable genre master prompt. |
| Story | Choose **Short** (Reels/TikTok/Shorts) or **Long** (YouTube, several minutes). The AI researches similar stories (optional), develops 3 storylines, picks the strongest hook/suspense/ending, **decides how many clips the story needs**, and writes it start to finish. Edit, insert, delete or AI-rewrite parts; set each part's transition, location, time of day and weather; switch to another storyline; rewrite the whole story. |
| Finalize | The characters, locations, style and a **story-specific master prompt** are rebuilt from the final story, then every clip is planned. |
| Clip Prompts | Each clip has a START frame, timed ACTION beats and an END frame. "Continues" clips start exactly on the previous END frame (copied by code); "New scene" clips change place or time. Automatic checks plus an AI continuity review fix contradictions. Long stories are planned in batches and can be continued if interrupted. Copy, edit, undo, regenerate one clip, mark done, export .txt/.json. |
| Voices | Every character has an age and a voice that must fit it; the narrator has its own voice. In prompts, each character's voice sits next to their looks, and every spoken line names whose voice it is. Choose **Match each character's real age** (default; a baby voice that sounds adult is automatically replaced with a child voice) or **Comedy** (mismatched voices allowed). |
| Speed & reliability | Gemini answers are streamed with live "thinking" progress on screen. If the relay fails (e.g. Vercel 502), the app retries with a direct connection automatically and remembers which route works for each service. Thinking levels: high for the story outline and the continuity review, medium elsewhere, low only for the key test. |
| My Stories | Open, rename, export, import, delete. |

## Default models (verified 13 Oct 2026)

| Provider | Default | Alternatives |
|---|---|---|
| Gemini | `gemini-3.8-flash` | `gemini-3.6-flash`, `gemini-3.5-flash-lite`, `gemini-flash-latest` |
| Claude | `claude-sonnet-5-5` | `claude-haiku-5-5`, `claude-opus-5-5` |
| OpenAI | `gpt-6.1-sol` | `gpt-6-luna`, `gpt-6-astra` |

If the selected Gemini model is unavailable, the next one is tried automatically.

## Project structure

```
Dockerfile                  multi-stage build: Node builds, nginx serves
docker-compose.yml
nginx/default.conf.template site + /relay + /relay-health
vite.config.js              Vite config + dev relay
src/
  lib/       api.js (network, LLM, Tavily) · prompts.js (prompt builders, clip assembly)
             genres.js · settings.js · storage.js · utils.js
  state/     AppContext.jsx (state, routing, all actions)
  components/ Shell.jsx (sidebar + header) · ui.jsx
  pages/     Home · Trending · Genre · Story · Prompts · Stories · Settings
  styles.css design system
```

## Troubleshooting

| Message | Meaning / fix |
|---|---|
| "…running inside a preview window…" | Open the app in its own browser tab. |
| "The built-in relay could not reach Gemini" | The machine running Docker has no internet or DNS is blocked. Check `NGINX_RESOLVER`. |
| "Gemini error 400 … API key not valid" | The request reached Google; the key is wrong. Create a new key. |
| "error 429" | Rate limit or free quota reached. Wait and retry. |
| "Tavily error 432" | Tavily monthly credits used up. |

Stories and keys are stored encrypted in the browser, per profile. Use **My Stories → Export** for backups.

Private profiles need a secure address (https, or http://localhost). If the Docker app is opened by its network IP over plain http, the app offers an unprotected mode instead.
