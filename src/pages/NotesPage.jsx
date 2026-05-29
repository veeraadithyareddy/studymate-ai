import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── NOTES PAGE ───────────────────────────────────────────────────────────────
function NotesPage() {
  const [notes, setNotes] = useState(() => { try { return JSON.parse(localStorage.getItem("smai_notes")||"[]"); } catch { return []; } });
  const [active, setActive] = useState(null); const [title, setTitle] = useState(""); const [content, setContent] = useState("");
  const save = (u) => { setNotes(u); localStorage.setItem("smai_notes", JSON.stringify(u)); };
  const saveNote = () => {
    if (!title.trim()) return;
    const note = { id:Date.now(), title, content, date:nowStr() };
    save(active ? notes.map(n => n.id===active?{...n,title,content}:n) : [...notes, note]);
    if (!active) setActive(note.id);
  };
  const open = (n) => { setActive(n.id); setTitle(n.title); setContent(n.content); };
  const del = (id) => { save(notes.filter(n => n.id!==id)); if (active===id) { setActive(null); setTitle(""); setContent(""); } };
  return (
    <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:14, minHeight:500 }}>
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        <div style={{ padding:"11px 13px", borderBottom:"1px solid #e5e7eb", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <span style={{ fontSize:12, fontWeight:700, fontFamily:"'DM Mono',monospace", color:"#111827" }}>Notes</span>
          <button onClick={() => { setActive(null); setTitle(""); setContent(""); }} style={{ background:"#7c3aed", border:"none", color:"#fff", borderRadius:6, width:22, height:22, fontSize:15, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {notes.length===0 && <p style={{ fontSize:12, color:"#9ca3af", padding:"12px", fontFamily:"'DM Mono',monospace" }}>No notes yet</p>}
          {notes.map(n => <div key={n.id} onClick={() => open(n)} style={{ padding:"9px 12px", borderBottom:"1px solid #f3f4f6", cursor:"pointer", background:active===n.id?"#fdf4ff":"transparent", borderLeft:active===n.id?"3px solid #7c3aed":"3px solid transparent" }}>
            <div style={{ fontSize:12, fontWeight:600, color:"#111827", fontFamily:"'DM Mono',monospace", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{n.title}</div>
            <div style={{ fontSize:10, color:"#9ca3af", marginTop:1 }}>{n.date}</div>
          </div>)}
        </div>
      </div>
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px", display:"flex", flexDirection:"column", gap:9 }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Note title..." style={{ padding:"9px 13px", border:"1.5px solid #e5e7eb", borderRadius:9, fontSize:14, fontWeight:700, outline:"none", color:"#111827", fontFamily:"'DM Mono',monospace" }} onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"} />
        <textarea value={content} onChange={e => setContent(e.target.value)} placeholder="Write your notes here..." style={{ flex:1, padding:"11px 13px", border:"1.5px solid #e5e7eb", borderRadius:9, fontSize:14, outline:"none", resize:"none", color:"#111827", lineHeight:1.7, minHeight:300 }} onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"} />
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={saveNote} style={{ padding:"8px 18px", background:"#7c3aed", border:"none", borderRadius:8, color:"#fff", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>Save</button>
          {active && <button onClick={() => del(active)} style={{ padding:"8px 12px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, color:"#dc2626", fontSize:13, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>Delete</button>}
        </div>
      </div>
    </div>
  );
}


export default NotesPage;
