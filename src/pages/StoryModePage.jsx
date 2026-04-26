import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── STORY MODE PAGE ──────────────────────────────────────────────────────────
function StoryModePage({ addToast }) {
  const { studyMaterial } = useApp();
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [style, setStyle] = useState("adventure");
  const [readingIdx, setReadingIdx] = useState(-1);
  const [isReading, setIsReading] = useState(false);

  const STYLES = [
    { id:"adventure", label:"⚔️ Adventure", desc:"Epic quest story" },
    { id:"mystery", label:"🔍 Mystery", desc:"Detective thriller" },
    { id:"scifi", label:"🚀 Sci-Fi", desc:"Space & future" },
    { id:"fairytale", label:"🏰 Fairy Tale", desc:"Magical kingdom" },
    { id:"sports", label:"⚽ Sports", desc:"Championship game" },
  ];

  const generate = async () => {
    if (!studyMaterial) { addToast("Load study material on Home first!"); return; }
    setLoading(true); setStory(null);
    try {
      const styleMap = { adventure:"an epic fantasy adventure quest", mystery:"a detective mystery thriller", scifi:"a science fiction space adventure", fairytale:"a fairy tale in a magical kingdom", sports:"an exciting sports championship story" };
      const r = await callClaude(
        `Rewrite the following study material as ${styleMap[style]}. Make it ENGAGING and FUN while hiding all the educational concepts inside the story naturally.
Return ONLY JSON:
{"title":"Story title","genre":"${style}","coverEmoji":"big emoji for the story","chapters":[{"chapterNum":1,"title":"Chapter title","content":"2-3 paragraph story content (educational concepts woven in naturally)","conceptLearned":"What concept this chapter teaches","emoji":"chapter emoji"},...],"moral":"The educational moral/lesson of the whole story","characters":[{"name":"character name","role":"their role in story and what concept they represent"},...]}
Create 4-5 chapters. Keep each chapter 2-3 paragraphs. Make it genuinely fun to read!\n\n${studyMaterial.text.slice(0,10000)}`,
        "You are a creative educational storyteller. Return ONLY valid JSON.", 2000
      );
      const s = r.indexOf("{"), e = r.lastIndexOf("}");
      if (s===-1) throw new Error("Could not generate story.");
      setStory(JSON.parse(r.slice(s,e+1)));
      addToast("📖 Story ready! Happy reading!");
    } catch(err) { addToast("Error: " + err.message); }
    setLoading(false);
  };

  const readChapter = (idx) => {
    window.speechSynthesis.cancel();
    if (isReading && readingIdx === idx) { setIsReading(false); setReadingIdx(-1); return; }
    const ch = story.chapters[idx];
    const utt = new SpeechSynthesisUtterance(`Chapter ${ch.chapterNum}: ${ch.title}. ${ch.content}`);
    utt.rate = 0.9; utt.pitch = 1.05;
    utt.onend = () => { setIsReading(false); setReadingIdx(-1); };
    setIsReading(true); setReadingIdx(idx);
    window.speechSynthesis.speak(utt);
  };

  useEffect(() => () => window.speechSynthesis.cancel(), []);

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ margin:"0 0 3px", fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827" }}>🗺️ Story-Based Learning</h2>
          <p style={{ margin:0, fontSize:13, color:"#6b7280" }}>Your boring notes transformed into an exciting story</p>
        </div>
        <button onClick={generate} disabled={loading || !studyMaterial} style={{ padding:"10px 18px", background:loading?"#e9d5ff":"linear-gradient(135deg,#f59e0b,#d97706)", border:"none", borderRadius:11, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace", boxShadow:"0 4px 14px rgba(245,158,11,0.4)" }}>
          {loading ? "✨ Writing story..." : "📖 Tell My Story"}
        </button>
      </div>

      {/* Style selector */}
      <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
        {STYLES.map(st => (
          <button key={st.id} onClick={() => setStyle(st.id)} style={{ padding:"8px 14px", borderRadius:10, border:`2px solid ${style===st.id?"#f59e0b":"#e5e7eb"}`, background:style===st.id?"#fffbeb":"#f9fafb", cursor:"pointer", fontSize:12, fontWeight:600, color:style===st.id?"#92400e":"#6b7280", fontFamily:"'DM Mono',monospace" }}>
            {st.label}<span style={{ display:"block", fontSize:10, fontWeight:400, color:"#9ca3af" }}>{st.desc}</span>
          </button>
        ))}
      </div>

      {loading && <div style={{ textAlign:"center", padding:"48px 0" }}><div style={{ width:44, height:44, borderRadius:"50%", border:"4px solid #fef3c7", borderTopColor:"#f59e0b", animation:"spin 0.8s linear infinite", margin:"0 auto 14px" }}/><p style={{ color:"#d97706", fontFamily:"'DM Mono',monospace", fontSize:14 }}>Writing your story...</p></div>}
      {!studyMaterial && !loading && <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af" }}><div style={{ fontSize:48, marginBottom:12 }}>🗺️</div><p style={{ fontFamily:"'DM Mono',monospace", fontSize:14 }}>Load study material on Home first</p></div>}

      {story && !loading && (
        <div>
          {/* Book cover */}
          <div style={{ background:"linear-gradient(135deg,#1c1917,#292524)", borderRadius:20, padding:"32px", textAlign:"center", marginBottom:20, position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, bottom:0, background:"radial-gradient(circle at 30% 50%,rgba(245,158,11,0.15),transparent)", pointerEvents:"none" }}/>
            <div style={{ fontSize:64, marginBottom:12 }}>{story.coverEmoji}</div>
            <h2 style={{ margin:"0 0 8px", fontSize:24, fontWeight:900, color:"#fef3c7", fontFamily:"'DM Mono',monospace" }}>{story.title}</h2>
            <div style={{ display:"inline-block", padding:"4px 14px", background:"rgba(245,158,11,0.2)", borderRadius:20, fontSize:11, color:"#fbbf24", fontWeight:700, fontFamily:"'DM Mono',monospace", textTransform:"uppercase", letterSpacing:1 }}>{story.genre}</div>
            {story.characters && story.characters.length > 0 && (
              <div style={{ marginTop:16, display:"flex", justifyContent:"center", gap:12, flexWrap:"wrap" }}>
                {story.characters.map((c, i) => (
                  <div key={i} style={{ padding:"6px 12px", background:"rgba(255,255,255,0.08)", borderRadius:10, fontSize:11, color:"rgba(255,255,255,0.7)" }}>
                    <strong style={{ color:"#fbbf24" }}>{c.name}</strong> — {c.role}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chapters */}
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            {story.chapters.map((ch, i) => (
              <div key={i} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, overflow:"hidden" }}>
                <div style={{ background:"linear-gradient(135deg,#fffbeb,#fef3c7)", padding:"14px 20px", borderBottom:"1px solid #fde68a", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontSize:24 }}>{ch.emoji}</span>
                    <div>
                      <div style={{ fontSize:10, color:"#92400e", fontFamily:"'DM Mono',monospace", fontWeight:700, letterSpacing:0.8 }}>CHAPTER {ch.chapterNum}</div>
                      <div style={{ fontSize:15, fontWeight:800, color:"#78350f" }}>{ch.title}</div>
                    </div>
                  </div>
                  <button onClick={() => readChapter(i)} style={{ padding:"6px 14px", background:isReading&&readingIdx===i?"#f59e0b":"#fff", border:"1.5px solid #fcd34d", borderRadius:9, fontSize:12, color:isReading&&readingIdx===i?"#fff":"#92400e", cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>
                    {isReading && readingIdx===i ? "⏸ Pause" : "🔊 Read"}
                  </button>
                </div>
                <div style={{ padding:"18px 22px" }}>
                  <p style={{ margin:"0 0 14px", fontSize:14, color:"#374151", lineHeight:1.85, whiteSpace:"pre-wrap" }}>{ch.content}</p>
                  <div style={{ display:"inline-flex", alignItems:"center", gap:6, padding:"6px 12px", background:"#eff6ff", border:"1px solid #bfdbfe", borderRadius:8 }}>
                    <span style={{ fontSize:12 }}>🎓</span>
                    <span style={{ fontSize:12, color:"#1d4ed8", fontWeight:600, fontFamily:"'DM Mono',monospace" }}>Learned: {ch.conceptLearned}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Moral */}
          <div style={{ marginTop:16, background:"linear-gradient(135deg,#f59e0b,#d97706)", borderRadius:14, padding:"18px 22px", textAlign:"center" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.7)", letterSpacing:1, marginBottom:6, fontFamily:"'DM Mono',monospace" }}>THE MORAL OF THE STORY</div>
            <p style={{ margin:0, fontSize:15, fontWeight:700, color:"#fff", lineHeight:1.6 }}>"{story.moral}"</p>
          </div>
        </div>
      )}
    </div>
  );
}


export default StoryModePage;
