import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── EXPLAINER VIDEO PAGE ────────────────────────────────────────────────────
function ExplainerVideoPage({ addToast }) {
  const { studyMaterial } = useApp();
  const [slides, setSlides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [autoPlay, setAutoPlay] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [voiceIdx, setVoiceIdx] = useState(0);
  const [voices, setVoices] = useState([]);
  const [progress, setProgress] = useState(0);
  const [generated, setGenerated] = useState(false);
  const uttRef = useRef(null);
  const autoRef = useRef(null);
  const wordIdxRef = useRef(0);
  const totalWordsRef = useRef(0);

  // Slide themes
  const THEMES = [
    { bg:"linear-gradient(135deg,#1e1b4b,#312e81)", text:"#e0e7ff", accent:"#a5b4fc", sub:"#818cf8", badge:"rgba(165,180,252,0.15)" },
    { bg:"linear-gradient(135deg,#064e3b,#065f46)", text:"#d1fae5", accent:"#6ee7b7", sub:"#34d399", badge:"rgba(110,231,183,0.15)" },
    { bg:"linear-gradient(135deg,#1e3a5f,#1e40af)", text:"#dbeafe", accent:"#93c5fd", sub:"#60a5fa", badge:"rgba(147,197,253,0.15)" },
    { bg:"linear-gradient(135deg,#4a1d96,#6d28d9)", text:"#ede9fe", accent:"#c4b5fd", sub:"#a78bfa", badge:"rgba(196,181,253,0.15)" },
    { bg:"linear-gradient(135deg,#7f1d1d,#991b1b)", text:"#fee2e2", accent:"#fca5a5", sub:"#f87171", badge:"rgba(252,165,165,0.15)" },
    { bg:"linear-gradient(135deg,#1c1917,#292524)", text:"#e7e5e4", accent:"#d6d3d1", sub:"#a8a29e", badge:"rgba(214,211,209,0.15)" },
  ];

  // Load TTS voices
  useEffect(() => {
    const load = () => {
      const v = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith("en"));
      if (v.length) setVoices(v);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    setTimeout(load, 1000);
  }, []);

  // Stop speech on unmount
  useEffect(() => () => { window.speechSynthesis.cancel(); clearTimeout(autoRef.current); }, []);

  const stopSpeech = () => {
    window.speechSynthesis.cancel();
    setPlaying(false); setProgress(0);
    wordIdxRef.current = 0;
    clearTimeout(autoRef.current);
  };

  const speakSlide = (slideIdx, afterDone) => {
    if (slideIdx >= slides.length) { setPlaying(false); setAutoPlay(false); return; }
    window.speechSynthesis.cancel();
    const slide = slides[slideIdx];
    const text = `${slide.title}. ${slide.body} ${slide.bullets ? slide.bullets.join(". ") : ""}`.trim();
    const utt = new SpeechSynthesisUtterance(text);
    utt.rate = speed;
    if (voices[voiceIdx]) utt.voice = voices[voiceIdx];
    totalWordsRef.current = text.split(/\s+/).length;
    wordIdxRef.current = 0;
    utt.onboundary = (e) => {
      if (e.name === "word") {
        wordIdxRef.current++;
        setProgress(Math.round((wordIdxRef.current / totalWordsRef.current) * 100));
      }
    };
    utt.onstart = () => setPlaying(true);
    utt.onend = () => {
      setPlaying(false); setProgress(0);
      if (afterDone) afterDone();
    };
    utt.onerror = () => setPlaying(false);
    uttRef.current = utt;
    window.speechSynthesis.speak(utt);
  };

  const playCurrentSlide = () => {
    if (playing) { stopSpeech(); return; }
    speakSlide(current, null);
  };

  const goTo = (idx) => {
    stopSpeech();
    setCurrent(idx); setProgress(0);
  };

  const next = () => { if (current < slides.length - 1) goTo(current + 1); };
  const prev = () => { if (current > 0) goTo(current - 1); };

  // Auto-play: speak slide, then advance, loop
  const startAutoPlay = () => {
    setAutoPlay(true);
    const playNext = (idx) => {
      if (idx >= slides.length) { setAutoPlay(false); setPlaying(false); return; }
      setCurrent(idx);
      speakSlide(idx, () => {
        autoRef.current = setTimeout(() => playNext(idx + 1), 600);
      });
    };
    playNext(current);
  };

  const stopAutoPlay = () => {
    stopSpeech();
    setAutoPlay(false);
  };

  // Generate slides from material
  const generate = async () => {
    if (!studyMaterial) { addToast("Load study material on Home first!"); return; }
    setLoading(true); setGenerated(false); stopSpeech(); setCurrent(0);
    try {
      const mat = studyMaterial.text.slice(0, 12000);
      const prompt = `You are creating slides for an educational explainer video from study notes.

Create exactly 8 slides. Each slide should cover one clear concept or section.
Return ONLY a valid JSON array, no other text:
[
  {
    "slideNum": 1,
    "type": "title",
    "title": "Main topic name",
    "body": "One sentence introduction to the topic",
    "bullets": [],
    "emoji": "🎓",
    "theme": 0
  },
  {
    "slideNum": 2,
    "type": "concept",
    "title": "Concept name",
    "body": "Clear explanation in 1-2 sentences",
    "bullets": ["Key point 1", "Key point 2", "Key point 3"],
    "emoji": "💡",
    "theme": 1
  }
]

Rules:
- Slide 1 must be type "title" (intro)
- Slides 2-7 must be type "concept" (one key concept each)
- Slide 8 must be type "summary" (recap all key points)
- theme: use values 0-5 rotating
- emoji: pick a relevant emoji for each slide
- bullets: 2-4 short bullet points per concept slide, empty array for title slide
- body: always plain text, no markdown
- All content based ONLY on this material:

${mat}`;

      const r = await callClaude(prompt,
        "You are an educational slide generator. Return ONLY a valid JSON array of slide objects. No markdown, no explanation.", 2000);

      // Extract JSON array
      const start = r.indexOf("[");
      const end = r.lastIndexOf("]");
      if (start === -1 || end === -1) throw new Error("Invalid response. Try again.");
      const arr = JSON.parse(r.slice(start, end + 1));
      if (!arr.length) throw new Error("No slides generated.");
      setSlides(arr);
      setCurrent(0);
      setGenerated(true);
      addToast(`${arr.length} slides generated!`);
    } catch(e) {
      addToast("Error: " + e.message);
    }
    setLoading(false);
  };

  const slide = slides[current];
  const theme = slide ? THEMES[slide.theme % THEMES.length] : THEMES[0];

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:22, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ margin:"0 0 3px", fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827" }}>Explainer Video</h2>
          <p style={{ margin:0, fontSize:13, color:"#6b7280" }}>AI generates slides from your notes with text-to-speech narration</p>
        </div>
        <button onClick={generate} disabled={loading || !studyMaterial} style={{
          padding:"10px 22px", background:loading||!studyMaterial?"#e9d5ff":"linear-gradient(135deg,#7c3aed,#4f46e5)",
          border:"none", borderRadius:11, color:"#fff", fontSize:13, fontWeight:700,
          cursor:loading||!studyMaterial?"default":"pointer", fontFamily:"'DM Mono',monospace",
          boxShadow:"0 4px 14px rgba(124,58,237,0.3)", display:"flex", alignItems:"center", gap:8
        }}>
          {loading
            ? <><div style={{ width:15, height:15, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", animation:"spin 0.8s linear infinite" }}/> Generating...</>
            : <><span>🎬</span><span>{generated ? "Regenerate" : "Generate Slides"}</span></>}
        </button>
      </div>

      {!studyMaterial && (
        <div style={{ textAlign:"center", padding:"70px 0", color:"#9ca3af" }}>
          <div style={{ fontSize:48, marginBottom:14 }}>🎬</div>
          <p style={{ fontFamily:"'DM Mono',monospace", fontSize:14, margin:"0 0 8px" }}>No study material loaded</p>
          <p style={{ fontSize:13, color:"#d1d5db" }}>Go to Home → paste your notes → come back here</p>
        </div>
      )}

      {studyMaterial && !generated && !loading && (
        <div style={{ textAlign:"center", padding:"70px 0", color:"#9ca3af" }}>
          <div style={{ fontSize:48, marginBottom:14 }}>🎬</div>
          <p style={{ fontFamily:"'DM Mono',monospace", fontSize:14, margin:"0 0 8px" }}>Ready to generate</p>
          <p style={{ fontSize:13, color:"#d1d5db" }}>Click "Generate Slides" — AI will create 8 slides with narration</p>
        </div>
      )}

      {loading && (
        <div style={{ textAlign:"center", padding:"60px 0" }}>
          <div style={{ width:48, height:48, borderRadius:"50%", border:"4px solid #ede9fe", borderTopColor:"#7c3aed", animation:"spin 0.8s linear infinite", margin:"0 auto 16px" }} />
          <p style={{ color:"#7c3aed", fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:600, margin:"0 0 6px" }}>Generating your slides...</p>
          <p style={{ color:"#9ca3af", fontSize:12, margin:0 }}>AI is reading your material and creating slide content</p>
        </div>
      )}

      {generated && slides.length > 0 && !loading && (
        <div>
          {/* ── MAIN SLIDE ── */}
          <div style={{
            background: theme.bg,
            borderRadius: 20,
            padding: "0",
            marginBottom: 16,
            minHeight: 400,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            boxShadow: "0 12px 40px rgba(0,0,0,0.25)",
            position: "relative",
          }}>
            {/* Top bar */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 22px", borderBottom:`1px solid rgba(255,255,255,0.08)` }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#ff5f57" }} />
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#febc2e" }} />
                <div style={{ width:10, height:10, borderRadius:"50%", background:"#28c840" }} />
              </div>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontFamily:"'DM Mono',monospace" }}>
                {current + 1} / {slides.length}
              </span>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.4)", fontFamily:"'DM Mono',monospace", textTransform:"uppercase", letterSpacing:0.8 }}>
                {slide.type}
              </span>
            </div>

            {/* Slide content */}
            <div style={{ flex:1, padding:"32px 40px 28px", display:"flex", flexDirection:"column", justifyContent:"center" }}>
              {/* Emoji + badge */}
              <div style={{ marginBottom:20, display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ fontSize:36, lineHeight:1 }}>{slide.emoji}</div>
                {slide.type === "title" && (
                  <div style={{ padding:"4px 14px", background:theme.badge, borderRadius:20, fontSize:11, color:theme.sub, fontFamily:"'DM Mono',monospace", fontWeight:700, letterSpacing:0.8 }}>INTRO</div>
                )}
                {slide.type === "summary" && (
                  <div style={{ padding:"4px 14px", background:theme.badge, borderRadius:20, fontSize:11, color:theme.sub, fontFamily:"'DM Mono',monospace", fontWeight:700, letterSpacing:0.8 }}>SUMMARY</div>
                )}
              </div>

              {/* Title */}
              <h2 style={{ margin:"0 0 14px", fontSize:slide.type==="title"?32:26, fontWeight:800, color:theme.text, lineHeight:1.25, letterSpacing:-0.5 }}>
                {slide.title}
              </h2>

              {/* Body */}
              <p style={{ margin:"0 0 20px", fontSize:15, color:theme.accent, lineHeight:1.75, maxWidth:640 }}>
                {slide.body}
              </p>

              {/* Bullets */}
              {slide.bullets && slide.bullets.length > 0 && (
                <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                  {slide.bullets.map((b, i) => (
                    <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                      <div style={{
                        width:22, height:22, borderRadius:7, background:theme.badge,
                        border:`1px solid ${theme.sub}44`,
                        display:"flex", alignItems:"center", justifyContent:"center",
                        fontSize:11, fontWeight:800, color:theme.sub, flexShrink:0, marginTop:2,
                        fontFamily:"'DM Mono',monospace",
                      }}>{i+1}</div>
                      <span style={{ fontSize:14, color:theme.text, lineHeight:1.6, opacity:0.9 }}>{b}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* TTS progress bar at bottom of slide */}
            {playing && (
              <div style={{ height:3, background:"rgba(255,255,255,0.1)" }}>
                <div style={{ height:"100%", background:theme.sub, borderRadius:99, width:`${progress}%`, transition:"width 0.3s" }} />
              </div>
            )}
          </div>

          {/* ── CONTROLS ── */}
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"16px 20px", marginBottom:16 }}>
            {/* Main playback buttons */}
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
              <button onClick={prev} disabled={current === 0} style={{ padding:"9px 16px", background:"#f3f4f6", border:"none", borderRadius:9, fontSize:14, cursor:current===0?"default":"pointer", color:current===0?"#d1d5db":"#374151", fontWeight:600 }}>← Prev</button>

              <button onClick={playCurrentSlide} style={{
                padding:"9px 20px", background:playing?"#f59e0b":"#7c3aed",
                border:"none", borderRadius:9, color:"#fff", fontSize:13, fontWeight:700,
                cursor:"pointer", fontFamily:"'DM Mono',monospace", display:"flex", alignItems:"center", gap:6,
              }}>
                {playing ? <><span>⏸</span> Pause</> : <><span>▶</span> Play Slide</>}
              </button>

              {!autoPlay ? (
                <button onClick={startAutoPlay} style={{
                  padding:"9px 18px", background:"linear-gradient(135deg,#16a34a,#15803d)",
                  border:"none", borderRadius:9, color:"#fff", fontSize:13, fontWeight:700,
                  cursor:"pointer", fontFamily:"'DM Mono',monospace", display:"flex", alignItems:"center", gap:6,
                  boxShadow:"0 3px 10px rgba(22,163,74,0.3)",
                }}>
                  <span>▶▶</span> Auto Play All
                </button>
              ) : (
                <button onClick={stopAutoPlay} style={{
                  padding:"9px 18px", background:"#dc2626", border:"none", borderRadius:9,
                  color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace",
                }}>⏹ Stop</button>
              )}

              <button onClick={next} disabled={current === slides.length - 1} style={{ padding:"9px 16px", background:"#f3f4f6", border:"none", borderRadius:9, fontSize:14, cursor:current===slides.length-1?"default":"pointer", color:current===slides.length-1?"#d1d5db":"#374151", fontWeight:600 }}>Next →</button>

              <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:12, color:"#6b7280", fontFamily:"'DM Mono',monospace" }}>Speed</span>
                {[0.75, 1, 1.25, 1.5].map(s => (
                  <button key={s} onClick={() => { setSpeed(s); stopSpeech(); }} style={{
                    padding:"5px 10px", borderRadius:7, border:`1.5px solid ${speed===s?"#7c3aed":"#e5e7eb"}`,
                    background:speed===s?"#ede9fe":"#f9fafb", color:speed===s?"#7c3aed":"#6b7280",
                    fontSize:11, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:700,
                  }}>{s}x</button>
                ))}
              </div>
            </div>

            {/* Voice selector */}
            {voices.length > 0 && (
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, flexWrap:"wrap" }}>
                <span style={{ fontSize:12, color:"#6b7280", fontFamily:"'DM Mono',monospace", flexShrink:0 }}>🎙 Voice:</span>
                <select value={voiceIdx} onChange={e => { setVoiceIdx(Number(e.target.value)); stopSpeech(); }}
                  style={{ padding:"6px 10px", border:"1.5px solid #e5e7eb", borderRadius:8, fontSize:12, color:"#374151", background:"#fff", cursor:"pointer", outline:"none", maxWidth:260 }}>
                  {voices.map((v, i) => <option key={i} value={i}>{v.name} ({v.lang})</option>)}
                </select>
                {playing && <span style={{ fontSize:12, color:"#7c3aed", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>🔊 Speaking... {progress}%</span>}
              </div>
            )}

            {/* Slide dots */}
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {slides.map((s, i) => (
                <button key={i} onClick={() => goTo(i)} title={s.title} style={{
                  width: current===i ? 28 : 10, height:10,
                  borderRadius:99, border:"none", cursor:"pointer",
                  background: current===i ? "#7c3aed" : i < current ? "#c4b5fd" : "#e5e7eb",
                  transition:"all 0.2s", padding:0, flexShrink:0,
                }} />
              ))}
            </div>
          </div>

          {/* ── SLIDE THUMBNAILS ── */}
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"16px 18px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, marginBottom:12 }}>ALL SLIDES</div>
            <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:6, scrollbarWidth:"thin" }}>
              {slides.map((s, i) => {
                const t = THEMES[s.theme % THEMES.length];
                return (
                  <div key={i} onClick={() => goTo(i)} style={{
                    flexShrink:0, width:160, borderRadius:12, overflow:"hidden",
                    border:`2px solid ${current===i?"#7c3aed":"#e5e7eb"}`,
                    cursor:"pointer", transition:"all 0.15s",
                    boxShadow: current===i ? "0 4px 14px rgba(124,58,237,0.25)" : "none",
                    transform: current===i ? "translateY(-2px)" : "none",
                  }}>
                    <div style={{ background:t.bg, padding:"12px 12px 10px", minHeight:80, display:"flex", flexDirection:"column", justifyContent:"space-between" }}>
                      <div style={{ fontSize:18 }}>{s.emoji}</div>
                      <div style={{ fontSize:11, fontWeight:700, color:t.text, lineHeight:1.35,
                        display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>
                        {s.title}
                      </div>
                    </div>
                    <div style={{ padding:"6px 10px", background:"#f9fafb", borderTop:"1px solid #f3f4f6", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <span style={{ fontSize:10, color:"#9ca3af", fontFamily:"'DM Mono',monospace" }}>Slide {i+1}</span>
                      <span style={{ fontSize:9, color:"#9ca3af", fontFamily:"'DM Mono',monospace", textTransform:"uppercase" }}>{s.type}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default ExplainerVideoPage;
