import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── STUDY MUSIC PAGE ─────────────────────────────────────────────────────────
function StudyMusicPage({ addToast }) {
  const { studyMaterial } = useApp();
  const [playing, setPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [volume, setVolume] = useState(0.6);
  const [bpm, setBpm] = useState(75);
  const [duration, setDuration] = useState(25);
  const [elapsed, setElapsed] = useState(0);
  const [playlist, setPlaylist] = useState(null);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef(null);
  const timerRef = useRef();
  const oscRef = useRef();
  const gainRef = useRef();
  const ctxRef = useRef();
  const nodesRef = useRef([]);

  const MOODS = [
    { id:"focus", label:"🎯 Deep Focus", desc:"Binaural-style pure tones" },
    { id:"lofi", label:"☕ Lo-fi Chill", desc:"Warm mellow vibes" },
    { id:"nature", label:"🌿 Nature", desc:"Rain & forest sounds" },
    { id:"epic", label:"⚡ Epic Study", desc:"Motivating orchestral" },
  ];
  const [mood, setMood] = useState("focus");

  // Web Audio API lo-fi generator
  const startAudio = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      ctxRef.current = ctx;
      const masterGain = ctx.createGain();
      masterGain.gain.value = volume;
      masterGain.connect(ctx.destination);
      gainRef.current = masterGain;
      nodesRef.current = [];

      const freqs = mood === "focus"
        ? [40, 432, 528]    // binaural + solfeggio frequencies
        : mood === "lofi"
        ? [220, 277, 330, 415]   // lo-fi chord (Am7)
        : mood === "nature"
        ? [80, 160, 320]         // bass rumble (rain simulation)
        : [261, 329, 392, 523];  // epic C major chord

      freqs.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        const filter = ctx.createBiquadFilter();

        osc.type = mood === "focus" ? "sine" : mood === "nature" ? "sawtooth" : "triangle";
        osc.frequency.value = freq + (i * 0.5); // slight detune for warmth

        filter.type = "lowpass";
        filter.frequency.value = mood === "epic" ? 4000 : 800;

        g.gain.value = 0.12 / freqs.length;

        // LFO for gentle tremolo
        const lfo = ctx.createOscillator();
        const lfoGain = ctx.createGain();
        lfo.frequency.value = 0.1 + i * 0.05;
        lfoGain.gain.value = 0.02;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        lfo.start();

        osc.connect(filter);
        filter.connect(g);
        g.connect(masterGain);
        osc.start();
        nodesRef.current.push(osc, lfo);
      });

      // Add gentle noise layer for texture
      if (mood === "nature" || mood === "lofi") {
        const bufferSize = ctx.sampleRate * 2;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        const noiseFilter = ctx.createBiquadFilter();
        const noiseGain = ctx.createGain();
        noise.buffer = buffer;
        noise.loop = true;
        noiseFilter.type = "lowpass";
        noiseFilter.frequency.value = mood === "nature" ? 600 : 200;
        noiseGain.gain.value = mood === "nature" ? 0.04 : 0.01;
        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);
        noise.start();
        nodesRef.current.push(noise);
      }
    } catch(e) { addToast("Audio not supported in this browser"); }
  };

  const stopAudio = () => {
    try { nodesRef.current.forEach(n => { try { n.stop(); } catch {} }); nodesRef.current = []; } catch {}
    try { ctxRef.current?.close(); } catch {}
  };

  const togglePlay = () => {
    if (playing) {
      stopAudio(); clearInterval(timerRef.current); setPlaying(false);
    } else {
      startAudio(); setPlaying(true); setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(e => {
          if (e >= duration * 60) { stopAudio(); clearInterval(timerRef.current); setPlaying(false); return 0; }
          return e + 1;
        });
      }, 1000);
    }
  };

  useEffect(() => {
    if (gainRef.current) gainRef.current.gain.value = volume;
  }, [volume]);

  useEffect(() => () => { stopAudio(); clearInterval(timerRef.current); }, []);

  const generatePlaylist = async () => {
    if (!studyMaterial) { addToast("Load study material on Home first!"); return; }
    setLoading(true);
    try {
      const r = await callClaude(
        `Based on this study material, create a custom study playlist recommendation. Return ONLY JSON:
{"subject":"detected subject","recommendedMood":"focus/lofi/nature/epic","playlistName":"creative playlist name","tracks":[{"title":"track style description","duration":"3:45","vibe":"one word vibe"},...],"studyTip":"one study tip matching this music","totalTime":"total playlist time"}
Generate 6 tracks. Base mood on subject type (science=focus, history=lofi, literature=nature, maths=epic).\n\n${studyMaterial.text.slice(0,500)}`,
        "You are a music curator. Return ONLY valid JSON.", 600
      );
      const s = r.indexOf("{"), e = r.lastIndexOf("}");
      if (s===-1) throw new Error("Could not generate playlist.");
      const data = JSON.parse(r.slice(s,e+1));
      setPlaylist(data);
      if (data.recommendedMood) setMood(data.recommendedMood);
      addToast("🎵 Playlist generated for your topic!");
    } catch(err) { addToast("Error: "+err.message); }
    setLoading(false);
  };

  const mins = Math.floor(elapsed/60).toString().padStart(2,"0");
  const secs = (elapsed%60).toString().padStart(2,"0");
  const totalSecs = duration * 60;
  const pct = (elapsed/totalSecs)*100;

  const moodColors = { focus:"#7c3aed", lofi:"#d97706", nature:"#16a34a", epic:"#dc2626" };
  const moodBgs = { focus:"linear-gradient(135deg,#1e1b4b,#312e81)", lofi:"linear-gradient(135deg,#422006,#78350f)", nature:"linear-gradient(135deg,#052e16,#14532d)", epic:"linear-gradient(135deg,#450a0a,#991b1b)" };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ margin:"0 0 3px", fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827" }}>🎵 Study Music Generator</h2>
        <p style={{ margin:0, fontSize:13, color:"#6b7280" }}>AI-generated ambient music tuned to your study session — no ads, no distractions</p>
      </div>

      {/* Player card */}
      <div style={{ background:moodBgs[mood], borderRadius:22, padding:"28px", marginBottom:20, color:"#fff", boxShadow:"0 12px 40px rgba(0,0,0,0.3)" }}>
        {/* Animated waveform */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:3, height:40, marginBottom:20 }}>
          {Array.from({length:20}).map((_,i) => (
            <div key={i} style={{ width:3, background:playing?"rgba(255,255,255,0.7)":"rgba(255,255,255,0.2)", borderRadius:99, height:playing?`${20+Math.sin(Date.now()/200+i)*16}px`:`${6+i%8*3}px`, transition:"height 0.3s", animation:playing?`none`:"none" }}/>
          ))}
        </div>

        <div style={{ textAlign:"center", marginBottom:20 }}>
          <div style={{ fontSize:13, opacity:0.6, fontFamily:"'DM Mono',monospace", letterSpacing:1, marginBottom:4 }}>NOW PLAYING</div>
          <div style={{ fontSize:20, fontWeight:800, marginBottom:2 }}>{MOODS.find(m=>m.id===mood)?.label}</div>
          <div style={{ fontSize:12, opacity:0.7 }}>{MOODS.find(m=>m.id===mood)?.desc}</div>
        </div>

        {/* Progress */}
        <div style={{ marginBottom:16 }}>
          <div style={{ width:"100%", height:4, background:"rgba(255,255,255,0.15)", borderRadius:99, overflow:"hidden", marginBottom:6 }}>
            <div style={{ height:"100%", background:"rgba(255,255,255,0.8)", borderRadius:99, width:`${pct}%`, transition:"width 1s" }}/>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, opacity:0.6, fontFamily:"'DM Mono',monospace" }}>
            <span>{mins}:{secs}</span><span>{duration}:00</span>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:16, marginBottom:20 }}>
          <button onClick={() => setDuration(d => Math.max(5, d-5))} style={{ background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%", width:36, height:36, color:"#fff", fontSize:14, cursor:"pointer" }}>-5m</button>
          <button onClick={togglePlay} style={{ width:60, height:60, borderRadius:"50%", background:"rgba(255,255,255,0.9)", border:"none", fontSize:24, cursor:"pointer", boxShadow:"0 4px 16px rgba(0,0,0,0.3)", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <span style={{ color:"#1a1a1a" }}>{playing?"⏸":"▶"}</span>
          </button>
          <button onClick={() => setDuration(d => Math.min(120, d+5))} style={{ background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%", width:36, height:36, color:"#fff", fontSize:14, cursor:"pointer" }}>+5m</button>
        </div>

        {/* Volume */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <span style={{ fontSize:14 }}>🔈</span>
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={e => setVolume(parseFloat(e.target.value))} style={{ flex:1, accentColor:"rgba(255,255,255,0.8)" }}/>
          <span style={{ fontSize:14 }}>🔊</span>
        </div>
      </div>

      {/* Mood selector */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))", gap:10, marginBottom:20 }}>
        {MOODS.map(m => (
          <button key={m.id} onClick={() => { if (playing) { stopAudio(); setPlaying(false); } setMood(m.id); }} style={{ padding:"12px 14px", borderRadius:12, border:`2px solid ${mood===m.id?moodColors[m.id]:"#e5e7eb"}`, background:mood===m.id?`${moodColors[m.id]}12`:"#f9fafb", cursor:"pointer", textAlign:"left" }}>
            <div style={{ fontSize:14, fontWeight:700, color:mood===m.id?moodColors[m.id]:"#374151", fontFamily:"'DM Mono',monospace" }}>{m.label}</div>
            <div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {/* AI Playlist */}
      <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"16px 20px" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>AI PLAYLIST FOR YOUR TOPIC</div>
          <button onClick={generatePlaylist} disabled={loading||!studyMaterial} style={{ padding:"6px 14px", background:"#7c3aed", border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>
            {loading ? "..." : "✨ Generate"}
          </button>
        </div>
        {!playlist && !loading && <p style={{ color:"#9ca3af", fontSize:13, margin:0 }}>Load study material and click Generate for a custom playlist recommendation</p>}
        {loading && <p style={{ color:"#7c3aed", fontSize:13, margin:0, fontFamily:"'DM Mono',monospace" }}>Curating your playlist...</p>}
        {playlist && !loading && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
              <div><div style={{ fontSize:14, fontWeight:700, color:"#111827" }}>{playlist.playlistName}</div><div style={{ fontSize:11, color:"#6b7280" }}>For: {playlist.subject} · {playlist.totalTime}</div></div>
              <div style={{ padding:"3px 10px", background:`${moodColors[playlist.recommendedMood]||"#7c3aed"}15`, borderRadius:20, fontSize:11, fontWeight:700, color:moodColors[playlist.recommendedMood]||"#7c3aed", fontFamily:"'DM Mono',monospace" }}>{playlist.recommendedMood}</div>
            </div>
            {playlist.tracks.map((t, i) => (
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderBottom:"1px solid #f3f4f6" }}>
                <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#7c3aed,#4f46e5)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, color:"#fff", fontWeight:700, flexShrink:0 }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, color:"#111827", fontWeight:600 }}>{t.title}</div>
                  <div style={{ fontSize:11, color:"#9ca3af" }}>{t.vibe}</div>
                </div>
                <span style={{ fontSize:12, color:"#6b7280", fontFamily:"'DM Mono',monospace" }}>{t.duration}</span>
              </div>
            ))}
            {playlist.studyTip && <div style={{ marginTop:12, padding:"9px 13px", background:"#eff6ff", borderRadius:9, fontSize:12, color:"#1d4ed8" }}>💡 {playlist.studyTip}</div>}
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// SHARED STORAGE HELPERS (localStorage sync for all social features)
// ═══════════════════════════════════════════════════════════════════════════════
const SS = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)||"null"); } catch { return null; } },
  set: (k,v) => { try { localStorage.setItem(k, JSON.stringify({...v,_ts:Date.now()})); } catch {} },
  del: (k) => { try { localStorage.removeItem(k); } catch {} },
};

export default StudyMusicPage;
