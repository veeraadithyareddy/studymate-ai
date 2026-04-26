import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── INFOGRAPHIC PAGE ──────────────────────────────────────────────────────────
function InfographicPage({ addToast }) {
  const { studyMaterial } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState("purple");

  const THEMES = {
    purple: { primary:"#7c3aed", secondary:"#4f46e5", accent:"#a78bfa", light:"#fdf4ff", text:"#3b0764", card:"#ede9fe" },
    ocean:  { primary:"#0891b2", secondary:"#0e7490", accent:"#67e8f9", light:"#ecfeff", text:"#164e63", card:"#cffafe" },
    forest: { primary:"#16a34a", secondary:"#15803d", accent:"#86efac", light:"#f0fdf4", text:"#14532d", card:"#dcfce7" },
    sunset: { primary:"#ea580c", secondary:"#c2410c", accent:"#fdba74", light:"#fff7ed", text:"#7c2d12", card:"#fed7aa" },
    rose:   { primary:"#e11d48", secondary:"#be123c", accent:"#fda4af", light:"#fff1f2", text:"#881337", card:"#fecdd3" },
  };

  const T = THEMES[theme];

  const generate = async () => {
    if (!studyMaterial) { addToast("Load study material on Home first!"); return; }
    setLoading(true); setData(null);
    try {
      const r = await callClaude(
        `Create an infographic structure from this study material. Return ONLY JSON:
{"title":"Main topic title","subtitle":"One line description","sections":[{"icon":"emoji","heading":"Section heading","points":["point 1","point 2","point 3"]},...],"stats":[{"number":"85%","label":"key stat"},{"number":"3x","label":"another stat"},{"number":"100+","label":"third stat"}],"keyTakeaway":"One powerful conclusion sentence","tags":["tag1","tag2","tag3","tag4","tag5"]}
Rules: 4-5 sections, 3 points each, 3 stats, keep all text SHORT and punchy. Based on:\n\n${studyMaterial.text.slice(0,10000)}`,
        "You are an infographic designer. Return ONLY valid JSON.", 1200
      );
      const s = r.indexOf("{"), e = r.lastIndexOf("}");
      if (s===-1) throw new Error("Could not generate infographic.");
      setData(JSON.parse(r.slice(s,e+1)));
      addToast("🖼️ Infographic ready!");
    } catch(err) { addToast("Error: " + err.message); }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ margin:"0 0 3px", fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827" }}>🖼️ AI Infographic Maker</h2>
          <p style={{ margin:0, fontSize:13, color:"#6b7280" }}>Transforms your notes into a beautiful shareable infographic</p>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
          {Object.keys(THEMES).map(t => (
            <button key={t} onClick={() => setTheme(t)} style={{ width:24, height:24, borderRadius:"50%", background:THEMES[t].primary, border:theme===t?"3px solid #111":"2px solid transparent", cursor:"pointer", outline:"none" }} title={t}/>
          ))}
          <button onClick={generate} disabled={loading || !studyMaterial} style={{ padding:"10px 18px", background:loading?"#e9d5ff":`linear-gradient(135deg,${T.primary},${T.secondary})`, border:"none", borderRadius:11, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>
            {loading ? "✨ Generating..." : "🖼️ Generate"}
          </button>
        </div>
      </div>

      {loading && <div style={{ textAlign:"center", padding:"48px 0" }}><div style={{ width:44, height:44, borderRadius:"50%", border:`4px solid ${T.card}`, borderTopColor:T.primary, animation:"spin 0.8s linear infinite", margin:"0 auto 14px" }}/><p style={{ color:T.primary, fontFamily:"'DM Mono',monospace", fontSize:14 }}>Designing your infographic...</p></div>}
      {!studyMaterial && !loading && <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af" }}><div style={{ fontSize:48, marginBottom:12 }}>🖼️</div><p style={{ fontFamily:"'DM Mono',monospace", fontSize:14 }}>Load study material on Home first</p></div>}

      {data && !loading && (
        <div id="infographic" style={{ background:T.light, border:`2px solid ${T.card}`, borderRadius:20, overflow:"hidden", maxWidth:800, margin:"0 auto" }}>
          {/* Header */}
          <div style={{ background:`linear-gradient(135deg,${T.primary},${T.secondary})`, padding:"32px 36px", textAlign:"center" }}>
            <div style={{ fontSize:48, marginBottom:10 }}>📊</div>
            <h2 style={{ margin:"0 0 8px", fontSize:26, fontWeight:900, color:"#fff", letterSpacing:-0.5 }}>{data.title}</h2>
            <p style={{ margin:0, fontSize:14, color:"rgba(255,255,255,0.8)" }}>{data.subtitle}</p>
          </div>

          {/* Stats row */}
          {data.stats && data.stats.length > 0 && (
            <div style={{ display:"flex", background:`${T.primary}18`, borderBottom:`2px solid ${T.card}` }}>
              {data.stats.map((st, i) => (
                <div key={i} style={{ flex:1, padding:"20px 16px", textAlign:"center", borderRight:i<data.stats.length-1?`1px solid ${T.card}`:"none" }}>
                  <div style={{ fontSize:32, fontWeight:900, color:T.primary, fontFamily:"'DM Mono',monospace", lineHeight:1 }}>{st.number}</div>
                  <div style={{ fontSize:11, color:T.text, marginTop:4, fontWeight:600 }}>{st.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Sections grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:0 }}>
            {(data.sections||[]).map((sec, i) => (
              <div key={i} style={{ padding:"22px 24px", borderRight: i%2===0?`1px solid ${T.card}`:"none", borderBottom:`1px solid ${T.card}`, background: i%2===0?"#fff":T.light }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                  <div style={{ width:36, height:36, borderRadius:10, background:`linear-gradient(135deg,${T.primary},${T.secondary})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>{sec.icon}</div>
                  <span style={{ fontSize:13, fontWeight:800, color:T.text }}>{sec.heading}</span>
                </div>
                {sec.points.map((p, pi) => (
                  <div key={pi} style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8 }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:T.primary, flexShrink:0, marginTop:5 }}/>
                    <span style={{ fontSize:12, color:"#374151", lineHeight:1.55 }}>{p}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Key takeaway */}
          <div style={{ background:`linear-gradient(135deg,${T.primary},${T.secondary})`, padding:"20px 36px", textAlign:"center" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.6)", letterSpacing:1.2, marginBottom:6, fontFamily:"'DM Mono',monospace" }}>KEY TAKEAWAY</div>
            <p style={{ margin:"0 0 16px", fontSize:15, fontWeight:700, color:"#fff", lineHeight:1.6 }}>"{data.keyTakeaway}"</p>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8, justifyContent:"center" }}>
              {(data.tags||[]).map((tag, i) => (
                <span key={i} style={{ padding:"4px 12px", background:"rgba(255,255,255,0.15)", borderRadius:20, fontSize:11, color:"#fff", fontWeight:600, fontFamily:"'DM Mono',monospace" }}>#{tag}</span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default InfographicPage;
