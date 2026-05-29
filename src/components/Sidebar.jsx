import { useState, useRef, useEffect, useCallback, createContext, useContext, useMemo } from "react";
import { AppContext, useApp } from "../context/AppContext";

// ─── NAV ──────────────────────────────────────────────────────────────────────
// NAV_GROUPS — grouped navigation with collapsible dropdowns
const NAV_GROUPS = [
  {
    id:"core", icon:"⌂", label:"Home", type:"single", page:"home"
  },
  {
    id:"core2", icon:"◈", label:"Dashboard", type:"single", page:"dashboard"
  },
  {
    id:"aitools", icon:"🤖", label:"AI Tools", type:"group",
    color:"#7c3aed",
    items:[
      { id:"mindmap",       icon:"◉",  label:"Mind Map" },
      { id:"viva",          icon:"🎤", label:"Viva Practice" },
      { id:"adaptive",      icon:"🧠", label:"Adaptive AI" },
      { id:"explainer",     icon:"👨‍🏫", label:"AI Teacher" },
      { id:"explainervideo",icon:"🎬", label:"Explainer Video" },
      { id:"reel",          icon:"🎥", label:"Auto Reel" },
      { id:"infographic",   icon:"🖼️", label:"Infographic" },
      { id:"story",         icon:"🗺️", label:"Story Mode" },
      { id:"debate",        icon:"🎭", label:"Debate Mode" },
    ]
  },
  {
    id:"studytools", icon:"📚", label:"Study Tools", type:"group",
    color:"#2563eb",
    items:[
      { id:"pomodoro",  icon:"◷", label:"Pomodoro" },
      { id:"planner",   icon:"▦", label:"Planner" },
      { id:"notes",     icon:"✎", label:"Notes" },
      { id:"music",     icon:"🎵", label:"Study Music" },
    ]
  },
  {
    id:"games", icon:"🎮", label:"Games & Quizzes", type:"group",
    color:"#16a34a",
    items:[
      { id:"multiplayer",   icon:"⚔️", label:"Quiz Battle" },
      { id:"sharechallenge",icon:"📤", label:"Share & Challenge" },
    ]
  },
  {
    id:"social", icon:"👥", label:"Social Learning", type:"group",
    color:"#d97706",
    items:[
      { id:"studygroups", icon:"👥", label:"Study Groups" },
      { id:"classroom",   icon:"🏫", label:"Classroom" },
      { id:"peerlearn",   icon:"💬", label:"Peer Learning" },
    ]
  },
  {
    id:"progress", icon:"↗", label:"Progress", type:"single", page:"progress"
  },
  {
    id:"achievements", icon:"🏆", label:"Achievements", type:"single", page:"gamification"
  },
  {
    id:"history", icon:"⊙", label:"History", type:"single", page:"history"
  },
  {
    id:"settings", icon:"⚙", label:"Settings", type:"single", page:"settings"
  },
];

// Flat NAV list kept for backward compat (pages lookup)
const NAV = [
  { id:"home" },{ id:"dashboard" },{ id:"mindmap" },{ id:"viva" },{ id:"adaptive" },
  { id:"explainer" },{ id:"gamification" },{ id:"progress" },{ id:"pomodoro" },
  { id:"planner" },{ id:"notes" },{ id:"history" },{ id:"settings" },
  { id:"explainervideo" },{ id:"multiplayer" },{ id:"reel" },{ id:"infographic" },
  { id:"story" },{ id:"debate" },{ id:"music" },{ id:"studygroups" },
  { id:"sharechallenge" },{ id:"classroom" },{ id:"peerlearn" },
];

