import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── GAMIFICATION PAGE ────────────────────────────────────────────────────────
function GamificationPage() {
  const { userProgress } = useApp();
  const xp = userProgress.xp || 0;
  const level = Math.floor(xp / 100) + 1;
  const xpInLevel = xp % 100;
  const badges = [
    { id:"first_quiz", icon:"🧠", label:"First Quiz", desc:"Complete your first quiz", earned:(userProgress.quizzesTaken||0)>=1 },
    { id:"quiz5", icon:"🏅", label:"Quiz Veteran", desc:"Complete 5 quizzes", earned:(userProgress.quizzesTaken||0)>=5 },
    { id:"perfect", icon:"⭐", label:"Perfect Score", desc:"Score 100% on a quiz", earned:(userProgress.quizHistory||[]).some(h=>h.score===h.total) },
    { id:"flashcards", icon:"🃏", label:"Card Shark", desc:"Review 20 flashcards", earned:(userProgress.flashcardsReviewed||0)>=20 },
    { id:"viva", icon:"🎤", label:"Oral Expert", desc:"Complete a viva session", earned:(userProgress.vivasDone||0)>=1 },
    { id:"xp100", icon:"🚀", label:"XP Hunter", desc:"Earn 100 XP", earned:xp>=100 },
    { id:"xp500", icon:"💎", label:"Diamond", desc:"Earn 500 XP", earned:xp>=500 },
    { id:"streak3", icon:"🔥", label:"On Fire", desc:"3-day streak", earned:(userProgress.streak||0)>=3 },
  ];
  const earned = badges.filter(b=>b.earned).length;

  return (
    <div>
      <h2 style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827", margin:"0 0 20px" }}>Achievements</h2>
      {/* XP card */}
      <div style={{ background:"linear-gradient(135deg,#7c3aed,#4f46e5)", borderRadius:18, padding:"22px 26px", marginBottom:20, color:"#fff" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:600, opacity:0.7, fontFamily:"'DM Mono',monospace", letterSpacing:0.8 }}>LEVEL</div>
            <div style={{ fontSize:40, fontWeight:900, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{level}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:12, opacity:0.7, fontFamily:"'DM Mono',monospace" }}>Total XP</div>
            <div style={{ fontSize:24, fontWeight:800, fontFamily:"'DM Mono',monospace" }}>{xp}</div>
          </div>
        </div>
        <div style={{ fontSize:11, opacity:0.7, fontFamily:"'DM Mono',monospace", marginBottom:6 }}>{xpInLevel}/100 XP to next level</div>
        <div style={{ width:"100%", height:8, background:"rgba(255,255,255,0.2)", borderRadius:99, overflow:"hidden" }}>
          <div style={{ height:"100%", background:"rgba(255,255,255,0.9)", borderRadius:99, width:`${xpInLevel}%`, transition:"width 0.6s" }} />
        </div>
      </div>
      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))", gap:12, marginBottom:22 }}>
        {[{ label:"Badges Earned", value:`${earned}/${badges.length}`, color:"#d97706" },{ label:"Quiz Streak", value:`${userProgress.streak||0} days`, color:"#16a34a" },{ label:"Sessions", value:userProgress.sessions||0, color:"#7c3aed" }].map(s => (
          <div key={s.label} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:13, padding:"16px" }}>
            <div style={{ fontSize:11, color:"#6b7280", fontFamily:"'DM Mono',monospace", marginBottom:5 }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace" }}>{s.value}</div>
          </div>
        ))}
      </div>
      {/* Badges grid */}
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"18px 20px" }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", marginBottom:14, letterSpacing:0.5 }}>BADGES ({earned}/{badges.length} earned)</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10 }}>
          {badges.map(b => (
            <div key={b.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 12px", background:b.earned?"#f0fdf4":"#f9fafb", border:`1px solid ${b.earned?"#86efac":"#e5e7eb"}`, borderRadius:11, opacity:b.earned?1:0.5 }}>
              <span style={{ fontSize:22, flexShrink:0 }}>{b.icon}</span>
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:b.earned?"#16a34a":"#374151", fontFamily:"'DM Mono',monospace" }}>{b.label}</div>
                <div style={{ fontSize:11, color:"#6b7280", lineHeight:1.4 }}>{b.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


export default GamificationPage;
