import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── VIVA PRACTICE PAGE ───────────────────────────────────────────────────────
function VivaPage({ addToast }) {
  const { studyMaterial, userProgress, setUserProgress } = useApp();
  const [questions, setQuestions] = useState([]);
  const [current, setCurrent] = useState(0);
  const [answer, setAnswer] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [scores, setScores] = useState([]);

  const start = async () => {
    if (!studyMaterial) { addToast("Load material first!"); return; }
    setLoading(true);
    try {
      const r = await callClaude(`Generate 5 oral viva questions from this material. Return ONLY JSON array: ["question1","question2",...]\n\n${studyMaterial.text.slice(0,10000)}`);
      const qs = safeJSON(r, []);
      setQuestions(qs); setCurrent(0); setAnswer(""); setFeedback(null); setScores([]); setStarted(true);
    } catch(e) { addToast("Error: "+e.message); }
    setLoading(false);
  };

  const submit = async () => {
    if (!answer.trim()) return;
    setLoading(true);
    try {
      const r = await callClaude(`Question: "${questions[current]}"\nStudent answer: "${answer}"\n\nEvaluate this viva answer. Give: 1) Score out of 10 2) What was good 3) What was missing 4) Model answer. Plain text, no markdown.`,
        `You are a strict but fair examiner. Base evaluation on this material:\n${studyMaterial.text.slice(0,10000)}`);
      const scoreMatch = r.match(/(\d+)\s*(?:\/|\s*out\s*of\s*)10/i);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 5;
      setFeedback({ text: stripMd(r), score });
      setScores(s => [...s, score]);
      setUserProgress(p => ({ ...p, vivasDone: (p.vivasDone||0)+1 }));
    } catch(e) { addToast("Error: "+e.message); }
    setLoading(false);
  };

  const nextQ = () => {
    if (current+1 >= questions.length) { setStarted(false); addToast(`Viva complete! Avg: ${Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)}/10`); return; }
    setCurrent(c => c+1); setAnswer(""); setFeedback(null);
  };

  const speakQuestion = (q) => {
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(q); utt.rate = 0.9;
    window.speechSynthesis.speak(utt);
  };

  if (!studyMaterial) return <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af", fontFamily:"'DM Mono',monospace", fontSize:14 }}>Load study material on Home first.</div>;

  if (!started) return (
    <div style={{ textAlign:"center", padding:"60px 0" }}>
      <div style={{ fontSize:44, marginBottom:16 }}>🎤</div>
      <h2 style={{ fontFamily:"'DM Mono',monospace", color:"#111827", margin:"0 0 10px" }}>Viva Practice</h2>
      <p style={{ color:"#6b7280", marginBottom:28 }}>AI asks you oral questions · You answer · AI evaluates & scores</p>
      {scores.length > 0 && <div style={{ marginBottom:20, padding:"12px 20px", background:"#f0fdf4", border:"1px solid #86efac", borderRadius:12, display:"inline-block" }}><span style={{ fontFamily:"'DM Mono',monospace", fontSize:14, color:"#16a34a", fontWeight:700 }}>Last session avg: {Math.round(scores.reduce((a,b)=>a+b,0)/scores.length)}/10</span></div>}
      <br/>
      <button onClick={start} disabled={loading} style={{ padding:"12px 30px", background:"#7c3aed", border:"none", borderRadius:12, color:"#fff", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace", boxShadow:"0 4px 14px rgba(124,58,237,0.35)" }}>
        {loading ? "Preparing questions..." : "Start Viva 🎤"}
      </button>
    </div>
  );

  return (
    <div style={{ maxWidth:600, margin:"0 auto" }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:13, color:"#374151", fontWeight:600 }}>Question {current+1}/{questions.length}</span>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:12, color:"#9ca3af" }}>Avg: {scores.length ? Math.round(scores.reduce((a,b)=>a+b,0)/scores.length) : "-"}/10</span>
      </div>
      <div style={{ background:"linear-gradient(135deg,#fdf4ff,#eff6ff)", border:"1px solid #e9d5ff", borderRadius:16, padding:"22px", marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#7c3aed", fontFamily:"'DM Mono',monospace", letterSpacing:0.8, marginBottom:10 }}>EXAMINER ASKS</div>
        <p style={{ margin:"0 0 14px", fontSize:16, color:"#111827", lineHeight:1.6, fontWeight:600 }}>{questions[current]}</p>
        <button onClick={() => speakQuestion(questions[current])} style={{ padding:"6px 14px", background:"#ede9fe", border:"none", borderRadius:8, fontSize:12, color:"#7c3aed", cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>🔊 Speak Question</button>
      </div>
      {!feedback && (
        <div>
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Type your answer here..." style={{ width:"100%", minHeight:120, padding:"13px 15px", border:"1.5px solid #e5e7eb", borderRadius:12, fontSize:14, lineHeight:1.65, color:"#111827", fontFamily:"inherit", resize:"vertical", outline:"none", boxSizing:"border-box" }} onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"} />
          <button onClick={submit} disabled={loading||!answer.trim()} style={{ marginTop:12, padding:"10px 24px", background:"#7c3aed", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace", opacity:loading||!answer.trim()?0.6:1 }}>
            {loading ? "Evaluating..." : "Submit Answer →"}
          </button>
        </div>
      )}
      {feedback && (
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14 }}>
            <div style={{ width:64, height:64, borderRadius:"50%", border:`4px solid ${feedback.score>=7?"#86efac":feedback.score>=5?"#fcd34d":"#fca5a5"}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <span style={{ fontSize:20, fontWeight:800, color:feedback.score>=7?"#16a34a":feedback.score>=5?"#d97706":"#dc2626", fontFamily:"'DM Mono',monospace" }}>{feedback.score}/10</span>
            </div>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{feedback.score>=7?"Excellent!":feedback.score>=5?"Good effort":"Needs work"}</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>AI Evaluation</div>
            </div>
          </div>
          <div style={{ background:"#f9fafb", borderRadius:12, padding:"14px 16px", marginBottom:14 }}>
            <pre style={{ margin:0, fontSize:13, lineHeight:1.8, color:"#374151", fontFamily:"inherit", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{feedback.text}</pre>
          </div>
          <button onClick={nextQ} style={{ padding:"10px 22px", background:"#7c3aed", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>
            {current+1 < questions.length ? "Next Question →" : "Finish Viva"}
          </button>
        </div>
      )}
    </div>
  );
}


export default VivaPage;
