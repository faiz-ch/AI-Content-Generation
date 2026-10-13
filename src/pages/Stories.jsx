import { useRef, useState } from 'react';
import { Plus, Upload, Download, Trash2, Pencil, Check, X, BookOpen, ArrowRight } from 'lucide-react';
import { useApp } from '../state/AppContext.jsx';
import { projectStage } from '../lib/settings.js';
import { timeAgo } from '../lib/utils.js';
import { PageHead, Empty } from '../components/ui.jsx';

function ProjectCard({ p, current }) {
  const { openProject, deleteProject, renameProject, exportProject } = useApp();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const st = projectStage(p);
  const done = p.clips?.filter((_, i) => p.done?.[i]).length || 0;
  const pct = p.clips?.length ? Math.round((done / p.clips.length) * 100) : [0, 25, 55, 80][st.step] || 0;
  const save = () => { renameProject(p.id, name); setEditing(false); };

  return (
    <article className={`pcard ${current ? 'current' : ''}`}>
      <div className="row between">
        <span className="badge accent">{st.label}</span>
        {current && <span className="badge ok">Open</span>}
      </div>
      {editing ? (
        <div className="rename">
          <input className="input" value={name} autoFocus onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }} aria-label="Story name" />
          <button className="btn sm" onClick={save} aria-label="Save name"><Check size={14} /></button>
          <button className="btn sm ghost" onClick={() => { setName(p.name); setEditing(false); }} aria-label="Cancel"><X size={14} /></button>
        </div>
      ) : <h3>{p.name}</h3>}
      <p className="small muted">{p.genre?.name || 'No genre yet'}{p.story?.data ? ` · ${p.story.data.parts.length} clips` : ''} · updated {timeAgo(p.updated)}</p>
      <div className="progress"><div style={{ width: `${pct}%` }} /></div>
      <div className="row" style={{ marginTop: 4 }}>
        <button className="btn sm primary" onClick={() => openProject(p.id, st.key)}>Open <ArrowRight size={14} /></button>
        <button className="btn sm ghost" onClick={() => setEditing(true)} aria-label="Rename"><Pencil size={14} /></button>
        <button className="btn sm ghost" onClick={() => exportProject(p.id)} aria-label="Export"><Download size={14} /></button>
        <button className="btn sm ghost danger" onClick={() => window.confirm(`Delete “${p.name}” permanently?`) && deleteProject(p.id)} aria-label="Delete"><Trash2 size={14} /></button>
      </div>
    </article>
  );
}

export default function Stories() {
  const { projects, P, createProject, importProject, nav } = useApp();
  const fileRef = useRef(null);
  const list = [...projects].sort((a, b) => b.updated - a.updated);

  return (
    <div className="stack">
      <PageHead title="My Stories" sub="Every story is saved in this browser. Export to keep a backup or move to another device.">
        <button className="btn" onClick={() => fileRef.current?.click()}><Upload size={16} /> Import</button>
        <button className="btn primary" onClick={createProject}><Plus size={16} /> New story</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files[0]; e.target.value = ''; if (f) importProject(f).then(() => nav('stories')); }} />
      </PageHead>
      {list.length ? (
        <div className="recent">{list.map(p => <ProjectCard key={p.id + p.updated} p={p} current={p.id === P.id} />)}</div>
      ) : (
        <div className="panel"><Empty icon={BookOpen} title="No stories yet">
          <button className="btn primary" onClick={createProject}><Plus size={16} /> Start a new story</button>
        </Empty></div>
      )}
    </div>
  );
}
