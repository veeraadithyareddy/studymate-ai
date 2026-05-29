import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── ADAPTIVE AI PAGE ─────────────────────────────────────────────────────────
function AdaptivePage({ addToast }) {
  const { studyMaterial, userProgress } = useApp();
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!studyMaterial) { addToast("Load material first!"); return; }
    setLoading(true);
    try {
      const history = userProgress.quizHistory || [];
      const avg = history.length ? Math.round(history.reduce((a,b) => a+(b.score/b.total)*100,0)/history.length) : null;
      const prompt = `Student performance data:
- Quizzes taken: ${history.length}
- Average score: ${avg !== null ? avg+"%" : "No quizzes yet"}
- Flashcards reviewed: ${userProgress.flashcardsReviewed||0}
- XP earned: ${userProgress.xp||0}
- Vivas done: ${userProgress.vivasDone||0}

Study material topic area: ${studyMaterial.text.slice(0,2000)}

Based on this data, provide:
1. Current performance assessment
2. Weak areas to focus on
3. 3 specific study recommendations
4. Suggested next steps
Plain text, no markdown.`;
      const r = await callClaude(prompt, "You are an adaptive learning coach. Provide personalized, actionable study advice.");
      setAdvice(stripMd(r));
    } catch(e) { addToast("Error: "+e.message); }
    setLoading(false);
  };

  const history = userProgress.quizHistory || [];
  const avg = history.length ? Math.round(history.reduce((a,b) => a+(b.score/b.total)*100,0)/history.length) : 0;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
        <h2 style={{ margin:0, fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827" }}>Adaptive Learning AI</h2>
        <button onClick={analyze} disabled={loading} style={{ padding:"9px 18px", background:"#7c3aed", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>{loading?"Analyzing...":"Analyze My Progress 🧠"}</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:14, marginBottom:22 }}>
        {[
          { label:"Avg Quiz Score", value:`${avg}%`, color:"#7c3aed", bg:"#fdf4ff" },
          { label:"Quizzes Taken", value:history.length, color:"#2563eb", bg:"#eff6ff" },
          { label:"XP Earned", value:userProgress.xp||0, color:"#d97706", bg:"#fffbeb" },
          { label:"Vivas Done", value:userProgress.vivasDone||0, color:"#16a34a", bg:"#f0fdf4" },
        ].map(s => (
          <div key={s.label} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px" }}>
            <div style={{ fontSize:11, color:"#6b7280", fontFamily:"'DM Mono',monospace", marginBottom:6 }}>{s.label}</div>
            <div style={{ fontSize:28, fontWeight:800, color:s.color, fontFamily:"'DM Mono',monospace" }}>{s.value}</div>
          </div>
        ))}
      </div>
      {/* Quiz score bar chart */}
      {history.length > 0 && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px", marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", marginBottom:14, letterSpacing:0.5 }}>QUIZ SCORE HISTORY</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {history.slice(-8).map((h,i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:11, color:"#6b7280", minWidth:70, fontFamily:"'DM Mono',monospace" }}>{h.date}</span>
                <div style={{ flex:1, height:7, background:"#f3f4f6", borderRadius:99, overflow:"hidden" }}>
                  <div style={{ height:"100%", background:`linear-gradient(90deg,${Math.round((h.score/h.total)*100)>=70?"#7c3aed":"#f59e0b"},${Math.round((h.score/h.total)*100)>=70?"#4f46e5":"#d97706"})`, borderRadius:99, width:`${Math.round((h.score/h.total)*100)}%`, transition:"width 0.6s" }} />
                </div>
                <span style={{ fontSize:12, fontWeight:700, color:"#7c3aed", minWidth:38, fontFamily:"'DM Mono',monospace", textAlign:"right" }}>{Math.round((h.score/h.total)*100)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {loading && <div style={{ textAlign:"center", padding:"32px 0" }}><div style={{ width:36, height:36, borderRadius:"50%", border:"3px solid #ede9fe", borderTopColor:"#7c3aed", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} /><p style={{ color:"#7c3aed", fontFamily:"'DM Mono',monospace", fontSize:14 }}>Analyzing your learning patterns...</p></div>}
      {advice && !loading && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"20px 24px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#7c3aed", fontFamily:"'DM Mono',monospace", marginBottom:12, letterSpacing:0.5 }}>AI COACH ADVICE</div>
          <pre style={{ margin:0, fontSize:14, lineHeight:1.85, color:"#374151", fontFamily:"inherit", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{advice}</pre>
        </div>
      )}
    </div>
  );
}


export default AdaptivePage;
