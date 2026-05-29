import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── MULTIPLAYER QUIZ BATTLE PAGE ────────────────────────────────────────────
// Real-time sync via localStorage + BroadcastChannel (same browser, multiple tabs)
// Share the room code with friends on the same device or same local network

function genCode() { return Math.random().toString(36).slice(2,7).toUpperCase(); }
function rKey(code) { return `smai_room_${code}`; }
function readRoom(code) { try { return JSON.parse(localStorage.getItem(rKey(code))||"null"); } catch { return null; } }
function writeRoom(code, data) { localStorage.setItem(rKey(code), JSON.stringify({...data, _ts:Date.now()})); }

const AVATARS = ["🐯","🦊","🐼","🦋","🐬","🦁","🐧","🦄","🐸","🦉"];
const ACOLORS = ["#7c3aed","#2563eb","#16a34a","#d97706","#dc2626","#0891b2","#db2777","#059669","#7c3aed","#92400e"];
const MEDALS  = ["🥇","🥈","🥉"];

function MultiplayerQuizPage({ addToast }) {
  const [screen, setScreen]       = useState("lobby");   // lobby|waiting|countdown|question|result|leaderboard
  const [role,   setRole]         = useState(null);      // "host"|"player"
  const [code,   setCode]         = useState("");
  const [joinInput, setJoinInput] = useState("");
  const [name,   setName]         = useState(() => localStorage.getItem("smai_pname")||"");
  const [topic,  setTopic]        = useState("");
  const [numQ,   setNumQ]         = useState(5);
  const [room,   setRoom]         = useState(null);
  const [myId]                    = useState(() => Math.random().toString(36).slice(2,10));
  const [answered, setAnswered]   = useState(false);
  const [selAns,   setSelAns]     = useState(null);
  const [timeLeft, setTimeLeft]   = useState(15);
  const [generating, setGenerating] = useState(false);
  const [err, setErr]             = useState("");
  const pollRef = useRef();
  const timerRef = useRef();
  const bcRef = useRef();
  const lastTs = useRef(0);

  // BroadcastChannel — instant sync across tabs in same browser
  useEffect(() => {
    try {
      bcRef.current = new BroadcastChannel("smai_quiz_bc");
      bcRef.current.onmessage = () => { if (code) pull(); };
    } catch {}
    return () => { try { bcRef.current?.close(); } catch {} };
  }, [code]);

  const push = useCallback((patch) => {
    if (!code) return;
    const cur = readRoom(code) || {};
    const next = { ...cur, ...patch };
    writeRoom(code, next);
    setRoom(next);
    if (patch.screen) setScreen(patch.screen);
    try { bcRef.current?.postMessage("sync"); } catch {}
  }, [code]);

  const pull = useCallback(() => {
    if (!code) return;
    const r = readRoom(code);
    if (!r || r._ts === lastTs.current) return;
    lastTs.current = r._ts;
    setRoom(r);
    if (r.screen) setScreen(r.screen);
  }, [code]);

  // Poll every 700ms for cross-device sync via shared localStorage key
  useEffect(() => {
    if (!code) return;
    pollRef.current = setInterval(pull, 700);
    return () => clearInterval(pollRef.current);
  }, [code, pull]);

  // Host-driven question timer
  useEffect(() => {
    if (screen !== "question" || role !== "host" || !room) return;
    setTimeLeft(15);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { clearInterval(timerRef.current); advanceQuestion(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [room?.currentQ, screen, role]);

  // Player timer display
  useEffect(() => {
    if (screen !== "question" || role !== "player") return;
    setAnswered(false); setSelAns(null); setTimeLeft(15);
    const t = setInterval(() => setTimeLeft(p => Math.max(0, p - 1)), 1000);
    return () => clearInterval(t);
  }, [room?.currentQ, screen, role]);

  const advanceQuestion = useCallback(() => {
    if (!room) return;
    const nextQ = (room.currentQ || 0) + 1;
    if (nextQ >= (room.questions||[]).length) {
      push({ screen:"leaderboard", currentQ: nextQ });
    } else {
      push({ screen:"result", currentQ: nextQ });
      setTimeout(() => push({ screen:"question", currentQ: nextQ }), 2200);
    }
  }, [room, push]);

  // ── HOST: Create room ──────────────────────────────────────────────────────
  const createRoom = async () => {
    if (!name.trim()) { setErr("Enter your name first"); return; }
    if (!topic.trim()) { setErr("Enter a quiz topic"); return; }
    localStorage.setItem("smai_pname", name);
    setGenerating(true); setErr("");
    try {
      const r = await callClaude(
        `Generate ${numQ} multiple choice quiz questions about: "${topic}".
Return ONLY a JSON array: [{"q":"question","options":["A","B","C","D"],"answer":0,"fact":"fun fact about the answer"}]
Each question must have exactly 4 options and answer index 0-3.`,
        "You are a quiz generator. Return ONLY valid JSON array, no other text.", 1200
      );
      const s = r.indexOf("["), e = r.lastIndexOf("]");
      if (s === -1) throw new Error("Could not generate questions. Try again.");
      const qs = JSON.parse(r.slice(s, e+1));
      if (!qs.length) throw new Error("No questions generated.");
      const newCode = genCode();
      const roomData = {
        code: newCode, topic, screen:"waiting",
        questions: qs, currentQ: 0,
        host: myId,
        players: { [myId]: { name: name.trim(), score: 0, avatar: AVATARS[0], color: ACOLORS[0], answers:{} } },
      };
      writeRoom(newCode, roomData);
      setCode(newCode); setRole("host"); setRoom(roomData); setScreen("waiting");
    } catch(e) { setErr("Error: " + e.message); }
    setGenerating(false);
  };

  // ── PLAYER: Join room ──────────────────────────────────────────────────────
  const joinRoom = () => {
    if (!name.trim()) { setErr("Enter your name first"); return; }
    const c = joinInput.trim().toUpperCase();
    if (c.length < 4) { setErr("Enter a valid room code"); return; }
    const r = readRoom(c);
    if (!r) { setErr("Room not found. Check the code."); return; }
    if (r.screen !== "waiting") { setErr("Game already started!"); return; }
    localStorage.setItem("smai_pname", name);
    const playerCount = Object.keys(r.players||{}).length;
    const av = AVATARS[playerCount % AVATARS.length];
    const col = ACOLORS[playerCount % ACOLORS.length];
    const updated = { ...r, players: { ...r.players, [myId]: { name:name.trim(), score:0, avatar:av, color:col, answers:{} } } };
    writeRoom(c, updated);
    setCode(c); setRole("player"); setRoom(updated); setScreen("waiting");
    lastTs.current = updated._ts;
    try { bcRef.current?.postMessage("sync"); } catch {}
  };

  // ── PLAYER: Submit answer ──────────────────────────────────────────────────
  const submitAnswer = (idx) => {
    if (answered || !room) return;
    setAnswered(true); setSelAns(idx);
    const q = room.questions[room.currentQ];
    const correct = idx === q.answer;
    const pts = correct ? Math.max(100, timeLeft * 20) : 0;
    const cur = readRoom(code) || room;
    const me = cur.players?.[myId] || {};
    const newScore = (me.score || 0) + pts;
    const newAnswers = { ...(me.answers||{}), [room.currentQ]: { chosen:idx, correct, pts } };
    const updated = {
      ...cur,
      players: { ...cur.players, [myId]: { ...me, score:newScore, answers:newAnswers } }
    };
    writeRoom(code, updated);
    setRoom(updated);
    try { bcRef.current?.postMessage("sync"); } catch {}
  };

  const leaveRoom = () => {
    clearInterval(pollRef.current); clearInterval(timerRef.current);
    setScreen("lobby"); setRole(null); setCode(""); setRoom(null);
    setAnswered(false); setSelAns(null); setErr("");
  };

  const restart = () => {
    if (role !== "host") return;
    push({ screen:"waiting", currentQ:0, players: Object.fromEntries(
      Object.entries(room.players||{}).map(([id,p]) => [id, {...p, score:0, answers:{}}])
    )});
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const players   = room ? Object.entries(room.players||{}).map(([id,p]) => ({id,...p})) : [];
  const sorted    = [...players].sort((a,b) => b.score - a.score);
  const curQ      = room?.questions?.[room.currentQ];
  const myPlayer  = room?.players?.[myId];
  const myAns     = myPlayer?.answers?.[room?.currentQ];

  // ── OPTION button colors ───────────────────────────────────────────────────
  const optColor = (i) => {
    if (!answered && screen === "question") return { bg:"#f3f0ff", border:"#c4b5fd", text:"#374151" };
    if (i === curQ?.answer) return { bg:"#dcfce7", border:"#86efac", text:"#166534" };
    if (i === selAns && i !== curQ?.answer) return { bg:"#fef2f2", border:"#fca5a5", text:"#dc2626" };
    return { bg:"#f9fafb", border:"#e5e7eb", text:"#9ca3af" };
  };

  const OPT_ICONS = ["🅐","🅑","🅒","🅓"];

  // ── RENDER ─────────────────────────────────────────────────────────────────
  const s = { fontFamily:"'DM Mono',monospace" };

  // LOBBY
  if (screen === "lobby") return (
    <div>
      <div style={{ background:"linear-gradient(135deg,#1e1b4b,#4c1d95)", borderRadius:20, padding:"28px 30px", marginBottom:24, color:"#fff", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", right:-10, top:-10, fontSize:100, opacity:0.07 }}>👥</div>
        <div style={{ fontSize:28, marginBottom:8 }}>👥 Quiz Battle</div>
        <div style={{ fontSize:15, fontWeight:800, marginBottom:4, ...s }}>Play with Friends!</div>
        <div style={{ fontSize:13, opacity:0.75 }}>Host a quiz on any topic · Share the room code · Compete live</div>
      </div>

      {err && <div style={{ padding:"10px 14px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, fontSize:13, color:"#dc2626", marginBottom:16, ...s }}>{err}</div>}

      {/* Name */}
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px 20px", marginBottom:14 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#374151", letterSpacing:0.8, marginBottom:8, ...s }}>YOUR NAME</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Enter your player name..."
          style={{ width:"100%", padding:"10px 13px", border:"1.5px solid #e5e7eb", borderRadius:10, fontSize:14, outline:"none", color:"#111827", boxSizing:"border-box" }}
          onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"}
        />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
        {/* HOST */}
        <div style={{ background:"#fff", border:"2px solid #e9d5ff", borderRadius:16, padding:"20px" }}>
          <div style={{ fontSize:22, marginBottom:8 }}>🎮</div>
          <div style={{ fontSize:14, fontWeight:700, color:"#7c3aed", marginBottom:12, ...s }}>Host a Game</div>
          <input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Quiz topic e.g. Solar System, World War II..." style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e5e7eb", borderRadius:9, fontSize:13, outline:"none", color:"#111827", marginBottom:10, boxSizing:"border-box" }} onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"}/>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14 }}>
            <span style={{ fontSize:12, color:"#6b7280", ...s }}>Questions:</span>
            {[5,8,10].map(n => (
              <button key={n} onClick={() => setNumQ(n)} style={{ padding:"4px 12px", borderRadius:8, border:`1.5px solid ${numQ===n?"#7c3aed":"#e5e7eb"}`, background:numQ===n?"#ede9fe":"#f9fafb", color:numQ===n?"#7c3aed":"#6b7280", fontSize:12, cursor:"pointer", fontWeight:700, ...s }}>{n}</button>
            ))}
          </div>
          <button onClick={createRoom} disabled={generating} style={{ width:"100%", padding:"11px", background:generating?"#c4b5fd":"linear-gradient(135deg,#7c3aed,#4f46e5)", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:generating?"default":"pointer", ...s, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
            {generating ? <><div style={{ width:14,height:14,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.4)",borderTopColor:"#fff",animation:"spin 0.8s linear infinite" }}/> Generating...</> : "🚀 Create Room"}
          </button>
        </div>

        {/* JOIN */}
        <div style={{ background:"#fff", border:"2px solid #bfdbfe", borderRadius:16, padding:"20px" }}>
          <div style={{ fontSize:22, marginBottom:8 }}>🔗</div>
          <div style={{ fontSize:14, fontWeight:700, color:"#2563eb", marginBottom:12, ...s }}>Join a Game</div>
          <input value={joinInput} onChange={e => setJoinInput(e.target.value.toUpperCase())} placeholder="Enter room code..." maxLength={6}
            style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e5e7eb", borderRadius:9, fontSize:16, outline:"none", color:"#111827", marginBottom:10, boxSizing:"border-box", fontWeight:800, letterSpacing:4, textAlign:"center", ...s }}
            onFocus={e => e.target.style.borderColor="#2563eb"} onBlur={e => e.target.style.borderColor="#e5e7eb"}
            onKeyDown={e => e.key==="Enter" && joinRoom()}
          />
          <p style={{ fontSize:11, color:"#9ca3af", marginBottom:14 }}>Ask the host for their 5-letter room code</p>
          <button onClick={joinRoom} style={{ width:"100%", padding:"11px", background:"linear-gradient(135deg,#2563eb,#1d4ed8)", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", ...s }}>
            🎯 Join Room
          </button>
        </div>
      </div>
    </div>
  );

  // WAITING ROOM
  if (screen === "waiting") return (
    <div>
      <div style={{ background:"linear-gradient(135deg,#1e1b4b,#312e81)", borderRadius:18, padding:"24px 28px", marginBottom:20, color:"#fff", textAlign:"center" }}>
        <div style={{ fontSize:13, opacity:0.6, marginBottom:4, ...s }}>ROOM CODE</div>
        <div style={{ fontSize:44, fontWeight:900, letterSpacing:10, ...s }}>{code}</div>
        <div style={{ fontSize:12, opacity:0.6, marginTop:4 }}>Share this code with friends</div>
        <div style={{ marginTop:10, fontSize:13, opacity:0.8 }}>Topic: <strong>{room?.topic}</strong></div>
      </div>

      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"16px 20px", marginBottom:16 }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#374151", letterSpacing:0.8, marginBottom:12, ...s }}>PLAYERS JOINED ({players.length})</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:10 }}>
          {players.map(p => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 14px", background:`${p.color}12`, border:`1.5px solid ${p.color}44`, borderRadius:20 }}>
              <span style={{ fontSize:18 }}>{p.avatar}</span>
              <span style={{ fontSize:13, fontWeight:700, color:p.color, ...s }}>{p.name}</span>
              {p.id === myId && <span style={{ fontSize:10, background:p.color, color:"#fff", padding:"1px 6px", borderRadius:20, ...s }}>YOU</span>}
            </div>
          ))}
        </div>
      </div>

      {role === "host" ? (
        <div>
          <button onClick={() => push({ screen:"question", currentQ:0 })} disabled={players.length < 1} style={{ width:"100%", padding:"14px", background:"linear-gradient(135deg,#16a34a,#15803d)", border:"none", borderRadius:12, color:"#fff", fontSize:15, fontWeight:800, cursor:"pointer", ...s, boxShadow:"0 4px 16px rgba(22,163,74,0.35)" }}>
            🚀 Start Game ({players.length} player{players.length!==1?"s":""})
          </button>
          <p style={{ textAlign:"center", fontSize:12, color:"#9ca3af", marginTop:8 }}>Waiting for more players to join...</p>
        </div>
      ) : (
        <div style={{ textAlign:"center", padding:"20px 0", color:"#6b7280" }}>
          <div style={{ width:36, height:36, borderRadius:"50%", border:"3px solid #ede9fe", borderTopColor:"#7c3aed", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }}/>
          <p style={{ ...s, fontSize:14 }}>Waiting for host to start...</p>
        </div>
      )}
      <button onClick={leaveRoom} style={{ marginTop:12, width:"100%", padding:"10px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, color:"#dc2626", fontSize:13, fontWeight:600, cursor:"pointer", ...s }}>Leave Room</button>
    </div>
  );

  // QUESTION SCREEN
  if (screen === "question" && curQ) return (
    <div>
      {/* Header bar */}
      <div style={{ background:"linear-gradient(135deg,#1e1b4b,#312e81)", borderRadius:16, padding:"14px 20px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center", color:"#fff" }}>
        <div>
          <div style={{ fontSize:10, opacity:0.6, ...s }}>Q {(room.currentQ||0)+1}/{room.questions.length}</div>
          <div style={{ fontSize:12, fontWeight:700, ...s }}>{room.topic}</div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:32, fontWeight:900, ...s, color: timeLeft<=5?"#f87171":"#fff", lineHeight:1 }}>{timeLeft}</div>
          <div style={{ fontSize:10, opacity:0.6 }}>seconds</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontSize:10, opacity:0.6, ...s }}>YOUR SCORE</div>
          <div style={{ fontSize:18, fontWeight:800, ...s, color:"#a5f3fc" }}>{myPlayer?.score||0}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height:5, background:"#e9d5ff", borderRadius:99, marginBottom:18, overflow:"hidden" }}>
        <div style={{ height:"100%", background:`linear-gradient(90deg,${timeLeft<=5?"#ef4444":"#7c3aed"},${timeLeft<=5?"#dc2626":"#4f46e5"})`, borderRadius:99, width:`${(timeLeft/15)*100}%`, transition:"width 1s linear" }}/>
      </div>

      {/* Question */}
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"22px 24px", marginBottom:16, boxShadow:"0 4px 20px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize:11, fontWeight:700, color:"#7c3aed", letterSpacing:0.8, marginBottom:10, ...s }}>QUESTION {(room.currentQ||0)+1}</div>
        <p style={{ margin:0, fontSize:17, color:"#111827", lineHeight:1.55, fontWeight:600 }}>{curQ.q}</p>
      </div>

      {/* Options */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
        {curQ.options.map((opt, i) => {
          const c = optColor(i);
          return (
            <button key={i} onClick={() => submitAnswer(i)} disabled={answered}
              style={{ padding:"14px 16px", borderRadius:13, border:`2px solid ${c.border}`, background:c.bg, fontSize:14, color:c.text, cursor:answered?"default":"pointer", textAlign:"left", transition:"all 0.15s", display:"flex", alignItems:"center", gap:10, fontWeight:600 }}>
              <span style={{ fontSize:20, flexShrink:0 }}>{OPT_ICONS[i]}</span>
              <span style={{ lineHeight:1.4 }}>{opt}</span>
              {answered && i===curQ.answer && <span style={{ marginLeft:"auto", fontSize:16 }}>✓</span>}
              {answered && i===selAns && i!==curQ.answer && <span style={{ marginLeft:"auto", fontSize:16 }}>✗</span>}
            </button>
          );
        })}
      </div>

      {/* Players answered indicator */}
      {answered && (
        <div style={{ marginTop:14, padding:"10px 16px", background:"#f0fdf4", border:"1px solid #86efac", borderRadius:10, fontSize:13, color:"#166534", ...s, fontWeight:600, textAlign:"center" }}>
          {selAns === curQ.answer ? `✓ Correct! +${myAns?.pts||0} points 🎉` : "✗ Wrong! Better luck next question"}
          {curQ.fact && <div style={{ marginTop:4, fontSize:12, color:"#4b5563", fontWeight:400 }}>💡 {curQ.fact}</div>}
        </div>
      )}

      {/* Live scoreboard */}
      <div style={{ marginTop:16, background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"12px 16px" }}>
        <div style={{ fontSize:10, fontWeight:700, color:"#374151", letterSpacing:0.8, marginBottom:8, ...s }}>LIVE SCORES</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {sorted.map((p,i) => (
            <div key={p.id} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:`${p.color}10`, border:`1px solid ${p.color}30`, borderRadius:20 }}>
              <span style={{ fontSize:12 }}>{MEDALS[i]||"•"}</span>
              <span style={{ fontSize:11, ...s, fontWeight:700, color:p.color }}>{p.name}</span>
              <span style={{ fontSize:11, ...s, color:p.color, fontWeight:800 }}>{p.score}</span>
            </div>
          ))}
        </div>
      </div>

      {role === "host" && <button onClick={advanceQuestion} style={{ marginTop:12, width:"100%", padding:"10px", background:"#ede9fe", border:"1px solid #c4b5fd", borderRadius:10, color:"#7c3aed", fontSize:13, fontWeight:600, cursor:"pointer", ...s }}>Skip → Next Question</button>}
    </div>
  );

  // RESULT SCREEN (brief between questions)
  if (screen === "result") return (
    <div style={{ textAlign:"center", padding:"48px 20px" }}>
      <div style={{ fontSize:56, marginBottom:14 }}>{myAns?.correct ? "🎉" : "😅"}</div>
      <div style={{ fontSize:22, fontWeight:800, color:"#111827", marginBottom:6, ...s }}>{myAns?.correct ? "Correct!" : "Not quite!"}</div>
      <div style={{ fontSize:15, color:"#6b7280", marginBottom:8 }}>+{myAns?.pts||0} points</div>
      {curQ?.fact && <div style={{ fontSize:13, color:"#4b5563", background:"#f3f4f6", padding:"10px 16px", borderRadius:10, display:"inline-block", maxWidth:400 }}>💡 {curQ.fact}</div>}
      <div style={{ marginTop:20, fontSize:13, color:"#9ca3af", ...s }}>Next question loading...</div>
    </div>
  );

  // LEADERBOARD
  if (screen === "leaderboard") return (
    <div>
      {/* Trophy header */}
      <div style={{ background:"linear-gradient(135deg,#78350f,#d97706)", borderRadius:20, padding:"28px", textAlign:"center", marginBottom:22, color:"#fff" }}>
        <div style={{ fontSize:52, marginBottom:8 }}>🏆</div>
        <div style={{ fontSize:22, fontWeight:800, ...s }}>Game Over!</div>
        <div style={{ fontSize:14, opacity:0.8, marginTop:4 }}>Topic: {room?.topic}</div>
      </div>

      {/* Top 3 podium */}
      {sorted.length >= 1 && (
        <div style={{ display:"flex", justifyContent:"center", alignItems:"flex-end", gap:12, marginBottom:22, padding:"0 10px" }}>
          {[sorted[1], sorted[0], sorted[2]].filter(Boolean).map((p, rank) => {
            const pos = rank === 0 ? 1 : rank === 1 ? 0 : 2; // reorder for visual podium (2nd,1st,3rd)
            const heights = ["160px","200px","130px"];
            const bgCols  = ["#d1d5db","#fde68a","#d9a96e"];
            const textCols = ["#374151","#92400e","#713f12"];
            return (
              <div key={p.id} style={{ flex:1, maxWidth:160, textAlign:"center" }}>
                <div style={{ fontSize:32, marginBottom:4 }}>{p.avatar}</div>
                <div style={{ fontSize:12, fontWeight:700, color:p.color, ...s, marginBottom:6, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}{p.id===myId?" (You)":""}</div>
                <div style={{ background:bgCols[pos], height:heights[pos], borderRadius:"12px 12px 0 0", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4 }}>
                  <div style={{ fontSize:28 }}>{MEDALS[pos]}</div>
                  <div style={{ fontSize:16, fontWeight:900, color:textCols[pos], ...s }}>{p.score}</div>
                  <div style={{ fontSize:10, color:textCols[pos], opacity:0.8, ...s }}>pts</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full ranking table */}
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, overflow:"hidden", marginBottom:16 }}>
        <div style={{ padding:"12px 18px", borderBottom:"1px solid #f3f4f6", fontSize:11, fontWeight:700, color:"#374151", letterSpacing:0.8, ...s }}>FINAL RANKINGS</div>
        {sorted.map((p, i) => (
          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"13px 18px", borderBottom:"1px solid #f9fafb", background:p.id===myId?"#fdf4ff":"#fff" }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:i<3?["#fde68a","#e5e7eb","#d9a96e"][i]:"#f3f4f6", display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
              {MEDALS[i] || <span style={{ fontSize:12, fontWeight:700, color:"#6b7280", ...s }}>#{i+1}</span>}
            </div>
            <span style={{ fontSize:20, flexShrink:0 }}>{p.avatar}</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:14, fontWeight:700, color:p.color, ...s }}>{p.name}{p.id===myId?" (You)":""}</div>
              <div style={{ fontSize:11, color:"#9ca3af" }}>{Object.values(p.answers||{}).filter(a=>a.correct).length}/{room?.questions?.length||0} correct</div>
            </div>
            <div style={{ fontSize:20, fontWeight:900, color:p.color, ...s }}>{p.score}</div>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:10 }}>
        {role === "host" && <button onClick={restart} style={{ flex:1, padding:"12px", background:"linear-gradient(135deg,#7c3aed,#4f46e5)", border:"none", borderRadius:12, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer", ...s }}>🔄 Play Again</button>}
        <button onClick={leaveRoom} style={{ flex:1, padding:"12px", background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:12, color:"#374151", fontSize:14, fontWeight:600, cursor:"pointer", ...s }}>🚪 Leave</button>
      </div>
    </div>
  );

  return null;
}



export default MultiplayerQuizPage;
