import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";
import ReadAloudPlayer from "../components/ReadAloudPlayer";

// ─── AI TEACHER PAGE ──────────────────────────────────────────────────────────
function TeacherPage({ addToast }) {
  const { studyMaterial } = useApp();
  const [level, setLevel] = useState("school");
  const [lesson, setLesson] = useState(null);
  const [loading, setLoading] = useState(false);

  const generate = async () => {
    if (!studyMaterial) { addToast("Load material first!"); return; }
    setLoading(true);
    try {
      const labels = { beginner:"a complete beginner (age 8-10)", school:"a school student (age 14-16)", exam:"an exam candidate needing full depth" };
      const r = await callClaude(`Teach the following material as an expert teacher to ${labels[level]}. Structure as: Introduction, Key Concepts (3-5 points), Detailed Explanation, Examples, Quick Summary. Use plain text, no markdown symbols:\n\n${studyMaterial.text.slice(0,10000)}`);
      setLesson(stripMd(r));
    } catch(e) { addToast("Error: "+e.message); }
    setLoading(false);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ margin:0, fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827" }}>AI Teacher Mode</h2>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {[["beginner","👶 Beginner"],["school","🏫 School"],["exam","🎓 Exam"]].map(([l,label]) => (
            <button key={l} onClick={() => setLevel(l)} style={{ padding:"7px 14px", borderRadius:9, border:"1px solid #e5e7eb", background:level===l?"#7c3aed":"#fff", color:level===l?"#fff":"#6b7280", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{label}</button>
          ))}
          <button onClick={generate} disabled={loading} style={{ padding:"7px 16px", borderRadius:9, border:"none", background:"#7c3aed", color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>{loading?"Teaching...":"Teach Me 👨‍🏫"}</button>
        </div>
      </div>
      {!studyMaterial && <div style={{ textAlign:"center", padding:"60px 0", color:"#9ca3af", fontFamily:"'DM Mono',monospace", fontSize:14 }}>Load study material on Home first.</div>}
      {loading && <div style={{ textAlign:"center", padding:"36px 0" }}><div style={{ width:36, height:36, borderRadius:"50%", border:"3px solid #ede9fe", borderTopColor:"#7c3aed", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} /><p style={{ color:"#7c3aed", fontFamily:"'DM Mono',monospace", fontSize:14 }}>Preparing your lesson...</p></div>}
      {lesson && !loading && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"24px 28px", boxShadow:"0 4px 20px rgba(0,0,0,0.04)" }}>
          <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:16, paddingBottom:14, borderBottom:"1px solid #f3f4f6" }}>
            <span style={{ fontSize:22 }}>👨‍🏫</span>
            <div><div style={{ fontSize:14, fontWeight:700, color:"#111827", fontFamily:"'DM Mono',monospace" }}>AI Teacher</div><div style={{ fontSize:12, color:"#6b7280" }}>Teaching at {level} level</div></div>
          </div>
          <pre style={{ margin:0, fontSize:14, lineHeight:1.9, color:"#111827", fontFamily:"inherit", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{lesson}</pre>
          <ReadAloudPlayer text={lesson} langName="English" />
        </div>
      )}
    </div>
  );
}


export default TeacherPage;
