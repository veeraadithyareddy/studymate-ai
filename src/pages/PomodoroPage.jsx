import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── POMODORO PAGE ────────────────────────────────────────────────────────────
function PomodoroPage() {
  const { userProgress, setUserProgress } = useApp();
  const [mode, setMode] = useState("work");
  const [secs, setSecs] = useState(25*60);
  const [running, setRunning] = useState(false);
  const ref = useRef();
  const TIMES = { work:25*60, short:5*60, long:15*60 };
  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSecs(s => {
        if (s<=1) { clearInterval(ref.current); setRunning(false); if (mode==="work") setUserProgress(p => ({...p, pomodoros:(p.pomodoros||0)+1, xp:(p.xp||0)+20})); return 0; }
        return s-1;
      }), 1000);
    }
    return () => clearInterval(ref.current);
  }, [running, mode, setUserProgress]);
  const switchMode = (m) => { setMode(m); setSecs(TIMES[m]); setRunning(false); };
  const mins = Math.floor(secs/60).toString().padStart(2,"0");
  const seconds = (secs%60).toString().padStart(2,"0");
  const pct = 1-(secs/TIMES[mode]);
  const r=80, circ=2*Math.PI*r;
  return (
    <div style={{ maxWidth:360, margin:"0 auto", textAlign:"center" }}>
      <h2 style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827", margin:"0 0 22px" }}>Pomodoro Timer</h2>
      <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:26 }}>
        {[["work","Focus"],["short","Short Break"],["long","Long Break"]].map(([m,l]) => (
          <button key={m} onClick={() => switchMode(m)} style={{ padding:"7px 13px", borderRadius:9, border:"none", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"'DM Mono',monospace", background:mode===m?"#7c3aed":"#f3f4f6", color:mode===m?"#fff":"#6b7280" }}>{l}</button>
        ))}
      </div>
      <svg width={200} height={200} style={{ display:"block", margin:"0 auto 22px" }}>
        <circle cx={100} cy={100} r={r} fill="none" stroke="#f3f4f6" strokeWidth={10}/>
        <circle cx={100} cy={100} r={r} fill="none" stroke="#7c3aed" strokeWidth={10} strokeDasharray={circ} strokeDashoffset={circ*(1-pct)} strokeLinecap="round" transform="rotate(-90 100 100)" style={{ transition:"stroke-dashoffset 1s linear" }}/>
        <text x={100} y={108} textAnchor="middle" fontSize={32} fontWeight={700} fill="#111827" fontFamily="'DM Mono',monospace">{mins}:{seconds}</text>
      </svg>
      <div style={{ display:"flex", gap:10, justifyContent:"center", marginBottom:20 }}>
        <button onClick={() => setRunning(!running)} style={{ padding:"11px 28px", background:running?"#ef4444":"#7c3aed", border:"none", borderRadius:12, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace", boxShadow:running?"0 4px 14px rgba(239,68,68,0.35)":"0 4px 14px rgba(124,58,237,0.35)" }}>{running?"Pause":"Start"}</button>
        <button onClick={() => { setSecs(TIMES[mode]); setRunning(false); }} style={{ padding:"11px 18px", background:"#f3f4f6", border:"none", borderRadius:12, color:"#374151", fontSize:14, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>Reset</button>
      </div>
      <div style={{ padding:"12px 18px", background:"#fdf4ff", borderRadius:12, border:"1px solid #e9d5ff", display:"inline-block" }}>
        <span style={{ fontSize:13, color:"#7c3aed", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>🍅 Completed: {userProgress.pomodoros||0} · +20 XP each</span>
      </div>
    </div>
  );
}


export default PomodoroPage;
