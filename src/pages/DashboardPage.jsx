import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── DASHBOARD PAGE ───────────────────────────────────────────────────────────
function DashboardPage() {
  const { userProgress, sessionHistory } = useApp();
  const xp = userProgress.xp || 0;
  const level = Math.floor(xp/100)+1;
  const stats = [
    { label:"XP Earned", value:xp, color:"#d97706", bg:"#fffbeb" },
    { label:"Level", value:level, color:"#7c3aed", bg:"#fdf4ff" },
    { label:"Quizzes", value:userProgress.quizzesTaken||0, color:"#2563eb", bg:"#eff6ff" },
    { label:"Flashcards", value:userProgress.flashcardsReviewed||0, color:"#16a34a", bg:"#f0fdf4" },
    { label:"Pomodoros", value:userProgress.pomodoros||0, color:"#dc2626", bg:"#fef2f2" },
    { label:"Tools Used", value:sessionHistory.length, color:"#0891b2", bg:"#ecfeff" },
  ];
  return (
    <div>
      <h2 style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827", margin:"0 0 20px" }}>Dashboard</h2>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:14, marginBottom:24 }}>
        {stats.map(s => <div key={s.label} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px" }}><div style={{ fontSize:11, color:"#6b7280", fontFamily:"'DM Mono',monospace", marginBottom:6 }}>{s.label}</div><div style={{ fontSize:28, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace" }}>{s.value}</div></div>)}
      </div>
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px 22px" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, marginBottom:12 }}>RECENT ACTIVITY</div>
        {sessionHistory.length === 0 ? <p style={{ color:"#9ca3af", fontSize:14, margin:0 }}>No activity yet. Start studying!</p> :
          <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
            {[...sessionHistory].reverse().slice(0,8).map((s, i) => <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"#f9fafb", borderRadius:9 }}><span style={{ fontSize:13, color:"#374151", fontFamily:"'DM Mono',monospace", textTransform:"capitalize" }}>{s.tool}</span><span style={{ fontSize:11, color:"#9ca3af" }}>{s.date}</span></div>)}
          </div>
        }
      </div>
    </div>
  );
}


export default DashboardPage;
