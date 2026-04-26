import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── PROGRESS PAGE ────────────────────────────────────────────────────────────
function ProgressPage() {
  const { userProgress } = useApp();
  const history = userProgress.quizHistory || [];
  const avg = history.length ? Math.round(history.reduce((a,b) => a+(b.score/b.total)*100,0)/history.length) : 0;
  return (
    <div>
      <h2 style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827", margin:"0 0 20px" }}>Progress</h2>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:22 }}>
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"22px" }}><div style={{ fontSize:12, color:"#6b7280", fontFamily:"'DM Mono',monospace", marginBottom:6 }}>Avg Quiz Score</div><div style={{ fontSize:38, fontWeight:800, fontFamily:"'DM Mono',monospace", color:"#7c3aed" }}>{avg}%</div></div>
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"22px" }}><div style={{ fontSize:12, color:"#6b7280", fontFamily:"'DM Mono',monospace", marginBottom:6 }}>Quizzes Taken</div><div style={{ fontSize:38, fontWeight:800, fontFamily:"'DM Mono',monospace", color:"#2563eb" }}>{history.length}</div></div>
      </div>
      {history.length > 0 ? (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"20px 24px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", marginBottom:16, letterSpacing:0.5 }}>QUIZ HISTORY</div>
          {history.map((h,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:12, marginBottom:10 }}>
              <span style={{ fontSize:11, color:"#6b7280", minWidth:72, fontFamily:"'DM Mono',monospace" }}>{h.date}</span>
              <div style={{ flex:1, height:7, background:"#f3f4f6", borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", background:"linear-gradient(90deg,#7c3aed,#4f46e5)", borderRadius:99, width:`${Math.round((h.score/h.total)*100)}%` }} />
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:"#7c3aed", minWidth:36, fontFamily:"'DM Mono',monospace", textAlign:"right" }}>{Math.round((h.score/h.total)*100)}%</span>
            </div>
          ))}
        </div>
      ) : <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af", fontFamily:"'DM Mono',monospace", fontSize:14 }}>Take quizzes to see your progress!</div>}
    </div>
  );
}


export default ProgressPage;
