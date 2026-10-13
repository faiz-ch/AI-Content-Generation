import { ArrowRight, Flame, PenLine, Clapperboard, Share2, Play, Sparkles, Clock, KeyRound, ChevronRight } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { FLOW_URL, projectStage } from '../lib/settings.js';
import { Notice } from '../components/ui.jsx';
import { timeAgo } from '../lib/utils.js';

function SceneSunset() {
  return (
    <svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sk1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB38A" /><stop offset=".55" stopColor="#FF8FB1" /><stop offset="1" stopColor="#B69CFF" /></linearGradient>
        <linearGradient id="m1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7D5BD8" /><stop offset="1" stopColor="#4B3A9E" /></linearGradient>
      </defs>
      <rect width="200" height="130" fill="url(#sk1)" />
      <circle cx="132" cy="62" r="22" fill="#FFE6A8" opacity=".95" />
      <path d="M0 96 L40 60 L70 86 L104 50 L140 88 L170 66 L200 84 L200 130 L0 130Z" fill="url(#m1)" opacity=".75" />
      <path d="M0 110 L34 88 L66 104 L100 80 L138 106 L176 90 L200 100 L200 130 L0 130Z" fill="#3A2C80" />
    </svg>
  );
}
function SceneCastle() {
  return (
    <svg viewBox="0 0 200 130" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="sk2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1E2A6B" /><stop offset="1" stopColor="#6B57D6" /></linearGradient></defs>
      <rect width="200" height="130" fill="url(#sk2)" />
      {[[20, 18], [48, 34], [76, 12], [150, 22], [176, 40], [120, 10], [96, 30]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.3" fill="#fff" opacity=".85" />)}
      <circle cx="154" cy="40" r="15" fill="#F4F1FF" /><circle cx="160" cy="36" r="13" fill="#2A3480" opacity=".55" />
      <path d="M58 130 V78 h10 v-12 h6 v12 h10 V64 l8-14 8 14 v14 h10 v-12 h6 v12 h10 v52Z" fill="#14194A" />
      <rect x="94" y="84" width="6" height="9" rx="3" fill="#FFD27A" /><rect x="72" y="92" width="5" height="7" rx="2.5" fill="#FFD27A" opacity=".8" />
      <path d="M0 118 Q50 104 100 116 T200 112 V130 H0Z" fill="#0E1238" />
    </svg>
  );
}
function SceneCoast() {
  return (
    <svg viewBox="0 0 240 150" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="sk3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#C9D8FF" /><stop offset=".6" stopColor="#E9DBFF" /><stop offset="1" stopColor="#FFD9EA" /></linearGradient>
        <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7C8CF8" /><stop offset="1" stopColor="#4D55C9" /></linearGradient>
      </defs>
      <rect width="240" height="150" fill="url(#sk3)" />
      <circle cx="70" cy="58" r="18" fill="#FFF3D6" opacity=".9" />
      <path d="M0 92 H240 V150 H0Z" fill="url(#sea)" />
      <path d="M0 98 Q30 94 60 98 T120 98 T180 98 T240 98" stroke="#fff" strokeOpacity=".35" fill="none" />
      <path d="M150 150 L150 82 Q170 60 200 64 Q226 66 240 78 L240 150Z" fill="#2E2F7A" />
      <path d="M186 64 l3 -10 l3 10" fill="#2E2F7A" />
      <path d="M100 40 q4 -4 8 0 q4 -4 8 0" stroke="#5B4BFF" strokeWidth="1.6" fill="none" />
      <path d="M124 30 q3 -3 6 0 q3 -3 6 0" stroke="#5B4BFF" strokeWidth="1.4" fill="none" opacity=".7" />
    </svg>
  );
}

const FEATURES = [
  { key: 'trending', title: 'Trending Genres', desc: "Discover what's hot in AI video", icon: Flame, cls: 'blue' },
  { key: 'story', title: 'Write Your Story', desc: 'Turn your ideas into a script', icon: PenLine, cls: 'lav' },
  { key: 'prompts', title: 'Get Clip Prompts', desc: '10s prompts, ready for Flow', icon: Clapperboard, cls: 'pink' },
  { key: 'share', title: 'Create & Share', desc: 'Bring your story to life', icon: Share2, cls: 'purple' }
];
const STEPS = [
  { t: 'Choose Genre', s: 'Pick a trending format' },
  { t: 'Write Story', s: 'Idea → story parts' },
  { t: 'Get Clip Prompts', s: 'One prompt per clip' },
  { t: 'Generate Video', s: 'Paste into Flow' }
];

export default function Home() {
  const { nav, P, S, projects, openProject } = useApp();
  const stage = projectStage(P).step;
  const hasClips = P.story.locked && P.clips.length > 0;
  const allDone = hasClips && P.clips.every((_, i) => P.done[i]);
  const active = allDone ? 3 : stage;

  const openFeature = k => {
    if (k === 'share') nav(hasClips ? 'prompts' : 'stories');
    else nav(k);
  };
  const openStep = i => {
    if (i === 0) nav('trending');
    else if (i === 1) nav(P.genre ? 'story' : 'trending');
    else if (i === 2) nav(hasClips ? 'prompts' : P.genre ? 'story' : 'trending');
    else window.open(FLOW_URL, '_blank', 'noopener');
  };
  const recent = projects.filter(p => p.id !== P.id && (p.genre || p.story?.data)).slice(0, 3);

  return (
    <div className="stack">
      {!S.aiOk && (
        <Notice kind="info">
          <div className="row between" style={{ width: '100%' }}>
            <span><b>Connect your AI key to get started.</b> A free Google Gemini key is enough.</span>
            <button className="btn sm primary" onClick={() => nav('settings')}><KeyRound size={15} /> Connect key</button>
          </div>
        </Notice>
      )}

      <section className="hero">
        <div className="hero-copy">
          <span className="badge accent" style={{ marginBottom: 14 }}><Sparkles size={13} /> AI video story studio</span>
          <h1>Turn Your Ideas Into<br /><span>AI Video Stories</span></h1>
          <p>Find trending AI video genres, write a story, and get continuous 10-second clip prompts for Google Flow.</p>
          <button className="btn primary lg" onClick={() => nav('trending')}>Explore Trending Genres <ArrowRight size={18} /></button>
        </div>
        <div className="hero-art" aria-hidden="false">
          <div className="shot a"><SceneSunset /></div>
          <div className="shot b"><SceneCastle /></div>
          <div className="shot c"><SceneCoast /></div>
          <a className="play" href={FLOW_URL} target="_blank" rel="noopener noreferrer" aria-label="Open Google Flow in a new tab" title="Open Google Flow"><Play size={24} fill="currentColor" /></a>
          <div className="chip-float t"><Flame size={14} color="#E0457B" /> Trending now</div>
          <div className="chip-float b"><Clock size={14} color="#5B4BFF" /> 10s clips</div>
        </div>
      </section>

      <section className="features" aria-label="Features">
        {FEATURES.map(f => (
          <button key={f.key} className="feature" onClick={() => openFeature(f.key)}>
            <div className={`ic ${f.cls}`}><f.icon size={21} /></div>
            <h3>{f.title}</h3>
            <p>{f.desc}</p>
            <ChevronRight className="go" size={18} />
          </button>
        ))}
      </section>

      <section className="panel quick" aria-label="Quick start">
        <div className="section-title">
          <h2>Quick Start</h2>
          <span className="small muted">{P.genre ? <>Current story: <b style={{ color: 'var(--ink)' }}>{P.name}</b></> : 'Four steps from idea to video'}</span>
        </div>
        <div className="steps">
          {STEPS.map((st, i) => (
            <button key={st.t} className={`step ${i === active ? 'active' : i < active ? 'done' : ''}`} onClick={() => openStep(i)}>
              <span className="num">{i + 1}</span>
              <span className="txt"><span className="t">{st.t}</span><span className="s">{st.s}</span></span>
            </button>
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section>
          <div className="section-title"><h2>Continue a story</h2><button className="btn sm ghost" onClick={() => nav('stories')}>All stories <ArrowRight size={15} /></button></div>
          <div className="recent">
            {recent.map(p => {
              const st = projectStage(p);
              return (
                <button key={p.id} className="feature" onClick={() => openProject(p.id, st.key)}>
                  <h3>{p.name}</h3>
                  <p>{p.genre?.name || 'No genre yet'} · {timeAgo(p.updated)}</p>
                  <span className="badge accent" style={{ alignSelf: 'flex-start', marginTop: 6 }}>{st.label}</span>
                  <ChevronRight className="go" size={18} />
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
