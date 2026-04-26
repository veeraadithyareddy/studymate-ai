import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── MIND MAP PAGE ────────────────────────────────────────────────────────────
function MindMapPage({ addToast }) {
  const { studyMaterial } = useApp();
  const [nodes, setNodes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});

  const COLORS = ["#7c3aed","#2563eb","#16a34a","#d97706","#dc2626","#0891b2","#db2777"];

  const generate = async () => {
    if (!studyMaterial) { addToast("Load material on Home first!"); return; }
    setLoading(true); setNodes(null);
    try {
      const prompt = `Analyze this study material and create a mind map. You MUST return ONLY a raw JSON object — no explanation, no markdown, no code block, just the JSON itself starting with {

The JSON must follow this exact structure:
{"center":"Main Topic Name","branches":[{"label":"Branch 1","children":["Child 1","Child 2","Child 3"]},{"label":"Branch 2","children":["Child 1","Child 2","Child 3"]}]}

Rules:
- center: the single main topic (max 4 words)
- branches: exactly 4 to 6 branches
- each branch has label (max 3 words) and children array of 2-4 items (max 5 words each)
- all text in English, plain words only

Material:
${studyMaterial.text.slice(0, 2500)}`;

      const r = await callClaude(prompt, "You are a mind map generator. Return ONLY raw JSON, nothing else. No markdown, no explanation, no code fences.", 1200);

      // Bracket-matching JSON extractor - finds the exact balanced {} object
      const extractJSON = (text) => {
        const start = text.indexOf("{");
        if (start === -1) return null;
        let depth = 0, inString = false, escape = false;
        for (let i = start; i < text.length; i++) {
          const ch = text[i];
          if (escape) { escape = false; continue; }
          if (ch === "\\" && inString) { escape = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === "{") depth++;
          if (ch === "}") { depth--; if (depth === 0) return text.slice(start, i + 1); }
        }
        return null;
      };

      const jsonStr = extractJSON(r);
      if (!jsonStr) throw new Error("AI did not return valid JSON. Please try again.");

      let data;
      try { data = JSON.parse(jsonStr); }
      catch(e) {
        const cleaned = jsonStr.replace(/[\x00-\x1F\x7F]/g, " ");
        data = JSON.parse(cleaned);
      }

      if (!data.center || !Array.isArray(data.branches) || data.branches.length === 0) {
        throw new Error("Mind map data is incomplete. Please try again.");
      }

      setNodes(data);
      // expand all branches by default
      const exp = {};
      data.branches.forEach((_, i) => { exp[i] = true; });
      setExpanded(exp);
    } catch(e) {
      addToast("Error: " + e.message);
    }
    setLoading(false);
  };

  const toggleBranch = (i) => setExpanded(e => ({ ...e, [i]: !e[i] }));

  // Build SVG mind map layout
  const buildSVG = (data) => {
    const branches = data.branches || [];

    // Canvas: wide enough for children on sides, tall enough for children top/bottom
    const W = 1000, H = 860;
    const CX = W / 2;   // center X
    const CY = H / 2;   // center Y — centred so all quadrants have equal room
    const BRANCH_R = 220;  // center → branch
    const CHILD_R = 155;   // branch → child

    const centerW = Math.max(150, data.center.length * 9 + 36);
    const centerH = 48;

    // Distribute branches evenly, starting from top (-90°)
    const branchAngles = branches.map((_, i) => (2 * Math.PI * i) / branches.length - Math.PI / 2);

    const elements = [];

    branches.forEach((b, bi) => {
      const color = COLORS[bi % COLORS.length];
      const angle = branchAngles[bi];
      const bx = CX + BRANCH_R * Math.cos(angle);
      const by = CY + BRANCH_R * Math.sin(angle);
      const bw = Math.max(120, b.label.length * 8 + 32);
      const bh = 40;

      // Curved line center → branch
      const cp1x = CX + (bx - CX) * 0.45;
      const cp1y = CY + (by - CY) * 0.45;
      elements.push(
        <path key={`bl-${bi}`} d={`M ${CX} ${CY} Q ${cp1x} ${cp1y} ${bx} ${by}`}
          stroke={color} strokeWidth="2.5" fill="none" strokeOpacity="0.55" strokeLinecap="round"/>
      );

      // Branch box
      elements.push(
        <g key={`b-${bi}`} style={{ cursor:"pointer" }} onClick={() => toggleBranch(bi)}>
          <rect x={bx - bw/2} y={by - bh/2} width={bw} height={bh} rx="11"
            fill={color} fillOpacity="0.13" stroke={color} strokeWidth="2"/>
          <text x={bx} y={by + 5} textAnchor="middle" fontSize="13" fontWeight="700"
            fill={color} fontFamily="'DM Mono',monospace" style={{ pointerEvents:"none" }}>
            {b.label.length > 18 ? b.label.slice(0,17) + "…" : b.label}
          </text>
          <text x={bx + bw/2 - 9} y={by - bh/2 + 13} fontSize="11" fill={color} fontFamily="monospace" style={{ pointerEvents:"none" }}>
            {expanded[bi] !== false ? "−" : "+"}
          </text>
        </g>
      );

      // Children
      if (expanded[bi] !== false) {
        const children = b.children || [];
        // Spread angle: wider for more children
        const spread = Math.min(Math.PI * 0.65, children.length * 0.32);
        children.forEach((child, ci) => {
          const offset = children.length === 1 ? 0
            : -spread/2 + (spread / (children.length - 1)) * ci;
          const childAngle = angle + offset;
          const cx2 = bx + CHILD_R * Math.cos(childAngle);
          const cy2 = by + CHILD_R * Math.sin(childAngle);
          const cw = Math.max(95, Math.min(160, child.length * 7 + 28));
          const ch = 32;
          const childText = child.length > 22 ? child.slice(0,21) + "…" : child;

          elements.push(
            <line key={`cl-${bi}-${ci}`}
              x1={bx} y1={by} x2={cx2} y2={cy2}
              stroke={color} strokeWidth="1.5" strokeOpacity="0.35" strokeDasharray="5 4"/>
          );
          elements.push(
            <g key={`c-${bi}-${ci}`}>
              <rect x={cx2 - cw/2} y={cy2 - ch/2} width={cw} height={ch} rx="9"
                fill="#fff" stroke={color} strokeWidth="1.2" strokeOpacity="0.55"/>
              <text x={cx2} y={cy2 + 5} textAnchor="middle" fontSize="11"
                fill="#374151" fontFamily="system-ui,sans-serif" style={{ pointerEvents:"none" }}>
                {childText}
              </text>
            </g>
          );
        });
      }
    });

    return (
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display:"block" }}>
        <defs>
          <filter id="shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="8" floodColor="#7c3aed" floodOpacity="0.2"/>
          </filter>
          <linearGradient id="centerGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7c3aed"/>
            <stop offset="100%" stopColor="#4f46e5"/>
          </linearGradient>
        </defs>

        {/* Background subtle grid */}
        <rect width={W} height={H} fill="#fafafa" rx="12"/>

        {/* Lines first (behind everything) */}
        {elements.filter(el => el.key?.startsWith("bl-") || el.key?.startsWith("cl-"))}

        {/* Boxes */}
        {elements.filter(el => !el.key?.startsWith("bl-") && !el.key?.startsWith("cl-"))}

        {/* Center node — always on top */}
        <g filter="url(#shadow)">
          <rect x={CX - centerW/2} y={CY - centerH/2} width={centerW} height={centerH} rx="16"
            fill="url(#centerGrad)"/>
          <text x={CX} y={CY + 6} textAnchor="middle" fontSize="15" fontWeight="800"
            fill="#fff" fontFamily="'DM Mono',monospace">
            {data.center.length > 24 ? data.center.slice(0,23) + "…" : data.center}
          </text>
        </g>
      </svg>
    );
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ margin:"0 0 2px", fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827" }}>Mind Map</h2>
          <p style={{ margin:0, fontSize:12, color:"#6b7280" }}>AI generates a visual map from your study material. Click branches to expand/collapse.</p>
        </div>
        <button onClick={generate} disabled={loading || !studyMaterial} style={{
          padding:"10px 20px", background:loading||!studyMaterial?"#e9d5ff":"linear-gradient(135deg,#7c3aed,#4f46e5)",
          border:"none", borderRadius:11, color:"#fff", fontSize:13, fontWeight:700,
          cursor:loading||!studyMaterial?"default":"pointer", fontFamily:"'DM Mono',monospace",
          boxShadow:"0 4px 14px rgba(124,58,237,0.3)", display:"flex", alignItems:"center", gap:8
        }}>
          {loading
            ? <><div style={{ width:15,height:15,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.4)",borderTopColor:"#fff",animation:"spin 0.8s linear infinite" }}/> Generating...</>
            : <><span>◉</span> Generate Mind Map</>}
        </button>
      </div>

      {!studyMaterial && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>◉</div>
          <p style={{ fontFamily:"'DM Mono',monospace", fontSize:14 }}>Load study material on the Home page first.</p>
        </div>
      )}

      {studyMaterial && !nodes && !loading && (
        <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>◉</div>
          <p style={{ fontFamily:"'DM Mono',monospace", fontSize:14 }}>Click "Generate Mind Map" to visualise your material.</p>
        </div>
      )}

      {loading && (
        <div style={{ textAlign:"center", padding:"48px 0" }}>
          <div style={{ width:44, height:44, borderRadius:"50%", border:"4px solid #ede9fe", borderTopColor:"#7c3aed", animation:"spin 0.8s linear infinite", margin:"0 auto 14px" }} />
          <p style={{ color:"#7c3aed", fontFamily:"'DM Mono',monospace", fontSize:14, fontWeight:600 }}>Building your mind map...</p>
          <p style={{ color:"#9ca3af", fontSize:12, marginTop:4 }}>Analysing material and creating connections</p>
        </div>
      )}

      {nodes && !loading && (
        <div>
          {/* SVG Visual Map */}
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"8px", marginBottom:16, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.04)" }}>
            {buildSVG(nodes)}
            <div style={{ textAlign:"center", fontSize:11, color:"#9ca3af", fontFamily:"'DM Mono',monospace", marginTop:4, paddingBottom:8 }}>
              Click branch nodes to expand / collapse children
            </div>
          </div>

          {/* List view below SVG */}
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"18px 20px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, marginBottom:14 }}>
              DETAILED VIEW — {nodes.center.toUpperCase()}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
              {(nodes.branches||[]).map((b, bi) => {
                const color = COLORS[bi % COLORS.length];
                return (
                  <div key={bi} style={{ border:`1.5px solid ${color}28`, borderRadius:13, overflow:"hidden" }}>
                    <div style={{ background:`${color}12`, padding:"9px 14px", borderBottom:`1px solid ${color}20`, display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{ width:9, height:9, borderRadius:"50%", background:color, flexShrink:0 }} />
                      <span style={{ fontSize:13, fontWeight:700, color, fontFamily:"'DM Mono',monospace" }}>{b.label}</span>
                    </div>
                    <div style={{ padding:"10px 14px", display:"flex", flexDirection:"column", gap:7 }}>
                      {(b.children||[]).map((c, ci) => (
                        <div key={ci} style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                          <div style={{ width:5, height:5, borderRadius:"50%", background:`${color}88`, flexShrink:0, marginTop:5 }} />
                          <span style={{ fontSize:13, color:"#374151", lineHeight:1.55 }}>{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Regenerate button */}
          <div style={{ marginTop:14, display:"flex", gap:10 }}>
            <button onClick={generate} style={{ padding:"9px 18px", background:"#ede9fe", border:"1px solid #c4b5fd", borderRadius:10, color:"#7c3aed", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>↺ Regenerate</button>
            <button onClick={() => setNodes(null)} style={{ padding:"9px 18px", background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:10, color:"#6b7280", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>✕ Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}


export default MindMapPage;