const TOOLS = [
  { id:"summarize", icon:"≡", label:"Summarize" },
  { id:"highlights", icon:"★", label:"Highlights" },
  { id:"quiz", icon:"?", label:"Quiz" },
  { id:"flashcards", icon:"⊟", label:"Flashcards" },
  { id:"tutor", icon:"◎", label:"AI Tutor" },
  { id:"explain", icon:"✦", label:"Explain" },
  { id:"essaycheck", icon:"✓", label:"Essay Check" },
  { id:"translate", icon:"⊕", label:"Translate" },
  { id:"readaloud", icon:"▶", label:"Read Aloud" },
  { id:"youtube", icon:"▷", label:"YouTube" },
  { id:"cheatsheet", icon:"⊞", label:"Cheat Sheet" },
  { id:"mocktest", icon:"☑", label:"Mock Test" },
  { id:"games", icon:"🎮", label:"Games" },
];

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage, collapsed, setCollapsed, user, handleLogout }) {
  const [openGroups, setOpenGroups] = useState(() => {
    // Auto-open the group that contains the current page
    const open = {};
    NAV_GROUPS.forEach(g => {
      if (g.type === "group" && g.items?.some(i => i.id === "mindmap")) open[g.id] = true;
    });
    return open;
  });

  const toggleGroup = (gid) => {
    setOpenGroups(prev => ({ ...prev, [gid]: !prev[gid] }));
  };

  // When page changes, auto-open its parent group
  useEffect(() => {
    NAV_GROUPS.forEach(g => {
      if (g.type === "group" && g.items?.some(i => i.id === page)) {
        setOpenGroups(prev => ({ ...prev, [g.id]: true }));
      }
    });
  }, [page]);

  const isInGroup = (gid) => {
    const g = NAV_GROUPS.find(g => g.id === gid);
    return g?.type === "group" && g.items?.some(i => i.id === page);
  };

  return (
    <aside style={{ width:collapsed?58:220, minHeight:"100vh", background:"#0c0f1a", borderRight:"1px solid rgba(139,92,246,0.15)", display:"flex", flexDirection:"column", transition:"width 0.22s ease", overflow:"hidden", position:"fixed", left:0, top:0, bottom:0, zIndex:200 }}>
      {/* Logo */}
      <div style={{ padding:collapsed?"16px 12px":"16px 14px", borderBottom:"1px solid rgba(139,92,246,0.12)", display:"flex", alignItems:"center", gap:10, minHeight:64, flexShrink:0 }}>
        <div style={{ width:32, height:32, borderRadius:9, flexShrink:0, background:"linear-gradient(135deg,#7c3aed,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, color:"#fff", fontWeight:800 }}>S</div>
        {!collapsed && (
          <div style={{ overflow:"hidden", flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0", fontFamily:"'DM Mono',monospace", whiteSpace:"nowrap" }}>Study Mate AI</div>
            <div style={{ fontSize:10, color:"#6b7280", fontFamily:"'DM Mono',monospace" }}>Study smarter ✨</div>
          </div>
        )}
        <button onClick={() => setCollapsed(!collapsed)} style={{ marginLeft:collapsed?"auto":"0", background:"none", border:"none", color:"#4b5563", cursor:"pointer", fontSize:16, padding:4, lineHeight:1, flexShrink:0 }}>
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:"8px 6px", overflowY:"auto", overflowX:"hidden" }}>
        {NAV_GROUPS.map(g => {
          const isActive = g.type === "single" ? page === g.page : isInGroup(g.id);
          const isOpen = openGroups[g.id];

          // Single item
          if (g.type === "single") return (
            <button key={g.id} onClick={() => setPage(g.page)} title={g.label}
              style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:collapsed?"10px 0":"8px 10px", background:isActive?"rgba(139,92,246,0.18)":"transparent", border:"none", borderRadius:9, cursor:"pointer", color:isActive?"#a78bfa":"#9ca3af", fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:isActive?600:400, transition:"all 0.15s", justifyContent:collapsed?"center":"flex-start", marginBottom:2, boxSizing:"border-box" }}>
              <span style={{ fontSize:15, flexShrink:0, width:20, textAlign:"center" }}>{g.icon}</span>
              {!collapsed && <span style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{g.label}</span>}
            </button>
          );

          // Group with dropdown
          return (
            <div key={g.id} style={{ marginBottom:2 }}>
              {/* Group header button */}
              <button onClick={() => collapsed ? null : toggleGroup(g.id)} title={g.label}
                style={{ display:"flex", alignItems:"center", gap:10, width:"100%", padding:collapsed?"10px 0":"8px 10px", background:isActive?`${g.color}22`:"transparent", border:"none", borderRadius:9, cursor:"pointer", color:isActive?g.color:"#9ca3af", fontFamily:"'DM Mono',monospace", fontSize:12, fontWeight:isActive?700:500, transition:"all 0.15s", justifyContent:collapsed?"center":"flex-start", boxSizing:"border-box" }}>
                <span style={{ fontSize:15, flexShrink:0, width:20, textAlign:"center" }}>{g.icon}</span>
                {!collapsed && (
                  <>
                    <span style={{ flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", textAlign:"left" }}>{g.label}</span>
                    {/* Item count badge */}
                    <span style={{ fontSize:9, background:isActive?`${g.color}33`:"rgba(255,255,255,0.07)", color:isActive?g.color:"#6b7280", padding:"1px 6px", borderRadius:10, fontWeight:700, flexShrink:0 }}>
                      {g.items.length}
                    </span>
                    {/* Chevron */}
                    <span style={{ fontSize:10, color:isActive?g.color:"#4b5563", transition:"transform 0.2s", transform:isOpen?"rotate(180deg)":"rotate(0deg)", flexShrink:0, marginLeft:2 }}>▾</span>
                  </>
                )}
              </button>

              {/* Dropdown items */}
              {!collapsed && isOpen && (
                <div style={{ marginLeft:10, marginBottom:4 }}>
                  {/* Vertical line accent */}
                  <div style={{ borderLeft:`2px solid ${g.color}33`, marginLeft:9, paddingLeft:0 }}>
                    {g.items.map(item => {
                      const itemActive = page === item.id;
                      return (
                        <button key={item.id} onClick={() => setPage(item.id)} title={item.label}
                          style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"7px 10px 7px 12px", background:itemActive?`${g.color}20`:"transparent", border:"none", borderRadius:8, cursor:"pointer", color:itemActive?g.color:"#6b7280", fontFamily:"'DM Mono',monospace", fontSize:11, fontWeight:itemActive?700:400, transition:"all 0.12s", justifyContent:"flex-start", boxSizing:"border-box", position:"relative" }}>
                          {/* Active dot */}
                          {itemActive && <div style={{ position:"absolute", left:-1, top:"50%", transform:"translateY(-50%)", width:4, height:16, background:g.color, borderRadius:"0 3px 3px 0" }}/>}
                          <span style={{ fontSize:13, flexShrink:0, width:18, textAlign:"center" }}>{item.icon}</span>
                          <span style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Collapsed: show tooltip group */}
              {collapsed && isActive && (
                <div style={{ width:4, height:4, borderRadius:"50%", background:g.color, margin:"0 auto 2px" }}/>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom user card */}
      <div style={{ padding:"10px 6px", borderTop:"1px solid rgba(139,92,246,0.1)", flexShrink:0 }}>
        {/* Collapsed: just avatar that acts as logout */}
        {collapsed ? (
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
            <div style={{ width:30, height:30, borderRadius:9, background:user?.avatar?.color ? `linear-gradient(135deg,${user.avatar.color},${user.avatar.color}aa)` : "linear-gradient(135deg,#7c3aed,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#fff", fontWeight:800 }}>
              {user?.avatar?.initials || (user?.name?.[0] || "S")}
            </div>
            <button onClick={handleLogout} title="Sign out" style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer", fontSize:13, padding:"2px", lineHeight:1 }} onMouseEnter={e=>e.target.style.color="#f87171"} onMouseLeave={e=>e.target.style.color="rgba(255,255,255,0.3)"}>⏻</button>
          </div>
        ) : (
          <div>
            <div style={{ padding:"8px 10px", background:"rgba(139,92,246,0.08)", borderRadius:9, display:"flex", alignItems:"center", gap:8, marginBottom: user?.isGuest ? 8 : 0 }}>
              <div style={{ width:28, height:28, borderRadius:9, background:user?.avatar?.color ? `linear-gradient(135deg,${user.avatar.color},${user.avatar.color}aa)` : "linear-gradient(135deg,#7c3aed,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#fff", flexShrink:0, fontWeight:800 }}>
                {user?.avatar?.initials || (user?.name?.[0] || "S")}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:11, color:"#e2e8f0", fontFamily:"'DM Mono',monospace", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user?.name || "Student"}</div>
                <div style={{ fontSize:10, color:"#6b7280", fontFamily:"'DM Mono',monospace" }}>{user?.isGuest ? "👤 Guest Mode" : "Free Plan"}</div>
              </div>
              <button onClick={handleLogout} title="Sign out" style={{ background:"none", border:"none", color:"rgba(255,255,255,0.3)", cursor:"pointer", fontSize:14, padding:"2px 4px", borderRadius:6, flexShrink:0, lineHeight:1 }} onMouseEnter={e=>e.target.style.color="#f87171"} onMouseLeave={e=>e.target.style.color="rgba(255,255,255,0.3)"}>⏻</button>
            </div>
            {/* Guest: show prominent sign in / log out button */}
            {user?.isGuest && (
              <button onClick={handleLogout} style={{ width:"100%", padding:"7px", borderRadius:8, border:"1px solid rgba(124,58,237,0.3)", background:"rgba(124,58,237,0.08)", color:"#a78bfa", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace", transition:"all 0.2s" }} onMouseEnter={e=>{e.target.style.background="rgba(124,58,237,0.18)";e.target.style.color="#c4b5fd";}} onMouseLeave={e=>{e.target.style.background="rgba(124,58,237,0.08)";e.target.style.color="#a78bfa";}}>
                → Sign In / Create Account
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}


export default Sidebar;
