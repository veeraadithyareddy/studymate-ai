import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

function useBroadcast(channel, onMsg) {
  const bcRef = useRef();
  useEffect(() => {
    try { bcRef.current = new BroadcastChannel(channel); bcRef.current.onmessage = onMsg; }
    catch {}
    return () => { try { bcRef.current?.close(); } catch {} };
  }, [channel]);
  return () => { try { bcRef.current?.postMessage("sync"); } catch {} };
}
const uid = () => Math.random().toString(36).slice(2,10);
const shortCode = () => Math.random().toString(36).slice(2,7).toUpperCase();
const tsNow = () => new Date().toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"});
const MF = { fontFamily:"'DM Mono',monospace" };

// ═══════════════════════════════════════════════════════════════════════════════
// 1. STUDY GROUPS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function StudyGroupsPage({ addToast }) {
  const { studyMaterial } = useApp();
  const [screen, setScreen] = useState("home"); // home|create|room
  const [myName]  = useState(() => localStorage.getItem("smai_pname")||"Student");
  const [myId]    = useState(() => { const k="smai_uid"; let v=localStorage.getItem(k); if(!v){v=uid();localStorage.setItem(k,v);} return v; });
  const [groupCode, setGroupCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [group, setGroup] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [activeTab, setActiveTab] = useState("chat"); // chat|notes|quiz|mindmap
  const [quizQ, setQuizQ] = useState([]);
  const [quizLoading, setQuizLoading] = useState(false);
  const [sharedNote, setSharedNote] = useState("");
  const [mindmapData, setMindmapData] = useState(null);
  const [mindmapLoading, setMindmapLoading] = useState(false);
  const chatEndRef = useRef();
  const pollRef = useRef();
  const lastTsRef = useRef(0);

  const gKey = (c) => `smai_group_${c}`;

  const broadcast = useBroadcast("smai_groups_bc", () => { if(groupCode) pull(); });

  const pull = () => {
    const g = SS.get(gKey(groupCode));
    if (!g || g._ts === lastTsRef.current) return;
    lastTsRef.current = g._ts;
    setGroup(g);
    if (g.note !== undefined) setSharedNote(g.note);
    if (g.mindmap) setMindmapData(g.mindmap);
    if (g.quiz) setQuizQ(g.quiz);
  };

  const push = (patch) => {
    const cur = SS.get(gKey(groupCode)) || {};
    const next = { ...cur, ...patch };
    SS.set(gKey(groupCode), next);
    setGroup(next);
    broadcast();
  };

  useEffect(() => {
    if (!groupCode) return;
    pollRef.current = setInterval(pull, 800);
    return () => clearInterval(pollRef.current);
  }, [groupCode]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [group?.messages]);

  const createGroup = () => {
    if (!newGroupName.trim()) { addToast("Enter a group name"); return; }
    const code = shortCode();
    const groupData = {
      code, name: newGroupName.trim(), host: myId,
      members: { [myId]: { name:myName, role:"host", joined:tsNow(), avatar:"👑" } },
      messages: [{ id:uid(), from:"system", text:`📚 Group "${newGroupName}" created! Share code: ${code}`, ts:tsNow() }],
      note: "", quiz: [], mindmap: null, material: studyMaterial?.text?.slice(0,1500)||"",
    };
    SS.set(gKey(code), groupData);
    setGroupCode(code); setGroup(groupData); lastTsRef.current = groupData._ts || 0;
    setScreen("room");
    addToast(`✅ Group created! Code: ${code}`);
  };

  const joinGroup = () => {
    const c = joinCode.trim().toUpperCase();
    if (!c) { addToast("Enter group code"); return; }
    const g = SS.get(gKey(c));
    if (!g) { addToast("Group not found"); return; }
    const avatars = ["🐯","🦊","🐼","🦋","🐬","🦁","🐧","🦄"];
    const av = avatars[Object.keys(g.members||{}).length % avatars.length];
    const updated = {
      ...g,
      members: { ...g.members, [myId]: { name:myName, role:"member", joined:tsNow(), avatar:av } },
      messages: [...(g.messages||[]), { id:uid(), from:"system", text:`${av} ${myName} joined the group!`, ts:tsNow() }],
    };
    SS.set(gKey(c), updated);
    setGroupCode(c); setGroup(updated); lastTsRef.current = updated._ts||0;
    setScreen("room"); broadcast();
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const msg = { id:uid(), from:myId, name:myName, text:chatInput.trim(), ts:tsNow() };
    push({ messages: [...(group?.messages||[]), msg] });
    setChatInput("");
  };

  const saveNote = () => { push({ note: sharedNote }); addToast("📝 Note saved for everyone!"); };

  const genGroupQuiz = async () => {
    const mat = group?.material || studyMaterial?.text;
    if (!mat) { addToast("No material in group"); return; }
    setQuizLoading(true);
    try {
      const r = await callClaude(`Generate 5 MCQ quiz questions from: ${mat.slice(0,1500)}. Return ONLY JSON: [{"q":"question","options":["A","B","C","D"],"answer":0}]`);
      const s=r.indexOf("["),e=r.lastIndexOf("]");
      const qs = s>-1 ? JSON.parse(r.slice(s,e+1)) : [];
      push({ quiz: qs }); setQuizQ(qs);
      addToast("✅ Quiz shared with group!");
    } catch(e) { addToast("Error: "+e.message); }
    setQuizLoading(false);
  };

  const genMindmap = async () => {
    const mat = group?.material || studyMaterial?.text;
    if (!mat) { addToast("No material"); return; }
    setMindmapLoading(true);
    try {
      const r = await callClaude(`Create mind map JSON from: ${mat.slice(0,1500)}. Return ONLY: {"center":"topic","branches":[{"label":"branch","children":["item1","item2"]}]}`);
      const s=r.indexOf("{"),e=r.lastIndexOf("}");
      const data = s>-1 ? JSON.parse(r.slice(s,e+1)) : null;
      if (data) { push({ mindmap:data }); setMindmapData(data); addToast("🗺️ Mind map shared!"); }
    } catch(e) { addToast("Error: "+e.message); }
    setMindmapLoading(false);
  };

  const COLORS = ["#7c3aed","#2563eb","#16a34a","#d97706","#dc2626","#0891b2","#db2777","#059669"];

  if (screen === "home") return (
    <div>
      <div style={{background:"linear-gradient(135deg,#1e1b4b,#312e81)",borderRadius:20,padding:"28px 30px",marginBottom:24,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-10,top:-10,fontSize:100,opacity:0.07}}>👥</div>
        <div style={{fontSize:28,marginBottom:8}}>👥</div>
        <div style={{fontSize:18,fontWeight:800,...MF,marginBottom:4}}>Study Groups</div>
        <div style={{fontSize:13,opacity:0.75}}>Create or join a private group · Chat · Share notes · Group quiz · Mind map</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={{background:"#fff",border:"2px solid #e9d5ff",borderRadius:16,padding:"22px"}}>
          <div style={{fontSize:22,marginBottom:8}}>🆕</div>
          <div style={{fontSize:14,fontWeight:700,color:"#7c3aed",...MF,marginBottom:12}}>Create Group</div>
          <input value={newGroupName} onChange={e=>setNewGroupName(e.target.value)} placeholder="Group name e.g. Bio Study Squad"
            style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e5e7eb",borderRadius:9,fontSize:13,outline:"none",color:"#111",marginBottom:10,boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#7c3aed"} onBlur={e=>e.target.style.borderColor="#e5e7eb"}
            onKeyDown={e=>e.key==="Enter"&&createGroup()}
          />
          <button onClick={createGroup} style={{width:"100%",padding:"11px",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",...MF}}>
            🚀 Create Group
          </button>
        </div>
        <div style={{background:"#fff",border:"2px solid #bfdbfe",borderRadius:16,padding:"22px"}}>
          <div style={{fontSize:22,marginBottom:8}}>🔗</div>
          <div style={{fontSize:14,fontWeight:700,color:"#2563eb",...MF,marginBottom:12}}>Join Group</div>
          <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="Enter group code..." maxLength={6}
            style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e5e7eb",borderRadius:9,fontSize:16,outline:"none",color:"#111",marginBottom:10,boxSizing:"border-box",fontWeight:800,letterSpacing:4,textAlign:"center",...MF}}
            onFocus={e=>e.target.style.borderColor="#2563eb"} onBlur={e=>e.target.style.borderColor="#e5e7eb"}
            onKeyDown={e=>e.key==="Enter"&&joinGroup()}
          />
          <button onClick={joinGroup} style={{width:"100%",padding:"11px",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",...MF}}>
            🎯 Join Group
          </button>
        </div>
      </div>
    </div>
  );

  if (screen === "room" && group) {
    const members = Object.values(group.members||{});
    const TAB_CFG = [{id:"chat",icon:"💬",label:"Chat"},{id:"notes",icon:"📝",label:"Shared Notes"},{id:"quiz",icon:"❓",label:"Group Quiz"},{id:"mindmap",icon:"◉",label:"Mind Map"}];
    return (
      <div>
        {/* Header */}
        <div style={{background:"linear-gradient(135deg,#1e1b4b,#312e81)",borderRadius:16,padding:"16px 20px",marginBottom:16,color:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:11,opacity:0.6,...MF,letterSpacing:1}}>STUDY GROUP</div>
            <div style={{fontSize:18,fontWeight:800,...MF}}>{group.name}</div>
            <div style={{fontSize:11,opacity:0.7,marginTop:2}}>Code: <strong style={{letterSpacing:3}}>{groupCode}</strong> · {members.length} member{members.length!==1?"s":""}</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
            <div style={{display:"flex",gap:-6}}>
              {members.slice(0,5).map((m,i)=>(
                <div key={i} style={{width:28,height:28,borderRadius:"50%",background:COLORS[i%COLORS.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,marginLeft:i?-8:0,border:"2px solid #1e1b4b"}}>{m.avatar}</div>
              ))}
            </div>
            <button onClick={()=>setScreen("home")} style={{padding:"4px 12px",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:20,color:"#fff",fontSize:11,cursor:"pointer",...MF}}>Leave</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {TAB_CFG.map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{padding:"8px 14px",borderRadius:10,border:`1.5px solid ${activeTab===t.id?"#7c3aed":"#e5e7eb"}`,background:activeTab===t.id?"#ede9fe":"#fff",color:activeTab===t.id?"#7c3aed":"#6b7280",fontSize:12,fontWeight:700,cursor:"pointer",...MF}}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Chat */}
        {activeTab==="chat" && (
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,overflow:"hidden"}}>
            <div style={{height:360,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:10}}>
              {(group.messages||[]).map(msg=>(
                <div key={msg.id}>
                  {msg.from==="system" ? (
                    <div style={{textAlign:"center",padding:"6px 14px",background:"#f3f4f6",borderRadius:20,fontSize:11,color:"#6b7280",...MF,display:"inline-block",margin:"0 auto",width:"100%"}}>{msg.text}</div>
                  ) : (
                    <div style={{display:"flex",justifyContent:msg.from===myId?"flex-end":"flex-start",gap:8,alignItems:"flex-end"}}>
                      {msg.from!==myId && <div style={{width:28,height:28,borderRadius:"50%",background:COLORS[members.findIndex(m=>m.name===msg.name)%COLORS.length]||"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,fontWeight:700,color:"#fff"}}>{(msg.name||"?")[0]}</div>}
                      <div style={{maxWidth:"70%"}}>
                        {msg.from!==myId && <div style={{fontSize:10,color:"#9ca3af",...MF,marginBottom:2}}>{msg.name}</div>}
                        <div style={{padding:"9px 13px",borderRadius:msg.from===myId?"16px 16px 4px 16px":"4px 16px 16px 16px",background:msg.from===myId?"linear-gradient(135deg,#7c3aed,#4f46e5)":"#f3f4f6",color:msg.from===myId?"#fff":"#111",fontSize:13,lineHeight:1.6}}>{msg.text}</div>
                        <div style={{fontSize:9,color:"#d1d5db",...MF,marginTop:2,textAlign:msg.from===myId?"right":"left"}}>{msg.ts}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef}/>
            </div>
            <div style={{padding:"10px 12px",borderTop:"1px solid #e5e7eb",display:"flex",gap:8}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Type a message..." style={{flex:1,padding:"9px 13px",border:"1.5px solid #e5e7eb",borderRadius:10,fontSize:14,outline:"none",color:"#111"}} onFocus={e=>e.target.style.borderColor="#7c3aed"} onBlur={e=>e.target.style.borderColor="#e5e7eb"}/>
              <button onClick={sendChat} style={{padding:"9px 16px",background:"#7c3aed",border:"none",borderRadius:10,color:"#fff",fontSize:16,cursor:"pointer"}}>→</button>
            </div>
          </div>
        )}

        {/* Shared Notes */}
        {activeTab==="notes" && (
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:"18px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:13,fontWeight:700,color:"#111",...MF}}>📝 Shared Group Notes</div>
              <button onClick={saveNote} style={{padding:"7px 16px",background:"#16a34a",border:"none",borderRadius:9,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",...MF}}>💾 Save for All</button>
            </div>
            <textarea value={sharedNote} onChange={e=>setSharedNote(e.target.value)} placeholder="Type notes here — everyone in the group will see them when you save..."
              style={{width:"100%",minHeight:280,padding:"13px",border:"1.5px solid #e5e7eb",borderRadius:10,fontSize:14,outline:"none",color:"#111",lineHeight:1.7,resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}
              onFocus={e=>e.target.style.borderColor="#7c3aed"} onBlur={e=>e.target.style.borderColor="#e5e7eb"}
            />
            <p style={{margin:"8px 0 0",fontSize:11,color:"#9ca3af",...MF}}>Last updated by group members. Click "Save for All" to push your changes.</p>
          </div>
        )}

        {/* Group Quiz */}
        {activeTab==="quiz" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,color:"#111",...MF}}>❓ Group Quiz</div>
              <button onClick={genGroupQuiz} disabled={quizLoading} style={{padding:"8px 16px",background:"#7c3aed",border:"none",borderRadius:9,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",...MF}}>
                {quizLoading?"Generating...":"✨ Generate & Share Quiz"}
              </button>
            </div>
            {quizQ.length===0 && <div style={{textAlign:"center",padding:"40px 0",color:"#9ca3af",fontSize:13,...MF}}>No quiz yet. Generate one to share with the group!</div>}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {quizQ.map((q,i)=>(
                <div key={i} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:"16px 18px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#111",marginBottom:10}}>Q{i+1}. {q.q}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {q.options.map((opt,oi)=>(
                      <div key={oi} style={{padding:"8px 11px",borderRadius:8,background:oi===q.answer?"#dcfce7":"#f3f4f6",border:`1px solid ${oi===q.answer?"#86efac":"#e5e7eb"}`,fontSize:12,color:oi===q.answer?"#166534":"#374151",fontWeight:oi===q.answer?700:400}}>
                        {oi===q.answer?"✓ ":""}{opt}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mind Map */}
        {activeTab==="mindmap" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:13,fontWeight:700,color:"#111",...MF}}>◉ Collaborative Mind Map</div>
              <button onClick={genMindmap} disabled={mindmapLoading} style={{padding:"8px 16px",background:"#7c3aed",border:"none",borderRadius:9,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",...MF}}>
                {mindmapLoading?"Generating...":"◉ Generate & Share"}
              </button>
            </div>
            {!mindmapData && <div style={{textAlign:"center",padding:"40px 0",color:"#9ca3af",fontSize:13,...MF}}>No mind map yet. Generate one to share!</div>}
            {mindmapData && (
              <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:"18px"}}>
                <div style={{textAlign:"center",marginBottom:16}}>
                  <div style={{display:"inline-block",padding:"10px 22px",background:"linear-gradient(135deg,#7c3aed,#4f46e5)",color:"#fff",borderRadius:12,fontSize:14,fontWeight:800,...MF}}>{mindmapData.center}</div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
                  {(mindmapData.branches||[]).map((b,bi)=>{
                    const bc = COLORS[bi%COLORS.length];
                    return (
                      <div key={bi} style={{border:`1.5px solid ${bc}33`,borderRadius:12,overflow:"hidden"}}>
                        <div style={{background:`${bc}15`,padding:"8px 13px",borderBottom:`1px solid ${bc}22`,display:"flex",alignItems:"center",gap:7}}>
                          <div style={{width:8,height:8,borderRadius:"50%",background:bc}}/>
                          <span style={{fontSize:12,fontWeight:700,color:bc,...MF}}>{b.label}</span>
                        </div>
                        <div style={{padding:"9px 13px",display:"flex",flexDirection:"column",gap:5}}>
                          {(b.children||[]).map((c,ci)=>(
                            <div key={ci} style={{display:"flex",gap:7,alignItems:"flex-start"}}>
                              <div style={{width:5,height:5,borderRadius:"50%",background:`${bc}88`,marginTop:5,flexShrink:0}}/>
                              <span style={{fontSize:12,color:"#374151",lineHeight:1.5}}>{c}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. SHARE & CHALLENGE PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function ShareChallengePage({ addToast }) {
  const { studyMaterial } = useApp();
  const [screen, setScreen] = useState("home"); // home|create|take|results
  const [myName] = useState(() => localStorage.getItem("smai_pname")||"Student");
  const [myId]   = useState(() => { const k="smai_uid"; let v=localStorage.getItem(k); if(!v){v=uid();localStorage.setItem(k,v);} return v; });
  const [challengeCode, setChallengeCode] = useState("");
  const [enterCode, setEnterCode] = useState("");
  const [topic, setTopic] = useState("");
  const [numQ, setNumQ] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  const timerRef = useRef();
  const pollRef = useRef();

  const cKey = (c) => `smai_challenge_${c}`;

  const broadcast = useBroadcast("smai_challenge_bc", () => {});

  const generateChallenge = async () => {
    const mat = topic.trim() || studyMaterial?.text?.slice(0,1500) || "";
    if (!mat) { addToast("Enter a topic or load material"); return; }
    setGenerating(true);
    try {
      const r = await callClaude(
        `Generate ${numQ} MCQ quiz questions about: "${mat.slice(0,800)}". Return ONLY JSON array: [{"q":"question","options":["A","B","C","D"],"answer":0,"explanation":"why this is correct in 1 sentence"}]`,
        "Quiz generator. Return ONLY valid JSON array.", 1000
      );
      const s=r.indexOf("["),e=r.lastIndexOf("]");
      if(s===-1) throw new Error("Generation failed");
      const qs = JSON.parse(r.slice(s,e+1));
      const code = shortCode();
      const challengeData = {
        code, topic: topic||"Study Quiz", creator: myName, creatorId: myId,
        questions: qs, createdAt: tsNow(),
        leaderboard: { [myId]: { name:myName, score:0, done:false, time:0 } },
      };
      SS.set(cKey(code), challengeData);
      setChallengeCode(code); setChallenge(challengeData);
      setScreen("created");
      addToast(`✅ Challenge created! Code: ${code}`);
    } catch(e) { addToast("Error: "+e.message); }
    setGenerating(false);
  };

  const loadChallenge = () => {
    const c = enterCode.trim().toUpperCase();
    if (!c) { addToast("Enter challenge code"); return; }
    const ch = SS.get(cKey(c));
    if (!ch) { addToast("Challenge not found!"); return; }
    setChallengeCode(c); setChallenge(ch); setCurrent(0); setAnswers([]); setScore(0); setDone(false);
    setScreen("take");
    setTimeLeft(20);
    timerRef.current = setInterval(()=>setTimeLeft(t=>{ if(t<=1){clearInterval(timerRef.current);nextQ(null);return 20;}return t-1;}),1000);
  };

  const nextQ = (chosen) => {
    clearInterval(timerRef.current);
    const q = challenge.questions[current];
    const correct = chosen === q.answer;
    const pts = correct ? 100 : 0;
    const newAnswers = [...answers, { chosen, correct, pts }];
    const newScore = score + pts;
    setAnswers(newAnswers); setScore(newScore);
    if (current + 1 >= challenge.questions.length) {
      // save to leaderboard
      const cur = SS.get(cKey(challengeCode)) || challenge;
      const lb = { ...(cur.leaderboard||{}), [myId]: { name:myName, score:newScore, done:true, time:tsNow() } };
      SS.set(cKey(challengeCode), { ...cur, leaderboard:lb });
      broadcast();
      setDone(true); setScreen("results");
    } else {
      setCurrent(c => c+1);
      setTimeLeft(20);
      timerRef.current = setInterval(()=>setTimeLeft(t=>{ if(t<=1){clearInterval(timerRef.current);nextQ(null);return 20;}return t-1;}),1000);
    }
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  // Poll leaderboard on results screen
  useEffect(() => {
    if (screen !== "results") return;
    pollRef.current = setInterval(() => {
      const fresh = SS.get(cKey(challengeCode));
      if (fresh) setChallenge(fresh);
    }, 1500);
    return () => clearInterval(pollRef.current);
  }, [screen, challengeCode]);

  const waLink = () => {
    const msg = `🎯 I challenge you to a quiz!\nTopic: ${challenge?.topic}\nCode: ${challengeCode}\nOpen Study Mate AI → Share & Challenge → Enter code!`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };

  const sorted = challenge ? Object.values(challenge.leaderboard||{}).sort((a,b)=>b.score-a.score) : [];

  // HOME
  if (screen==="home") return (
    <div>
      <div style={{background:"linear-gradient(135deg,#0f2027,#203a43,#2c5364)",borderRadius:20,padding:"28px 30px",marginBottom:24,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-10,top:-10,fontSize:100,opacity:0.07}}>📤</div>
        <div style={{fontSize:28,marginBottom:8}}>📤</div>
        <div style={{fontSize:18,fontWeight:800,...MF,marginBottom:4}}>Share & Challenge</div>
        <div style={{fontSize:13,opacity:0.75}}>Create a quiz → Share code on WhatsApp → Compare scores with friends!</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Create */}
        <div style={{background:"#fff",border:"2px solid #bfdbfe",borderRadius:16,padding:"22px"}}>
          <div style={{fontSize:22,marginBottom:8}}>🎯</div>
          <div style={{fontSize:14,fontWeight:700,color:"#2563eb",...MF,marginBottom:12}}>Create Challenge</div>
          <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Topic (or use loaded material)"
            style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e5e7eb",borderRadius:9,fontSize:13,outline:"none",color:"#111",marginBottom:10,boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#2563eb"} onBlur={e=>e.target.style.borderColor="#e5e7eb"}
          />
          <div style={{display:"flex",gap:8,marginBottom:14,alignItems:"center"}}>
            <span style={{fontSize:12,color:"#6b7280",...MF}}>Questions:</span>
            {[5,8,10].map(n=>(
              <button key={n} onClick={()=>setNumQ(n)} style={{padding:"4px 11px",borderRadius:8,border:`1.5px solid ${numQ===n?"#2563eb":"#e5e7eb"}`,background:numQ===n?"#dbeafe":"#f9fafb",color:numQ===n?"#2563eb":"#6b7280",fontSize:12,cursor:"pointer",fontWeight:700,...MF}}>{n}</button>
            ))}
          </div>
          <button onClick={generateChallenge} disabled={generating} style={{width:"100%",padding:"11px",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",...MF}}>
            {generating?<><div style={{width:12,height:12,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.4)",borderTopColor:"#fff",animation:"spin 0.8s linear infinite",display:"inline-block",marginRight:6}}/>Generating...</>:"⚡ Create & Share"}
          </button>
        </div>
        {/* Take */}
        <div style={{background:"#fff",border:"2px solid #d1fae5",borderRadius:16,padding:"22px"}}>
          <div style={{fontSize:22,marginBottom:8}}>🏆</div>
          <div style={{fontSize:14,fontWeight:700,color:"#16a34a",...MF,marginBottom:12}}>Take a Challenge</div>
          <input value={enterCode} onChange={e=>setEnterCode(e.target.value.toUpperCase())} placeholder="Enter challenge code..." maxLength={6}
            style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e5e7eb",borderRadius:9,fontSize:16,outline:"none",color:"#111",marginBottom:10,boxSizing:"border-box",fontWeight:800,letterSpacing:4,textAlign:"center",...MF}}
            onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e5e7eb"}
            onKeyDown={e=>e.key==="Enter"&&loadChallenge()}
          />
          <p style={{fontSize:11,color:"#9ca3af",marginBottom:14}}>Get the code from your friend's WhatsApp</p>
          <button onClick={loadChallenge} style={{width:"100%",padding:"11px",background:"linear-gradient(135deg,#16a34a,#15803d)",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",...MF}}>
            🎮 Take Challenge
          </button>
        </div>
      </div>
    </div>
  );

  // CREATED — show share options
  if (screen==="created" && challenge) return (
    <div>
      <div style={{background:"linear-gradient(135deg,#0f2027,#2c5364)",borderRadius:20,padding:"28px",textAlign:"center",marginBottom:20,color:"#fff"}}>
        <div style={{fontSize:48,marginBottom:12}}>🎯</div>
        <div style={{fontSize:11,opacity:0.6,...MF,letterSpacing:1,marginBottom:4}}>YOUR CHALLENGE CODE</div>
        <div style={{fontSize:48,fontWeight:900,letterSpacing:12,...MF}}>{challengeCode}</div>
        <div style={{fontSize:13,opacity:0.7,marginTop:8}}>Topic: {challenge.topic} · {challenge.questions.length} questions</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
        <a href={waLink()} target="_blank" rel="noopener noreferrer" style={{textDecoration:"none"}}>
          <button style={{width:"100%",padding:"14px",background:"linear-gradient(135deg,#25D366,#128C7E)",border:"none",borderRadius:12,color:"#fff",fontSize:15,fontWeight:800,cursor:"pointer",...MF,display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:"0 4px 16px rgba(37,211,102,0.4)"}}>
            <span style={{fontSize:22}}>💬</span> Share on WhatsApp
          </button>
        </a>
        <button onClick={()=>{navigator.clipboard?.writeText(challengeCode);addToast("Code copied!");}} style={{width:"100%",padding:"12px",background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",color:"#374151",...MF}}>
          📋 Copy Code: {challengeCode}
        </button>
        <button onClick={()=>setScreen("results")} style={{width:"100%",padding:"12px",background:"#ede9fe",border:"1px solid #c4b5fd",borderRadius:12,fontSize:14,fontWeight:700,cursor:"pointer",color:"#7c3aed",...MF}}>
          🏆 View Leaderboard
        </button>
      </div>
      <button onClick={()=>setScreen("home")} style={{width:"100%",padding:"10px",background:"#fff",border:"1px solid #e5e7eb",borderRadius:10,fontSize:13,color:"#6b7280",cursor:"pointer",...MF}}>← Back</button>
    </div>
  );

  // TAKE QUIZ
  if (screen==="take" && challenge && !done) {
    const q = challenge.questions[current];
    const pct = ((current)/challenge.questions.length)*100;
    return (
      <div style={{maxWidth:540,margin:"0 auto"}}>
        <div style={{background:"linear-gradient(135deg,#1e1b4b,#312e81)",borderRadius:16,padding:"16px 20px",marginBottom:16,color:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div><div style={{fontSize:11,...MF,opacity:0.6}}>Q {current+1}/{challenge.questions.length}</div><div style={{fontSize:12,fontWeight:700,...MF}}>{challenge.topic}</div></div>
          <div style={{textAlign:"center"}}><div style={{fontSize:30,fontWeight:900,...MF,color:timeLeft<=5?"#f87171":"#fff"}}>{timeLeft}</div><div style={{fontSize:10,opacity:0.6}}>sec</div></div>
          <div style={{textAlign:"right"}}><div style={{fontSize:10,opacity:0.6,...MF}}>SCORE</div><div style={{fontSize:18,fontWeight:800,...MF,color:"#a5f3fc"}}>{score}</div></div>
        </div>
        <div style={{height:4,background:"#e9d5ff",borderRadius:99,marginBottom:16,overflow:"hidden"}}>
          <div style={{height:"100%",background:"linear-gradient(90deg,#7c3aed,#4f46e5)",width:`${(timeLeft/20)*100}%`,transition:"width 1s linear"}}/>
        </div>
        <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:"22px",marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#7c3aed",...MF,marginBottom:8}}>QUESTION {current+1}</div>
          <p style={{margin:0,fontSize:16,fontWeight:700,color:"#111",lineHeight:1.55}}>{q.q}</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {q.options.map((opt,i)=>(
            <button key={i} onClick={()=>nextQ(i)} style={{padding:"14px",borderRadius:12,border:"2px solid #e5e7eb",background:"#f8f7ff",fontSize:13,color:"#374151",cursor:"pointer",textAlign:"left",fontWeight:600,display:"flex",alignItems:"center",gap:10,transition:"all 0.15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="#7c3aed";e.currentTarget.style.background="#ede9fe";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="#e5e7eb";e.currentTarget.style.background="#f8f7ff";}}>
              <span style={{fontSize:18}}>{"🅐🅑🅒🅓"[i*2]}{"🅐🅑🅒🅓"[i*2+1]}</span>{opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // RESULTS
  if (screen==="results") {
    const fresh = SS.get(cKey(challengeCode)) || challenge;
    const lb = Object.values(fresh?.leaderboard||{}).sort((a,b)=>b.score-a.score);
    const myEntry = fresh?.leaderboard?.[myId];
    return (
      <div>
        <div style={{background:"linear-gradient(135deg,#78350f,#d97706)",borderRadius:20,padding:"28px",textAlign:"center",marginBottom:20,color:"#fff"}}>
          <div style={{fontSize:48,marginBottom:8}}>🏆</div>
          <div style={{fontSize:20,fontWeight:800,...MF}}>Challenge Results</div>
          <div style={{fontSize:13,opacity:0.8,marginTop:4}}>{challenge?.topic} · {challenge?.questions?.length} questions</div>
          {myEntry && <div style={{marginTop:12,fontSize:24,fontWeight:900,...MF,color:"#fde68a"}}>Your Score: {myEntry.score}/{(challenge?.questions?.length||0)*100}</div>}
        </div>
        <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,overflow:"hidden",marginBottom:16}}>
          <div style={{padding:"12px 18px",borderBottom:"1px solid #f3f4f6",fontSize:11,fontWeight:700,...MF,color:"#374151",letterSpacing:0.5}}>LEADERBOARD · {lb.length} player{lb.length!==1?"s":""}</div>
          {lb.map((p,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 18px",borderBottom:"1px solid #f9fafb",background:p.name===myName?"#fdf4ff":"#fff"}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:i<3?["#fde68a","#e5e7eb","#d9a96e"][i]:"#f3f4f6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{["🥇","🥈","🥉"][i]||<span style={{fontSize:12,fontWeight:700,color:"#6b7280",...MF}}>#{i+1}</span>}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:700,color:"#111",...MF}}>{p.name}{p.name===myName?" (You)":""}</div>
                <div style={{fontSize:11,color:p.done?"#16a34a":"#9ca3af",...MF}}>{p.done?"✅ Completed":p.time||"⏳ Not completed"}</div>
              </div>
              <div style={{fontSize:20,fontWeight:900,color:"#7c3aed",...MF}}>{p.score}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:10}}>
          {challenge && <a href={waLink()} target="_blank" rel="noopener noreferrer" style={{flex:1,textDecoration:"none"}}><button style={{width:"100%",padding:"12px",background:"linear-gradient(135deg,#25D366,#128C7E)",border:"none",borderRadius:12,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",...MF}}>💬 Share on WhatsApp</button></a>}
          <button onClick={()=>setScreen("home")} style={{flex:1,padding:"12px",background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:12,color:"#374151",fontSize:13,fontWeight:600,cursor:"pointer",...MF}}>🏠 Home</button>
        </div>
      </div>
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. VIRTUAL CLASSROOM PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function ClassroomPage({ addToast }) {
  const { studyMaterial } = useApp();
  const [screen, setScreen] = useState("home"); // home|room
  const [role, setRole] = useState(null);
  const [myName] = useState(() => localStorage.getItem("smai_pname")||"Student");
  const [myId]   = useState(() => { const k="smai_uid"; let v=localStorage.getItem(k); if(!v){v=uid();localStorage.setItem(k,v);} return v; });
  const [className, setClassName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [classCode, setClassCode] = useState("");
  const [classroom, setClassroom] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [activeSection, setActiveSection] = useState("board"); // board|chat|quiz|students
  const [quizLoading, setQuizLoading] = useState(false);
  const [questionInput, setQuestionInput] = useState("");
  const [raisedHand, setRaisedHand] = useState(false);
  const chatEndRef = useRef();
  const pollRef = useRef();
  const lastTsRef = useRef(0);

  const clKey = (c) => `smai_class_${c}`;
  const broadcast = useBroadcast("smai_class_bc", ()=>{ if(classCode) pull(); });

  const pull = () => {
    const cl = SS.get(clKey(classCode));
    if (!cl || cl._ts===lastTsRef.current) return;
    lastTsRef.current = cl._ts;
    setClassroom(cl);
  };

  const push = (patch) => {
    const cur = SS.get(clKey(classCode)) || {};
    const next = { ...cur, ...patch };
    SS.set(clKey(classCode), next);
    setClassroom(next);
    broadcast();
  };

  useEffect(() => {
    if (!classCode) return;
    pollRef.current = setInterval(pull, 800);
    return () => clearInterval(pollRef.current);
  }, [classCode]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({behavior:"smooth"}); }, [classroom?.chat]);

  const createClass = () => {
    if (!className.trim()) { addToast("Enter class name"); return; }
    const code = shortCode();
    const cl = {
      code, name: className.trim(), teacher: myName, teacherId: myId,
      students: { [myId]: { name:myName, role:"teacher", joined:tsNow(), handRaised:false } },
      board: studyMaterial?.text?.slice(0,2000) || "Welcome to the classroom! Teacher will share material here.",
      chat: [{ id:uid(), from:"system", text:`🏫 Class "${className}" started! Code: ${code}`, ts:tsNow() }],
      quiz: [], announcements: [], currentSlide: 0, material: studyMaterial?.text?.slice(0,2000)||"",
    };
    SS.set(clKey(code), cl);
    setClassCode(code); setClassroom(cl); setRole("teacher"); lastTsRef.current = cl._ts||0;
    setScreen("room");
    addToast(`✅ Class created! Code: ${code}`);
  };

  const joinClass = () => {
    const c = joinCode.trim().toUpperCase();
    if (!c) { addToast("Enter class code"); return; }
    const cl = SS.get(clKey(c));
    if (!cl) { addToast("Class not found"); return; }
    const updated = {
      ...cl,
      students: { ...cl.students, [myId]: { name:myName, role:"student", joined:tsNow(), handRaised:false } },
      chat: [...(cl.chat||[]), { id:uid(), from:"system", text:`🎒 ${myName} joined the class!`, ts:tsNow() }],
    };
    SS.set(clKey(c), updated);
    setClassCode(c); setClassroom(updated); setRole("student"); lastTsRef.current = updated._ts||0;
    setScreen("room");
    broadcast();
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const msg = { id:uid(), from:myId, name:myName, role, text:chatInput.trim(), ts:tsNow() };
    push({ chat: [...(classroom?.chat||[]), msg] });
    setChatInput("");
  };

  const updateBoard = (text) => { push({ board: text }); };

  const raiseHand = () => {
    const newState = !raisedHand;
    setRaisedHand(newState);
    const cur = SS.get(clKey(classCode)) || classroom;
    const updated = { ...cur, students: { ...cur.students, [myId]: { ...cur.students?.[myId], handRaised:newState } } };
    SS.set(clKey(classCode), updated); setClassroom(updated); broadcast();
  };

  const askQuestion = () => {
    if (!questionInput.trim()) return;
    const msg = { id:uid(), from:myId, name:myName, role:"student", text:`✋ ${questionInput.trim()}`, ts:tsNow(), isQuestion:true };
    push({ chat: [...(classroom?.chat||[]), msg] });
    setQuestionInput(""); setRaisedHand(false);
    const cur2 = SS.get(clKey(classCode)) || classroom;
    const upd2 = { ...cur2, students: { ...cur2.students, [myId]: { ...cur2.students?.[myId], handRaised:false } } };
    SS.set(clKey(classCode), upd2); setClassroom(upd2); broadcast();
  };

  const genClassQuiz = async () => {
    const mat = classroom?.material;
    if (!mat) { addToast("No material loaded"); return; }
    setQuizLoading(true);
    try {
      const r = await callClaude(`Generate 5 MCQ questions from: ${mat.slice(0,1500)}. Return ONLY JSON: [{"q":"?","options":["A","B","C","D"],"answer":0}]`);
      const s=r.indexOf("["),e=r.lastIndexOf("]");
      const qs = s>-1?JSON.parse(r.slice(s,e+1)):[];
      push({ quiz:qs, chat:[...(classroom?.chat||[]),{id:uid(),from:"system",text:`📝 Teacher assigned a quiz! ${qs.length} questions.`,ts:tsNow()}] });
      addToast("✅ Quiz assigned to class!");
    } catch(e) { addToast("Error: "+e.message); }
    setQuizLoading(false);
  };

  const COLORS = ["#7c3aed","#2563eb","#16a34a","#d97706","#dc2626","#0891b2"];
  const students = classroom ? Object.values(classroom.students||{}) : [];
  const raisedHands = students.filter(s=>s.handRaised);

  if (screen==="home") return (
    <div>
      <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:20,padding:"28px 30px",marginBottom:24,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-10,top:-10,fontSize:100,opacity:0.07}}>🏫</div>
        <div style={{fontSize:28,marginBottom:8}}>🏫</div>
        <div style={{fontSize:18,fontWeight:800,...MF,marginBottom:4}}>Virtual Classroom</div>
        <div style={{fontSize:13,opacity:0.75}}>Teacher shares material · Students join live · Real-time board · Class quiz · Q&A</div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        <div style={{background:"#fff",border:"2px solid #bbf7d0",borderRadius:16,padding:"22px"}}>
          <div style={{fontSize:22,marginBottom:8}}>👩‍🏫</div>
          <div style={{fontSize:14,fontWeight:700,color:"#16a34a",...MF,marginBottom:12}}>Create Classroom</div>
          <input value={className} onChange={e=>setClassName(e.target.value)} placeholder="Class name e.g. Biology Grade 10"
            style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e5e7eb",borderRadius:9,fontSize:13,outline:"none",color:"#111",marginBottom:10,boxSizing:"border-box"}}
            onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e5e7eb"}
          />
          <button onClick={createClass} style={{width:"100%",padding:"11px",background:"linear-gradient(135deg,#16a34a,#15803d)",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",...MF}}>
            🏫 Create Classroom
          </button>
        </div>
        <div style={{background:"#fff",border:"2px solid #fed7aa",borderRadius:16,padding:"22px"}}>
          <div style={{fontSize:22,marginBottom:8}}>🎒</div>
          <div style={{fontSize:14,fontWeight:700,color:"#ea580c",...MF,marginBottom:12}}>Join Classroom</div>
          <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase())} placeholder="Enter class code..." maxLength={6}
            style={{width:"100%",padding:"9px 12px",border:"1.5px solid #e5e7eb",borderRadius:9,fontSize:16,outline:"none",color:"#111",marginBottom:10,boxSizing:"border-box",fontWeight:800,letterSpacing:4,textAlign:"center",...MF}}
            onFocus={e=>e.target.style.borderColor="#ea580c"} onBlur={e=>e.target.style.borderColor="#e5e7eb"}
            onKeyDown={e=>e.key==="Enter"&&joinClass()}
          />
          <button onClick={joinClass} style={{width:"100%",padding:"11px",background:"linear-gradient(135deg,#ea580c,#c2410c)",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",...MF}}>
            🎒 Join Class
          </button>
        </div>
      </div>
    </div>
  );

  if (screen==="room" && classroom) {
    const SEC = [{id:"board",icon:"📋",label:"Board"},{id:"chat",icon:"💬",label:"Chat"},{id:"quiz",icon:"❓",label:"Quiz"},{id:"students",icon:"👥",label:"Students"}];
    return (
      <div>
        {/* Classroom header */}
        <div style={{background:"linear-gradient(135deg,#064e3b,#065f46)",borderRadius:16,padding:"14px 20px",marginBottom:16,color:"#fff",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontSize:10,...MF,opacity:0.6,letterSpacing:1}}>{role==="teacher"?"YOU ARE TEACHING":"YOU ARE A STUDENT"}</div>
            <div style={{fontSize:17,fontWeight:800,...MF}}>{classroom.name}</div>
            <div style={{fontSize:11,opacity:0.7}}>Code: <strong style={{letterSpacing:3}}>{classCode}</strong> · {students.length} online</div>
          </div>
          <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
            {raisedHands.length > 0 && <div style={{padding:"3px 10px",background:"rgba(251,191,36,0.3)",borderRadius:20,fontSize:11,color:"#fbbf24",...MF}}>✋ {raisedHands.length} hand{raisedHands.length>1?"s":""} raised</div>}
            <button onClick={()=>setScreen("home")} style={{padding:"4px 12px",background:"rgba(255,255,255,0.1)",border:"1px solid rgba(255,255,255,0.2)",borderRadius:20,color:"#fff",fontSize:11,cursor:"pointer",...MF}}>Leave</button>
          </div>
        </div>

        {/* Section tabs */}
        <div style={{display:"flex",gap:6,marginBottom:16}}>
          {SEC.map(s=>(
            <button key={s.id} onClick={()=>setActiveSection(s.id)} style={{padding:"8px 14px",borderRadius:10,border:`1.5px solid ${activeSection===s.id?"#16a34a":"#e5e7eb"}`,background:activeSection===s.id?"#dcfce7":"#fff",color:activeSection===s.id?"#16a34a":"#6b7280",fontSize:12,fontWeight:700,cursor:"pointer",...MF}}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>

        {/* Board */}
        {activeSection==="board" && (
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,overflow:"hidden"}}>
            <div style={{padding:"12px 18px",borderBottom:"1px solid #e5e7eb",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:"#111",...MF}}>📋 Class Board {role==="teacher"&&"(editable)"}</div>
              {role==="teacher" && <button onClick={()=>updateBoard(classroom.board)} style={{padding:"5px 12px",background:"#16a34a",border:"none",borderRadius:8,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",...MF}}>📡 Push to Students</button>}
            </div>
            {role==="teacher" ? (
              <textarea defaultValue={classroom.board} onBlur={e=>updateBoard(e.target.value)}
                style={{width:"100%",minHeight:320,padding:"16px 18px",border:"none",outline:"none",fontSize:14,lineHeight:1.75,color:"#111",resize:"vertical",boxSizing:"border-box",fontFamily:"inherit"}}
                placeholder="Type or paste material here — students will see this in real-time when you push..."
              />
            ) : (
              <div style={{minHeight:320,padding:"16px 18px",fontSize:14,lineHeight:1.75,color:"#111",whiteSpace:"pre-wrap"}}>{classroom.board}</div>
            )}
          </div>
        )}

        {/* Chat */}
        {activeSection==="chat" && (
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,overflow:"hidden"}}>
            <div style={{height:340,overflowY:"auto",padding:"14px 16px",display:"flex",flexDirection:"column",gap:8}}>
              {(classroom.chat||[]).map(msg=>(
                <div key={msg.id}>
                  {msg.from==="system" ? (
                    <div style={{textAlign:"center",padding:"5px 14px",background:"#f3f4f6",borderRadius:20,fontSize:11,color:"#6b7280",...MF}}>{msg.text}</div>
                  ) : (
                    <div style={{display:"flex",justifyContent:msg.from===myId?"flex-end":"flex-start",gap:8,alignItems:"flex-end"}}>
                      {msg.from!==myId && <div style={{width:26,height:26,borderRadius:"50%",background:msg.role==="teacher"?"#16a34a":"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0,color:"#fff",fontWeight:700}}>{(msg.name||"?")[0]}</div>}
                      <div style={{maxWidth:"72%"}}>
                        {msg.from!==myId && <div style={{fontSize:10,color:"#9ca3af",...MF,marginBottom:2}}>{msg.name} {msg.role==="teacher"?"👩‍🏫":""}</div>}
                        <div style={{padding:"9px 13px",borderRadius:msg.from===myId?"16px 16px 4px 16px":"4px 16px 16px 16px",background:msg.isQuestion?"#fffbeb":msg.from===myId?"linear-gradient(135deg,#16a34a,#15803d)":"#f3f4f6",color:msg.isQuestion?"#92400e":msg.from===myId?"#fff":"#111",fontSize:13,lineHeight:1.6,border:msg.isQuestion?"1px solid #fde68a":"none"}}>{msg.text}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef}/>
            </div>
            {role==="student" && (
              <div style={{padding:"10px 12px",borderTop:"1px solid #f3f4f6",background:"#fafafa"}}>
                <div style={{display:"flex",gap:8,marginBottom:6}}>
                  <input value={questionInput} onChange={e=>setQuestionInput(e.target.value)} placeholder="Ask a question..." style={{flex:1,padding:"8px 12px",border:"1.5px solid #e5e7eb",borderRadius:9,fontSize:13,outline:"none",color:"#111"}} onFocus={e=>e.target.style.borderColor="#ea580c"} onBlur={e=>e.target.style.borderColor="#e5e7eb"} onKeyDown={e=>e.key==="Enter"&&askQuestion()}/>
                  <button onClick={askQuestion} style={{padding:"8px 14px",background:"#ea580c",border:"none",borderRadius:9,color:"#fff",fontSize:13,cursor:"pointer",fontWeight:700}}>✋ Ask</button>
                </div>
              </div>
            )}
            <div style={{padding:"10px 12px",borderTop:"1px solid #f3f4f6",display:"flex",gap:8}}>
              <input value={chatInput} onChange={e=>setChatInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendChat()} placeholder="Type a message..." style={{flex:1,padding:"8px 12px",border:"1.5px solid #e5e7eb",borderRadius:9,fontSize:13,outline:"none",color:"#111"}} onFocus={e=>e.target.style.borderColor="#16a34a"} onBlur={e=>e.target.style.borderColor="#e5e7eb"}/>
              <button onClick={sendChat} style={{padding:"8px 14px",background:"#16a34a",border:"none",borderRadius:9,color:"#fff",fontSize:16,cursor:"pointer"}}>→</button>
            </div>
          </div>
        )}

        {/* Quiz */}
        {activeSection==="quiz" && (
          <div>
            {role==="teacher" && (
              <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
                <button onClick={genClassQuiz} disabled={quizLoading} style={{padding:"9px 18px",background:"#16a34a",border:"none",borderRadius:10,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",...MF}}>
                  {quizLoading?"Generating...":"✨ Generate & Assign Quiz"}
                </button>
              </div>
            )}
            {(!classroom.quiz||classroom.quiz.length===0) && <div style={{textAlign:"center",padding:"40px 0",color:"#9ca3af",...MF,fontSize:13}}>No quiz assigned yet.</div>}
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {(classroom.quiz||[]).map((q,i)=>(
                <div key={i} style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:14,padding:"16px"}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#111",marginBottom:10}}>Q{i+1}. {q.q}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                    {q.options.map((opt,oi)=>(
                      <div key={oi} style={{padding:"8px 11px",borderRadius:8,background:oi===q.answer?"#dcfce7":"#f3f4f6",border:`1px solid ${oi===q.answer?"#86efac":"#e5e7eb"}`,fontSize:12,color:oi===q.answer?"#166534":"#374151",fontWeight:oi===q.answer?700:400}}>{oi===q.answer?"✓ ":""}{opt}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Students */}
        {activeSection==="students" && (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:10}}>
            {students.map((s,i)=>(
              <div key={i} style={{background:"#fff",border:`1.5px solid ${s.role==="teacher"?"#86efac":"#e5e7eb"}`,borderRadius:12,padding:"14px",textAlign:"center"}}>
                <div style={{width:40,height:40,borderRadius:"50%",background:COLORS[i%COLORS.length],display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#fff",margin:"0 auto 8px"}}>{s.name?.[0]||"?"}</div>
                <div style={{fontSize:13,fontWeight:700,color:"#111",...MF}}>{s.name}</div>
                <div style={{fontSize:11,color:s.role==="teacher"?"#16a34a":"#6b7280",...MF}}>{s.role==="teacher"?"👩‍🏫 Teacher":"🎒 Student"}</div>
                {s.handRaised && <div style={{marginTop:6,fontSize:11,color:"#d97706",fontWeight:700}}>✋ Hand raised</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PEER LEARNING PAGE
// ═══════════════════════════════════════════════════════════════════════════════
function PeerLearningPage({ addToast }) {
  const { studyMaterial } = useApp();
  const [myName] = useState(() => localStorage.getItem("smai_pname")||"Student");
  const [myId]   = useState(() => { const k="smai_uid"; let v=localStorage.getItem(k); if(!v){v=uid();localStorage.setItem(k,v);} return v; });
  const [topic, setTopic] = useState("");
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const [explanations, setExplanations] = useState({}); // qIdx -> explanation text
  const [myExplanation, setMyExplanation] = useState("");
  const [savingExp, setSavingExp] = useState(false);
  const [peersLoading, setPeersLoading] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const [aiExpLoading, setAiExpLoading] = useState(false);

  const pKey = (t) => `smai_peer_${t.replace(/\s+/g,"_").toLowerCase().slice(0,30)}`;

  const generateQuiz = async () => {
    const mat = topic.trim() || studyMaterial?.text?.slice(0,1500) || "";
    if (!mat) { addToast("Enter a topic or load material"); return; }
    setLoading(true); setQuestions([]); setCurrent(0); setSelected(null); setShowExplanation(false); setScore(0); setDone(false); setExplanations({}); setMyExplanation(""); setAiExplanation("");
    try {
      const r = await callClaude(
        `Generate 6 MCQ questions about: "${mat.slice(0,1000)}". Make some of them tricky!
Return ONLY JSON: [{"q":"question","options":["A","B","C","D"],"answer":0,"explanation":"clear explanation of why answer is correct","difficulty":"easy/medium/hard"}]`,
        "Quiz generator. Return ONLY valid JSON.", 1200
      );
      const s=r.indexOf("["),e=r.lastIndexOf("]");
      if(s===-1) throw new Error("Failed to generate");
      const qs = JSON.parse(r.slice(s,e+1));
      setQuestions(qs);
      // Load any saved peer explanations for this topic
      const saved = SS.get(pKey(topic||"study")) || {};
      setExplanations(saved);
    } catch(e) { addToast("Error: "+e.message); }
    setLoading(false);
  };

  const submitAnswer = (idx) => {
    if (selected !== null) return;
    setSelected(idx);
    setShowExplanation(true);
    if (idx === questions[current].answer) setScore(s=>s+1);
    // Load AI simple explanation on wrong answer
    if (idx !== questions[current].answer) generateAiSimpleExplanation();
  };

  const generateAiSimpleExplanation = async () => {
    const q = questions[current];
    setAiExpLoading(true);
    try {
      const r = await callClaude(
        `A student got this wrong. Explain the correct answer simply and engagingly in 2-3 sentences using an analogy or real-world example a student would understand:
Question: ${q.q}
Correct answer: ${q.options[q.answer]}`,
        "You are a friendly peer tutor. Explain simply.", 300
      );
      setAiExplanation(r);
    } catch {}
    setAiExpLoading(false);
  };

  const saveMyExplanation = () => {
    if (!myExplanation.trim()) return;
    setSavingExp(true);
    const key = pKey(topic||"study");
    const saved = SS.get(key) || {};
    const qKey = `q${current}`;
    const existing = saved[qKey] || [];
    const newExp = { id:uid(), name:myName, text:myExplanation.trim(), ts:tsNow(), likes:0 };
    const updated = { ...saved, [qKey]: [...existing.slice(-4), newExp] }; // keep last 5
    SS.set(key, updated);
    setExplanations(updated);
    setMyExplanation("");
    setSavingExp(false);
    addToast("💬 Your explanation saved!");
  };

  const likeExplanation = (qKey, expId) => {
    const key = pKey(topic||"study");
    const saved = SS.get(key) || explanations;
    const updated = {
      ...saved,
      [qKey]: (saved[qKey]||[]).map(e => e.id===expId ? {...e, likes:(e.likes||0)+1} : e)
    };
    SS.set(key, updated);
    setExplanations(updated);
  };

  const nextQ = () => {
    if (current+1 >= questions.length) { setDone(true); return; }
    setCurrent(c=>c+1); setSelected(null); setShowExplanation(false); setMyExplanation(""); setAiExplanation(""); setAiExpLoading(false);
  };

  const q = questions[current];
  const qKey = `q${current}`;
  const peerExps = explanations[qKey] || [];

  return (
    <div>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#1e3a5f,#1e40af)",borderRadius:20,padding:"24px 28px",marginBottom:22,color:"#fff",position:"relative",overflow:"hidden"}}>
        <div style={{position:"absolute",right:-10,top:-10,fontSize:100,opacity:0.07}}>💬</div>
        <div style={{fontSize:28,marginBottom:8}}>💬</div>
        <div style={{fontSize:18,fontWeight:800,...MF,marginBottom:4}}>Peer Learning</div>
        <div style={{fontSize:13,opacity:0.75}}>Answer questions → See how peers explained it → Learn from each other</div>
      </div>

      {/* Setup */}
      {questions.length === 0 && !loading && (
        <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:"22px",marginBottom:16}}>
          <label style={{fontSize:12,fontWeight:700,color:"#374151",...MF,letterSpacing:0.5,display:"block",marginBottom:8}}>TOPIC OR CONCEPT</label>
          <div style={{display:"flex",gap:10}}>
            <input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="e.g. Photosynthesis, French Revolution, Quadratic equations..."
              style={{flex:1,padding:"11px 14px",border:"1.5px solid #e5e7eb",borderRadius:10,fontSize:14,outline:"none",color:"#111"}}
              onFocus={e=>e.target.style.borderColor="#2563eb"} onBlur={e=>e.target.style.borderColor="#e5e7eb"}
              onKeyDown={e=>e.key==="Enter"&&generateQuiz()}
            />
            <button onClick={generateQuiz} disabled={loading} style={{padding:"11px 20px",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",borderRadius:10,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",...MF}}>
              Start →
            </button>
          </div>
          {studyMaterial && <p style={{fontSize:12,color:"#9ca3af",margin:"8px 0 0"}}>💡 Leave blank to use your loaded study material</p>}
        </div>
      )}

      {loading && <div style={{textAlign:"center",padding:"48px 0"}}><div style={{width:44,height:44,borderRadius:"50%",border:"4px solid #dbeafe",borderTopColor:"#2563eb",animation:"spin 0.8s linear infinite",margin:"0 auto 14px"}}/><p style={{color:"#2563eb",...MF,fontSize:14}}>Generating peer questions...</p></div>}

      {/* Quiz in progress */}
      {questions.length>0 && !done && q && (
        <div>
          {/* Progress */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <span style={{fontSize:12,color:"#374151",...MF,fontWeight:600}}>Q {current+1} of {questions.length}</span>
            <span style={{fontSize:12,color:"#2563eb",...MF,fontWeight:700}}>Score: {score}/{current}</span>
            <span style={{fontSize:11,padding:"3px 10px",background:q.difficulty==="hard"?"#fef2f2":q.difficulty==="medium"?"#fffbeb":"#f0fdf4",border:`1px solid ${q.difficulty==="hard"?"#fca5a5":q.difficulty==="medium"?"#fcd34d":"#86efac"}`,borderRadius:20,color:q.difficulty==="hard"?"#dc2626":q.difficulty==="medium"?"#d97706":"#16a34a",...MF,fontWeight:700,textTransform:"capitalize"}}>{q.difficulty||"medium"}</span>
          </div>
          <div style={{height:5,background:"#dbeafe",borderRadius:99,marginBottom:18,overflow:"hidden"}}>
            <div style={{height:"100%",background:"linear-gradient(90deg,#2563eb,#7c3aed)",borderRadius:99,width:`${((current+1)/questions.length)*100}%`,transition:"width 0.3s"}}/>
          </div>

          {/* Question */}
          <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:16,padding:"20px 22px",marginBottom:14}}>
            <p style={{margin:0,fontSize:16,fontWeight:700,color:"#111",lineHeight:1.55}}>{q.q}</p>
          </div>

          {/* Options */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
            {q.options.map((opt,i)=>{
              let bg="#f8f7ff",border="#e5e7eb",col="#374151";
              if(selected!==null){
                if(i===q.answer){bg="#dcfce7";border="#86efac";col="#166534";}
                else if(i===selected&&i!==q.answer){bg="#fef2f2";border="#fca5a5";col="#dc2626";}
                else{bg="#f9fafb";border="#e5e7eb";col="#9ca3af";}
              }
              return (
                <button key={i} onClick={()=>submitAnswer(i)} disabled={selected!==null}
                  style={{padding:"13px 14px",borderRadius:12,border:`2px solid ${border}`,background:bg,fontSize:13,color:col,cursor:selected!==null?"default":"pointer",textAlign:"left",fontWeight:600,display:"flex",alignItems:"center",gap:10,transition:"all 0.15s"}}>
                  <span style={{fontSize:18,flexShrink:0}}>{"🅐🅑🅒🅓"[i*2]}{"🅐🅑🅒🅓"[i*2+1]}</span>
                  <span style={{lineHeight:1.4}}>{opt}</span>
                  {selected!==null&&i===q.answer&&<span style={{marginLeft:"auto"}}>✓</span>}
                  {selected!==null&&i===selected&&i!==q.answer&&<span style={{marginLeft:"auto"}}>✗</span>}
                </button>
              );
            })}
          </div>

          {/* Explanation section after answer */}
          {showExplanation && (
            <div>
              {/* Official explanation */}
              <div style={{padding:"14px 16px",background:selected===q.answer?"#f0fdf4":"#fef2f2",border:`1px solid ${selected===q.answer?"#86efac":"#fca5a5"}`,borderRadius:12,marginBottom:12}}>
                <div style={{fontSize:11,fontWeight:700,...MF,color:selected===q.answer?"#16a34a":"#dc2626",marginBottom:6}}>
                  {selected===q.answer?"✅ CORRECT!":"❌ INCORRECT — Here's why:"}
                </div>
                <p style={{margin:0,fontSize:13,color:"#374151",lineHeight:1.65}}>{q.explanation}</p>
              </div>

              {/* AI peer-style explanation on wrong answer */}
              {selected!==q.answer && (
                <div style={{padding:"14px 16px",background:"#eff6ff",border:"1px solid #bfdbfe",borderRadius:12,marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:700,...MF,color:"#2563eb",marginBottom:6}}>🤖 AI EXPLAINS IT SIMPLY:</div>
                  {aiExpLoading ? <p style={{margin:0,fontSize:13,color:"#6b7280",...MF}}>Loading simple explanation...</p> : <p style={{margin:0,fontSize:13,color:"#1e40af",lineHeight:1.65}}>{aiExplanation}</p>}
                </div>
              )}

              {/* Peer explanations */}
              {peerExps.length > 0 && (
                <div style={{background:"#fff",border:"1px solid #e5e7eb",borderRadius:12,overflow:"hidden",marginBottom:12}}>
                  <div style={{padding:"10px 14px",borderBottom:"1px solid #f3f4f6",fontSize:11,fontWeight:700,...MF,color:"#374151",letterSpacing:0.5}}>
                    💬 HOW {peerExps.length} PEER{peerExps.length>1?"S":""} EXPLAINED IT:
                  </div>
                  {peerExps.map((exp,ei)=>(
                    <div key={ei} style={{padding:"12px 14px",borderBottom:"1px solid #f9fafb",display:"flex",gap:10,alignItems:"flex-start"}}>
                      <div style={{width:28,height:28,borderRadius:"50%",background:"#7c3aed",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:"#fff",fontWeight:700,flexShrink:0}}>{exp.name?.[0]||"P"}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:11,...MF,color:"#6b7280",marginBottom:3}}>{exp.name} · {exp.ts}</div>
                        <p style={{margin:0,fontSize:13,color:"#374151",lineHeight:1.6}}>{exp.text}</p>
                      </div>
                      <button onClick={()=>likeExplanation(qKey,exp.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 8px",background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:20,fontSize:11,cursor:"pointer",color:"#6b7280",...MF,flexShrink:0}}>
                        👍 {exp.likes||0}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add your explanation */}
              <div style={{background:"#fdf4ff",border:"1px solid #e9d5ff",borderRadius:12,padding:"14px"}}>
                <div style={{fontSize:11,fontWeight:700,...MF,color:"#7c3aed",marginBottom:8}}>💬 SHARE YOUR EXPLANATION (helps other students!)</div>
                <textarea value={myExplanation} onChange={e=>setMyExplanation(e.target.value)} placeholder="Explain this in your own words — use an analogy, a story, or a tip..."
                  style={{width:"100%",minHeight:72,padding:"10px 12px",border:"1.5px solid #e9d5ff",borderRadius:9,fontSize:13,outline:"none",color:"#111",lineHeight:1.6,resize:"none",boxSizing:"border-box",fontFamily:"inherit",marginBottom:8}}
                  onFocus={e=>e.target.style.borderColor="#7c3aed"} onBlur={e=>e.target.style.borderColor="#e9d5ff"}
                />
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,color:"#9ca3af"}}>Your explanation helps peers who got this wrong!</span>
                  <button onClick={saveMyExplanation} disabled={!myExplanation.trim()||savingExp} style={{padding:"7px 16px",background:"#7c3aed",border:"none",borderRadius:9,color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",...MF}}>
                    💾 Share
                  </button>
                </div>
              </div>

              <button onClick={nextQ} style={{width:"100%",padding:"12px",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",...MF,marginTop:12}}>
                {current+1>=questions.length?"🏁 See Results":"Next Question →"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Done screen */}
      {done && (
        <div style={{textAlign:"center"}}>
          <div style={{background:"linear-gradient(135deg,#1e3a5f,#1e40af)",borderRadius:20,padding:"32px",marginBottom:20,color:"#fff"}}>
            <div style={{fontSize:52,marginBottom:10}}>{score>=questions.length*0.8?"🌟":score>=questions.length*0.5?"👍":"💪"}</div>
            <div style={{fontSize:22,fontWeight:900,...MF,marginBottom:6}}>Quiz Complete!</div>
            <div style={{fontSize:32,fontWeight:900,...MF,color:"#93c5fd"}}>{score}/{questions.length}</div>
            <div style={{fontSize:14,opacity:0.75,marginTop:4}}>{score>=questions.length*0.8?"Excellent!":score>=questions.length*0.5?"Good effort!":"Keep practising!"}</div>
          </div>
          <div style={{display:"flex",gap:10}}>
            <button onClick={()=>{setQuestions([]);setDone(false);setCurrent(0);setScore(0);setSelected(null);setShowExplanation(false);}} style={{flex:1,padding:"12px",background:"linear-gradient(135deg,#2563eb,#1d4ed8)",border:"none",borderRadius:12,color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",...MF}}>🔄 Try Again</button>
            <button onClick={()=>{setQuestions([]);setDone(false);setTopic("");}} style={{flex:1,padding:"12px",background:"#f3f4f6",border:"1px solid #e5e7eb",borderRadius:12,color:"#374151",fontSize:14,fontWeight:600,cursor:"pointer",...MF}}>New Topic</button>
          </div>
        </div>
      )}
    </div>
  );
}




export { StudyGroupsPage, ShareChallengePage, ClassroomPage, PeerLearningPage };
