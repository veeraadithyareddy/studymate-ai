import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── HISTORY PAGE ─────────────────────────────────────────────────────────────
function HistoryPage() {
  const { sessionHistory } = useApp();
  return (
    <div>
      <h2 style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827", margin:"0 0 20px" }}>History</h2>
      {sessionHistory.length === 0 ? <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af", fontFamily:"'DM Mono',monospace", fontSize:14 }}>No history yet.</div> :
        <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
          {[...sessionHistory].reverse().map((s, i) => (
            <div key={i} style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"13px 18px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontSize:13, fontWeight:600, color:"#111827", fontFamily:"'DM Mono',monospace", textTransform:"capitalize" }}>{s.tool}</div><div style={{ fontSize:11, color:"#6b7280", marginTop:2 }}>{s.date}</div></div>
              <div style={{ padding:"3px 10px", background:"#ede9fe", borderRadius:20, fontSize:11, color:"#7c3aed", fontWeight:600, fontFamily:"'DM Mono',monospace" }}>AI Tool</div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}


export default HistoryPage;
