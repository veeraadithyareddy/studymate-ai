import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── DEBATE MODE PAGE ─────────────────────────────────────────────────────────
function DebateModePage({ addToast }) {
  const { studyMaterial } = useApp();
  const [topic, setTopic] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [userScore, setUserScore] = useState(0);
  const [round, setRound] = useState(0);
  const chatEndRef = useRef();

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const startDebate = async () => {
    if (!topic.trim()) { addToast("Enter a debate topic first!"); return; }
    setLoading(true); setMessages([]); setRound(0); setUserScore(0);
    try {
      const context = studyMaterial ? `\nContext from study material: ${studyMaterial.text.slice(0,4000)}` : "";
      const r = await callClaude(
        `You are starting a debate. The topic is: "${topic}". Take the OPPOSITE/AGAINST side.${context}
Open the debate with a strong 2-3 sentence opening argument against this topic. Be confident and use facts. End with "Your turn — what's your argument FOR this?"`,
        "You are a sharp debate opponent. Always argue the AGAINST side confidently. After each student argument, score them 1-10, give brief feedback, then make your counter-argument."
      );
      setMessages([
        { role:"system", text:`🎭 Debate started!\n\nTopic: "${topic}"\nYou: FOR | AI: AGAINST\n\nMake your arguments — AI will counter!` },
        { role:"ai", text:r }
      ]);
      setStarted(true);
    } catch(err) { addToast("Error: "+err.message); }
    setLoading(false);
  };

  const sendArgument = async () => {
    if (!input.trim() || loading) return;
    const arg = input.trim(); setInput("");
    const newMessages = [...messages, { role:"user", text:arg }];
    setMessages(newMessages); setLoading(true); setRound(r => r+1);
    try {
      const history = newMessages.filter(m => m.role !== "system").map(m => `${m.role==="user"?"Student (FOR)":"AI (AGAINST)"}: ${m.text}`).join("\n\n");
      const r = await callClaude(
        `Debate topic: "${topic}"\nDebate history:\n${history}\n\nThe student just argued: "${arg}"\n\nRespond as the AGAINST side:\n1. Start with "Score: X/10 —" then 1 sentence feedback on their argument\n2. Then make a strong counter-argument (2-3 sentences)\n3. End with a challenging question for the student`,
        "You are a sharp debate opponent always arguing the AGAINST side. Be fair when scoring but be a tough opponent."
      );
      const scoreMatch = r.match(/Score:\s*(\d+)/i);
      if (scoreMatch) setUserScore(s => s + parseInt(scoreMatch[1]));
      setMessages(prev => [...prev, { role:"ai", text:r }]);
    } catch(err) { addToast("Error: "+err.message); }
    setLoading(false);
  };

  const endDebate = () => {
    const avg = round > 0 ? Math.round(userScore/round) : 0;
    setMessages(prev => [...prev, { role:"system", text:`🏆 Debate ended!\n\nYour average score: ${avg}/10\nRounds completed: ${round}\n\n${avg>=8?"Excellent debater! 🌟":avg>=6?"Good arguments! 👍":"Keep practicing! 💪"}` }]);
    setStarted(false);
  };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ margin:"0 0 3px", fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827" }}>🎭 Debate Mode</h2>
        <p style={{ margin:0, fontSize:13, color:"#6b7280" }}>AI argues the opposite side — builds critical thinking and essay skills</p>
      </div>

      {!started && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"24px", marginBottom:20 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:20 }}>
            <div style={{ background:"linear-gradient(135deg,#eff6ff,#dbeafe)", borderRadius:12, padding:"16px", textAlign:"center" }}>
              <div style={{ fontSize:28, marginBottom:6 }}>👤</div>
              <div style={{ fontSize:13, fontWeight:700, color:"#1d4ed8", fontFamily:"'DM Mono',monospace" }}>YOU — FOR</div>
              <div style={{ fontSize:11, color:"#3b82f6" }}>Argue in favour of the topic</div>
            </div>
            <div style={{ background:"linear-gradient(135deg,#fef2f2,#fecaca)", borderRadius:12, padding:"16px", textAlign:"center" }}>
              <div style={{ fontSize:28, marginBottom:6 }}>🤖</div>
              <div style={{ fontSize:13, fontWeight:700, color:"#dc2626", fontFamily:"'DM Mono',monospace" }}>AI — AGAINST</div>
              <div style={{ fontSize:11, color:"#ef4444" }}>AI counters with opposing arguments</div>
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, display:"block", marginBottom:8 }}>DEBATE TOPIC</label>
            <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. Social media is harmful to students · Climate change is man-made · AI will replace teachers..."
              style={{ width:"100%", padding:"11px 14px", border:"1.5px solid #e5e7eb", borderRadius:10, fontSize:14, outline:"none", color:"#111827", boxSizing:"border-box" }}
              onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"}
              onKeyDown={e => e.key==="Enter" && startDebate()}
            />
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:16 }}>
            {["Social media is harmful","AI will replace teachers","Online learning is better","Homework should be banned","Climate change needs urgent action"].map(t => (
              <button key={t} onClick={() => setTopic(t)} style={{ padding:"5px 12px", background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:20, fontSize:11, color:"#6b7280", cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>{t}</button>
            ))}
          </div>
          <button onClick={startDebate} disabled={loading} style={{ width:"100%", padding:"12px", background:"linear-gradient(135deg,#7c3aed,#4f46e5)", border:"none", borderRadius:11, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>
            {loading ? "Starting debate..." : "⚔️ Start Debate!"}
          </button>
        </div>
      )}

      {messages.length > 0 && (
        <div>
          {started && (
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 16px", background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:12, marginBottom:14 }}>
              <span style={{ fontSize:12, color:"#374151", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>Round {round} · Your Score: {userScore}</span>
              <button onClick={endDebate} style={{ padding:"5px 14px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:8, fontSize:12, color:"#dc2626", cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>End Debate</button>
            </div>
          )}
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, overflow:"hidden" }}>
            <div style={{ height:400, overflowY:"auto", padding:"16px 18px", display:"flex", flexDirection:"column", gap:12 }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display:"flex", justifyContent: m.role==="user"?"flex-end": m.role==="system"?"center":"flex-start" }}>
                  {m.role==="system" ? (
                    <div style={{ padding:"10px 16px", background:"#f3f4f6", borderRadius:12, fontSize:12, color:"#374151", fontFamily:"'DM Mono',monospace", whiteSpace:"pre-wrap", maxWidth:"90%", textAlign:"center" }}>{m.text}</div>
                  ) : (
                    <div style={{ maxWidth:"78%", padding:"12px 16px", borderRadius: m.role==="user"?"16px 16px 4px 16px":"4px 16px 16px 16px", background: m.role==="user"?"linear-gradient(135deg,#2563eb,#1d4ed8)":"linear-gradient(135deg,#dc2626,#b91c1c)", color:"#fff", fontSize:14, lineHeight:1.7 }}>
                      <div style={{ fontSize:10, opacity:0.7, fontFamily:"'DM Mono',monospace", fontWeight:700, marginBottom:6 }}>{m.role==="user"?"👤 YOU (FOR)":"🤖 AI (AGAINST)"}</div>
                      {m.text}
                    </div>
                  )}
                </div>
              ))}
              {loading && <div style={{ textAlign:"center", fontSize:13, color:"#9ca3af", fontFamily:"'DM Mono',monospace" }}>AI is forming counter-argument... ⚔️</div>}
              <div ref={chatEndRef}/>
            </div>
            {started && (
              <div style={{ padding:"12px 14px", borderTop:"1px solid #e5e7eb", display:"flex", gap:8 }}>
                <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key==="Enter" && sendArgument()} placeholder="Type your argument FOR the topic..."
                  style={{ flex:1, padding:"10px 13px", border:"1.5px solid #e5e7eb", borderRadius:10, fontSize:14, outline:"none", color:"#111827" }}
                  onFocus={e => e.target.style.borderColor="#2563eb"} onBlur={e => e.target.style.borderColor="#e5e7eb"}
                />
                <button onClick={sendArgument} disabled={loading||!input.trim()} style={{ padding:"10px 18px", background:"linear-gradient(135deg,#2563eb,#1d4ed8)", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>⚔️</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


export default DebateModePage;
