import { useState, useRef, useEffect, useCallback, createContext, useContext, useMemo } from "react";
import { LANG_CONFIG } from "../utils/helpers";

// ─── TTS ──────────────────────────────────────────────────────────────────────
function getVoices() {
  return new Promise(r => {
    const v = window.speechSynthesis.getVoices();
    if (v.length) { r(v); return; }
    window.speechSynthesis.onvoiceschanged = () => r(window.speechSynthesis.getVoices());
    setTimeout(() => r(window.speechSynthesis.getVoices()), 1200);
  });
}
function pickVoice(voices, langName) {
  const cfg = LANG_CONFIG[langName];
  const codes = cfg ? cfg.codes : ["en-US"];
  for (const code of codes) {
    const lc = code.toLowerCase();
    let v = voices.find(v => v.lang.toLowerCase() === lc) || voices.find(v => v.lang.toLowerCase().startsWith(lc));
    if (v) return v;
  }
  const base = codes[0].split("-")[0].toLowerCase();
  return voices.find(v => v.lang.toLowerCase().startsWith(base)) || null;
}

// ─── Read Aloud Player ────────────────────────────────────────────────────────
function ReadAloudPlayer({ text, langName = "English" }) {
  const cfg = LANG_CONFIG[langName];
  const flag = cfg ? cfg.flag : "🔊";
  const native = cfg ? cfg.native : "English";
  const primaryCode = cfg ? cfg.codes[0] : "en-US";
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [voiceInfo, setVoiceInfo] = useState("");
  const [noVoice, setNoVoice] = useState(false);
  const wordIdxRef = useRef(0); const totalRef = useRef(0);

  useEffect(() => { window.speechSynthesis.cancel(); setPlaying(false); setPaused(false); setProgress(0); setNoVoice(false); setVoiceInfo(""); }, [langName]);
  useEffect(() => () => window.speechSynthesis.cancel(), []);

  const stop = useCallback(() => { window.speechSynthesis.cancel(); setPlaying(false); setPaused(false); setProgress(0); wordIdxRef.current = 0; }, []);

  const speak = async () => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const voices = await getVoices();
    const voice = langName === "English" ? (voices.find(v => v.lang.startsWith("en") && v.default) || voices.find(v => v.lang.startsWith("en"))) : pickVoice(voices, langName);
    setNoVoice(!voice && langName !== "English");
    setVoiceInfo(voice ? `${voice.name} (${voice.lang})` : "");
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = voice ? voice.lang : primaryCode; utt.rate = 0.92;
    if (voice) utt.voice = voice;
    totalRef.current = text.split(/\s+/).length; wordIdxRef.current = 0;
    utt.onboundary = e => { if (e.name === "word") { wordIdxRef.current++; setProgress(Math.round((wordIdxRef.current / totalRef.current) * 100)); } };
    utt.onstart = () => { setPlaying(true); setPaused(false); };
    utt.onend = () => { setPlaying(false); setPaused(false); setProgress(100); };
    utt.onerror = () => { setPlaying(false); setPaused(false); };
    window.speechSynthesis.speak(utt);
  };
  const pause = () => { window.speechSynthesis.pause(); setPaused(true); setPlaying(false); };
  const resume = () => { window.speechSynthesis.resume(); setPaused(false); setPlaying(true); };
  const btn = (onClick, bg, color, children, extra = {}) => (
    <button onClick={onClick} style={{ padding:"8px 16px", background:bg, color, border:"none", borderRadius:9, fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace", display:"flex", alignItems:"center", gap:5, ...extra }}>{children}</button>
  );
  return (
    <div style={{ background:"linear-gradient(135deg,#fdf4ff,#eff6ff)", border:"1px solid #e9d5ff", borderRadius:14, padding:"14px 18px", marginTop:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, flexWrap:"wrap" }}>
        <span style={{ fontSize:15 }}>{flag}</span>
        <span style={{ fontSize:12, fontWeight:700, color:"#7c3aed", fontFamily:"'DM Mono',monospace" }}>{langName} {cfg && <span style={{ fontWeight:400, color:"#9ca3af" }}>· {native}</span>}</span>
        <span style={{ fontSize:10, color:"#c4b5fd", background:"#ede9fe", padding:"2px 7px", borderRadius:20, fontFamily:"'DM Mono',monospace", marginLeft:"auto" }}>{primaryCode}</span>
      </div>
      {voiceInfo && <div style={{ fontSize:10, color:"#6d28d9", fontFamily:"'DM Mono',monospace", marginBottom:7, background:"#f5f3ff", padding:"3px 8px", borderRadius:6, display:"inline-block" }}>🎙 {voiceInfo}</div>}
      {noVoice && <div style={{ fontSize:11, color:"#d97706", background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:8, padding:"5px 10px", marginBottom:7, fontFamily:"'DM Mono',monospace" }}>⚠ No {langName} voice on this device. Install OS language packs for best results.</div>}
      <div style={{ width:"100%", height:4, background:"#e9d5ff", borderRadius:99, marginBottom:10, overflow:"hidden" }}>
        <div style={{ height:"100%", background:"linear-gradient(90deg,#7c3aed,#4f46e5)", borderRadius:99, width:`${progress}%`, transition:"width 0.4s" }} />
      </div>
      <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
        {!playing && !paused && btn(speak, "#7c3aed", "#fff", <><span>▶</span><span>Play</span></>, { boxShadow:"0 4px 12px rgba(124,58,237,0.3)" })}
        {playing && btn(pause, "#f59e0b", "#fff", <><span>⏸</span><span>Pause</span></>)}
        {paused && btn(resume, "#7c3aed", "#fff", <><span>▶</span><span>Resume</span></>)}
        {(playing || paused || progress > 0) && btn(stop, "#fef2f2", "#dc2626", <><span>■</span><span>Stop</span></>, { border:"1px solid #fca5a5" })}
        <span style={{ fontSize:11, color:"#9ca3af", fontFamily:"'DM Mono',monospace" }}>{playing ? `${progress}% · speaking...` : progress === 100 ? "Done ✓" : ""}</span>
      </div>
    </div>
  );
}


export default ReadAloudPlayer;
