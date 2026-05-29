import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANGS, LANG_CONFIG, TOOLS, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";
import ReadAloudPlayer from "../components/ReadAloudPlayer";

// ─── HOME PAGE ────────────────────────────────────────────────────────────────
function HomePage({ addToHistory, addToast }) {
  const { studyMaterial, setStudyMaterial, userProgress, setUserProgress, settings } = useApp();
  const [tab, setTab] = useState("paste");
  const [rawText, setRawText] = useState("");
  const [activeTool, setActiveTool] = useState(null);
  const [toolOutput, setToolOutput] = useState(null);
  const [loading, setLoading] = useState(false);
  const [quizState, setQuizState] = useState(null);
  const [flashState, setFlashState] = useState(null);
  const [tutorMsgs, setTutorMsgs] = useState([]);
  const [tutorInput, setTutorInput] = useState("");
  const [translateLang, setTranslateLang] = useState("Spanish");
  const [summarizeMode, setSummarizeMode] = useState("points");
  const [explainMode, setExplainMode] = useState("eli5");
  const [explainMsgs, setExplainMsgs] = useState([]);
  const [explainInput, setExplainInput] = useState("");
  const explainEndRef = useRef();
  const [ocrLoading, setOcrLoading] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const fileRef = useRef(); const imgRef = useRef();

  const addXP = useCallback((pts) => setUserProgress(p => ({ ...p, xp: (p.xp||0)+pts, xpToday: (p.xpToday||0)+pts })), [setUserProgress]);

  const handleUseText = () => {
    if (!rawText.trim()) { addToast("Paste some text first!"); return; }
    setStudyMaterial({ text: rawText, wordCount: wc(rawText), source: "paste" });
    addToast(`Loaded! ${wc(rawText).toLocaleString()} words`);
    setActiveTool(null); setToolOutput(null);
    addXP(5);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const name = file.name.toLowerCase();
    setFileLoading(true);
    addToast(`Reading ${file.name}...`);
    try {
      if (name.endsWith(".txt") || name.endsWith(".md")) {
        const text = await file.text();
        setRawText(text); setTab("paste");
        addToast(`File loaded: ${file.name}`);
      } else if (name.endsWith(".pdf")) {
        // Use pdf.js to extract text from PDF
        const arrayBuffer = await file.arrayBuffer();
        if (!window.pdfjsLib) {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
          document.head.appendChild(script);
          await new Promise((res, rej) => { script.onload = res; script.onerror = rej; });
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        }
        const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const totalPages = pdf.numPages;
        let allPages = [];
        for (let i = 1; i <= totalPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          // Reconstruct text with proper spacing using transform positions
          let pageText = "";
          let lastY = null;
          for (const item of content.items) {
            if (!item.str) continue;
            const y = item.transform ? item.transform[5] : null;
            // New line if Y position changes significantly
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 5) {
              pageText += "\n";
            } else if (pageText && !pageText.endsWith(" ") && !item.str.startsWith(" ")) {
              pageText += " ";
            }
            pageText += item.str;
            lastY = y;
          }
          if (pageText.trim()) allPages.push(`--- Page ${i} ---\n${pageText.trim()}`);
        }
        const fullText = allPages.join("\n\n");
        if (fullText.trim().length < 20) {
          addToast("⚠️ PDF appears to be scanned/image-based. Try the Scan Image tab for OCR.");
          return;
        }
        setRawText(fullText.trim()); setTab("paste");
        addToast(`✅ PDF loaded: all ${totalPages} pages extracted from ${file.name}`);
      } else if (name.endsWith(".docx")) {
        // Use mammoth.js to extract text from DOCX
        const arrayBuffer = await file.arrayBuffer();
        if (!window.mammoth) {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
          document.head.appendChild(script);
          await new Promise((res, rej) => { script.onload = res; script.onerror = rej; });
        }
        const result = await window.mammoth.extractRawText({ arrayBuffer });
        if (!result.value.trim()) {
          addToast("⚠️ Could not extract text from DOCX. The file may be empty or protected.");
          return;
        }
        setRawText(result.value.trim()); setTab("paste");
        addToast(`✅ DOCX loaded: text extracted from ${file.name}`);
      } else {
        // Fallback: try reading as plain text
        const text = await file.text();
        setRawText(text); setTab("paste");
        addToast(`File loaded: ${file.name}`);
      }
    } catch (err) {
      console.error("File read error:", err);
      addToast(`❌ Failed to read ${file.name}. Try pasting the text manually.`);
    }
    setFileLoading(false);
  };

  const handleImage = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setOcrLoading(true);
    addToast("Running OCR on image...");
    try {
      if (window.Tesseract) {
        const { data: { text } } = await window.Tesseract.recognize(file, "eng");
        setRawText(text); setTab("paste");
        addToast("OCR complete! Text extracted.");
      } else {
        const reader = new FileReader();
        reader.onload = () => { setRawText(`[Image uploaded: ${file.name}]\n\nOCR requires Tesseract.js to be loaded. Please paste the text manually.`); setTab("paste"); };
        reader.readAsDataURL(file);
      }
    } catch { addToast("OCR failed. Try pasting text."); }
    setOcrLoading(false);
  };

  const handleVoiceInput = () => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) { addToast("Voice input not supported in this browser"); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR(); r.lang = "en-US"; r.interimResults = false;
    r.onresult = e => { setRawText(t => t + " " + e.results[0][0].transcript); addToast("Voice captured!"); };
    r.onerror = () => addToast("Voice input failed.");
    r.start(); addToast("Listening... speak now");
  };

  const runTool = async (toolId) => {
    if (!studyMaterial) { addToast("Load study material first!"); return; }
    setActiveTool(toolId); setToolOutput(null); setLoading(true);
    setQuizState(null); setFlashState(null);
    if (toolId !== "tutor") setTutorMsgs([]);
    const fullText = studyMaterial.text;
    const mat = fullText.slice(0, 12000); // generous limit for most tools
    try {
      if (toolId === "summarize") {
        // Use chunked summarizer so full PDF is covered
        const r = await summarizeLargeText(fullText, summarizeMode);
        setToolOutput({ type:"text", content:stripMd(r), tool:"Summarize" }); addXP(10);
      } else if (toolId === "highlights") {
        const r = await callClaude(`Extract exactly 8 key facts from this material. Number them 1-8, one per line, plain text:\n\n${mat}`, undefined, 2000);
        const items = r.split("\n").filter(l=>l.trim()).map(l=>stripMd(l.replace(/^\d+[\.\)]\s*/,""))).filter(Boolean).slice(0,8);
        setToolOutput({ type:"highlights", items }); addXP(8);
      } else if (toolId === "quiz") {
        const r = await callClaude(`Generate 6 MCQ questions. Return ONLY JSON array: [{"q":"question","options":["A","B","C","D"],"answer":0,"explanation":"why this answer"}]\n\n${mat}`, undefined, 2500);
        const qs = safeJSON(r, []);
        if (!qs.length) throw new Error("Quiz generation failed. Try again.");
        setQuizState({ questions:qs, current:0, selected:null, score:0, done:false });
        setToolOutput({ type:"quiz" }); addXP(5);
      } else if (toolId === "flashcards") {
        const r = await callClaude(`Generate 8 flashcards. Return ONLY JSON array: [{"front":"term or question","back":"definition or answer"}]\n\n${mat}`, undefined, 2500);
        const cards = safeJSON(r, []);
        if (!cards.length) throw new Error("Flashcard generation failed.");
        setFlashState({ cards, current:0, flipped:false, known:[], done:false });
        setToolOutput({ type:"flashcards" }); addXP(8);
      } else if (toolId === "tutor") {
        setToolOutput({ type:"tutor" });
        setTutorMsgs([{ role:"ai", text:"Hi! I'm your AI Tutor for this material. Ask me anything!" }]);
      } else if (toolId === "explain") {
        // Open the Word Explainer bot — no API call yet, just open the UI
        setToolOutput({ type:"explainer" });
        setExplainMsgs([{
          role:"ai",
          text:"Hi! I'm your Word Explainer 🔍\n\nType any difficult word, term, or phrase and I'll explain it simply with real-world examples.\n\nFor example try: 'osmosis', 'photosynthesis', 'inflation', 'algorithm'..."
        }]);
        setLoading(false);
        return;
      } else if (toolId === "essaycheck") {
        const r = await callClaude(`Review this text as an essay. Provide: 1) Grammar issues 2) Structure feedback 3) Clarity improvements 4) Score out of 10. Plain text, no markdown:\n\n${mat}`, undefined, 2500);
        setToolOutput({ type:"text", content:stripMd(r), tool:"Essay Check" }); addXP(10);
      } else if (toolId === "translate") {
        const r = await callClaude(`Translate to ${translateLang}. Plain text only, no markdown symbols, preserve paragraph breaks:\n\n${mat}`, undefined, 3000);
        const cfg = LANG_CONFIG[translateLang];
        setToolOutput({ type:"translate", content:stripMd(r), lang:translateLang, langCode:cfg?.codes[0]||"en-US" }); addXP(8);
      } else if (toolId === "readaloud") {
        setToolOutput({ type:"readaloud", content:stripMd(studyMaterial.text) });
      } else if (toolId === "youtube") {
        const r = await callClaude(`Extract 5 specific YouTube educational search queries from this material. Return ONLY JSON array of strings: ["query1","query2",...]\n\n${mat}`);
        const queries = safeJSON(r, [mat.slice(0,50)]).slice(0,5);
        const videos = queries.map((q,i) => ({ id:i, query:q, searchUrl:`https://www.youtube.com/results?search_query=${encodeURIComponent(q+" explained")}` }));
        setToolOutput({ type:"youtube", videos, queries }); addXP(5);
      } else if (toolId === "cheatsheet") {
        const r = await callClaude(`Create a concise one-page cheat sheet. Use sections with labels, key terms, formulas, quick facts. Plain text only, no markdown:\n\n${mat}`, undefined, 3000);
        setToolOutput({ type:"text", content:stripMd(r), tool:"Cheat Sheet" }); addXP(10);
      } else if (toolId === "mocktest") {
        const r = await callClaude(`Generate 10 MCQ questions for a full mock test. Return ONLY JSON array: [{"q":"question","options":["A","B","C","D"],"answer":0}]\n\n${mat}`, undefined, 3000);
        const qs = safeJSON(r, []);
        if (!qs.length) throw new Error("Mock test generation failed.");
        setToolOutput({ type:"mocktest", questions:qs, answers:[], current:0, done:false, timeLeft:qs.length*60 });
      } else if (toolId === "games") {
        const r = await callClaude(
          `You are an educational game curator for children aged 6-15. Analyze this study material and suggest 8 educational games/activities that will help children learn these topics in a fun way.

For each game, provide direct playable links from well-known educational platforms.

Return ONLY a JSON array:
[
  {
    "title": "Game name",
    "platform": "Platform name e.g. Kahoot, Quizlet, Khan Academy, PBS Kids, National Geographic Kids, CoolMathGames, Funbrain, ABCya, Scratch, BrainPOP",
    "description": "One sentence what the child will learn",
    "ageRange": "6-8" or "8-12" or "10-15",
    "category": "Quiz" or "Puzzle" or "Adventure" or "Simulation" or "Creative" or "Strategy",
    "emoji": "relevant emoji",
    "searchQuery": "specific search query to find this type of game on the platform",
    "url": "direct URL to the platform or specific game page"
  }
]

Use ONLY these real platform URLs:
- Khan Academy: https://www.khanacademy.org
- Quizlet: https://quizlet.com
- Kahoot: https://kahoot.com
- PBS Kids: https://pbskids.org
- National Geographic Kids: https://kids.nationalgeographic.com/games
- CoolMath Games: https://www.coolmathgames.com
- Funbrain: https://www.funbrain.com
- ABCya: https://www.abcya.com
- BrainPOP: https://www.brainpop.com
- Scratch: https://scratch.mit.edu/explore/projects/games
- NASA Kids Club: https://www.nasa.gov/learning-resources/for-kids-and-students
- Smithsonian: https://www.si.edu/kids

Material:
${mat}`,
          "You are an educational game curator. Return ONLY valid JSON array."
        );
        const extractArr = (text) => {
          const s = text.indexOf("["); const e = text.lastIndexOf("]");
          if (s === -1 || e === -1) return [];
          try { return JSON.parse(text.slice(s, e+1)); } catch { return []; }
        };
        const games = extractArr(r).slice(0, 8);
        if (!games.length) throw new Error("Could not generate game suggestions. Try again.");
        setToolOutput({ type:"games", games }); addXP(5);
      }
      addToHistory(toolId);
    } catch (err) { addToast("Error: " + err.message); }
    setLoading(false);
  };

  const sendTutor = async () => {
    if (!tutorInput.trim() || loading) return;
    const msg = tutorInput; setTutorInput("");
    setTutorMsgs(m => [...m, { role:"user", text:msg }]);
    setLoading(true);
    try {
      const r = await callClaude(`Student asks: "${msg}"`, `You are an AI Tutor. Only answer based on this material:\n\n${studyMaterial.text.slice(0,10000)}\n\nIf not covered, say so.`);
      setTutorMsgs(m => [...m, { role:"ai", text:r }]);
    } catch { setTutorMsgs(m => [...m, { role:"ai", text:"Sorry, hit an error. Try again." }]); }
    setLoading(false);
  };

  const sendExplain = async () => {
    if (!explainInput.trim() || loading) return;
    const word = explainInput.trim();
    setExplainInput("");
    setExplainMsgs(m => [...m, { role:"user", text:word }]);
    setLoading(true);
    try {
      const levelLabel = { eli5:"a 10-year-old child", school:"a school student (age 14-16)", exam:"a university student" }[explainMode] || "a student";
      const context = studyMaterial ? `

Context from student's study material (use this if relevant): ${studyMaterial.text.slice(0,4000)}` : "";
      const prompt = `A student is asking about: "${word}"

Explain this to ${levelLabel}. Structure your answer exactly like this:

MEANING:
Write a clear, simple 2-3 sentence definition.

IN SIMPLE WORDS:
Explain it like telling a friend, using everyday language.

REAL-WORLD EXAMPLE:
Give 2-3 concrete real-world examples they can relate to from daily life, news, or science.

MEMORY TIP:
One clever trick, analogy or mnemonic to remember this word/concept.

RELATED WORDS:
List 3-4 related terms they should also know.
${context}

Plain text only. No markdown symbols like # or **.`;

      const r = await callClaude(prompt,
        "You are a friendly, brilliant word explainer. You make complex words and concepts crystal clear with vivid real-world examples. You explain to the student's level. Plain text only, no markdown.");
      setExplainMsgs(m => [...m, { role:"ai", text:stripMd(r) }]);
      addXP(5);
    } catch(e) {
      setExplainMsgs(m => [...m, { role:"ai", text:"Sorry, couldn't explain that. Please try again." }]);
    }
    setLoading(false);
    setTimeout(() => explainEndRef.current?.scrollIntoView({ behavior:"smooth" }), 100);
  };

  const answerQuiz = (idx) => {
    if (quizState.selected !== null) return;
    const correct = quizState.questions[quizState.current].answer === idx;
    setQuizState(q => ({ ...q, selected:idx, score:correct?q.score+1:q.score }));
    if (correct) addXP(15);
  };

  const nextQuiz = () => {
    setQuizState(q => {
      if (q.current+1 >= q.questions.length) {
        setUserProgress(p => ({ ...p, quizzesTaken:(p.quizzesTaken||0)+1, quizHistory:[...(p.quizHistory||[]),{score:q.score,total:q.questions.length,date:nowStr()}] }));
        return { ...q, done:true };
      }
      return { ...q, current:q.current+1, selected:null };
    });
  };

  const flipCard = () => setFlashState(f => ({ ...f, flipped:!f.flipped }));
  const nextCard = (known) => {
    setFlashState(f => {
      const nk = known ? [...f.known, f.current] : f.known;
      if (f.current+1 >= f.cards.length) { setUserProgress(p => ({ ...p, flashcardsReviewed:(p.flashcardsReviewed||0)+f.cards.length })); return { ...f, done:true, known:nk }; }
      return { ...f, current:f.current+1, flipped:false, known:nk };
    });
    if (known) addXP(5);
  };

  // Mock test timer
  useEffect(() => {
    if (toolOutput?.type === "mocktest" && !toolOutput.done && toolOutput.timeLeft > 0) {
      const t = setTimeout(() => setToolOutput(o => o?.type==="mocktest" ? { ...o, timeLeft:o.timeLeft-1 } : o), 1000);
      return () => clearTimeout(t);
    }
    if (toolOutput?.type === "mocktest" && toolOutput.timeLeft === 0 && !toolOutput.done) {
      setToolOutput(o => ({ ...o, done:true }));
    }
  }, [toolOutput]);

  const btnStyle = (active) => ({ flexShrink:0, padding:"9px 15px", borderRadius:11, border:active?"2px solid #7c3aed":"1.5px solid #e5e7eb", background:active?"#7c3aed":"#fff", color:active?"#fff":"#374151", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Mono',monospace", display:"flex", alignItems:"center", gap:6, transition:"all 0.15s", boxShadow:active?"0 4px 14px rgba(124,58,237,0.3)":"none" });

  return (
    <div>
      {/* Upload Card */}
      {!studyMaterial && (
        <div style={{ background:"#fff", borderRadius:20, border:"1px solid #e5e7eb", padding:"26px 30px", marginBottom:22, boxShadow:"0 4px 24px rgba(0,0,0,0.04)" }}>
          <h2 style={{ margin:"0 0 4px", fontSize:19, fontWeight:700, color:"#111827", fontFamily:"'DM Mono',monospace" }}>Upload Study Material</h2>
          <p style={{ margin:"0 0 16px", fontSize:13, color:"#6b7280" }}>Paste notes, upload a file, scan an image, or speak your content</p>
          <div style={{ display:"flex", gap:8, marginBottom:14, flexWrap:"wrap" }}>
            {["paste","file","scan"].map(t => (
              <button key={t} onClick={() => setTab(t)} style={{ padding:"7px 16px", borderRadius:9, border:"none", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"'DM Mono',monospace", background:tab===t?"#7c3aed":"#f3f4f6", color:tab===t?"#fff":"#6b7280" }}>
                {t === "paste" ? "📋 Paste Text" : t === "file" ? "📁 Upload File" : "📷 Scan Image"}
              </button>
            ))}
          </div>
          {tab === "paste" && (
            <div>
              <textarea value={rawText} onChange={e => setRawText(e.target.value)}
                placeholder="Paste your study material here — lecture notes, articles, textbook chapters..."
                style={{ width:"100%", minHeight:180, padding:"13px 15px", border:"1.5px solid #e5e7eb", borderRadius:11, fontSize:14, lineHeight:1.65, color:"#111827", fontFamily:"inherit", resize:"vertical", outline:"none", boxSizing:"border-box", background:"#fafafa" }}
                onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"}
              />
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10, flexWrap:"wrap", gap:8 }}>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={handleVoiceInput} style={{ padding:"8px 14px", background:"#f3f4f6", border:"none", borderRadius:9, fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace", color:"#374151", fontWeight:600 }}>🎙 Voice</button>
                  <span style={{ fontSize:12, color:"#9ca3af", fontFamily:"'DM Mono',monospace", alignSelf:"center" }}>{rawText.length.toLocaleString()} chars · {wc(rawText).toLocaleString()} words</span>
                </div>
                <button onClick={handleUseText} style={{ padding:"10px 22px", background:"linear-gradient(135deg,#7c3aed,#4f46e5)", color:"#fff", border:"none", borderRadius:10, fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace", boxShadow:"0 4px 14px rgba(124,58,237,0.35)" }}>Use This Text →</button>
              </div>
            </div>
          )}
          {tab === "file" && (
            <div style={{ textAlign:"center", padding:"28px 0" }}>
              <input type="file" ref={fileRef} onChange={handleFile} accept=".txt,.pdf,.docx" style={{ display:"none" }} />
              <button onClick={() => fileRef.current?.click()} disabled={fileLoading} style={{ padding:"12px 26px", background:fileLoading?"#e0f2fe":"#f3f4f6", border:"2px dashed #d1d5db", borderRadius:12, fontSize:14, color: fileLoading?"#0369a1":"#4b5563", cursor: fileLoading?"not-allowed":"pointer", fontFamily:"'DM Mono',monospace" }}>{fileLoading ? "⏳ Reading file..." : "Click to upload .txt / .pdf / .docx"}</button>
            </div>
          )}
          {tab === "scan" && (
            <div style={{ textAlign:"center", padding:"28px 0" }}>
              <input type="file" ref={imgRef} onChange={handleImage} accept="image/*" style={{ display:"none" }} />
              <button onClick={() => imgRef.current?.click()} disabled={ocrLoading} style={{ padding:"12px 26px", background:ocrLoading?"#e9d5ff":"#fdf4ff", border:"2px dashed #d8b4fe", borderRadius:12, fontSize:14, color:"#7c3aed", cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>
                {ocrLoading ? "🔍 Running OCR..." : "📷 Upload Image / Scan"}
              </button>
              <p style={{ fontSize:12, color:"#9ca3af", marginTop:8 }}>Supports JPG, PNG, HEIC — text is extracted via OCR</p>
            </div>
          )}
        </div>
      )}

      {/* Loaded banner */}
      {studyMaterial && (
        <div style={{ background:"linear-gradient(135deg,#ecfdf5,#f0fdf4)", border:"1px solid #86efac", borderRadius:14, padding:"13px 18px", marginBottom:18, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:"#16a34a", fontFamily:"'DM Mono',monospace" }}>✓ Content loaded!</div>
            <div style={{ fontSize:12, color:"#4b5563", marginTop:2 }}>{studyMaterial.wordCount.toLocaleString()} words · {studyMaterial.text.length.toLocaleString()} chars</div>
          </div>
          <button onClick={() => { setStudyMaterial(null); setActiveTool(null); setToolOutput(null); }} style={{ padding:"5px 12px", background:"#fff", border:"1px solid #86efac", borderRadius:8, fontSize:12, color:"#16a34a", cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>✕ Clear</button>
        </div>
      )}
      {studyMaterial && (
        <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:11, padding:"10px 14px", marginBottom:18, maxHeight:72, overflow:"hidden" }}>
          <p style={{ margin:0, fontSize:12, color:"#6b7280", lineHeight:1.6, fontFamily:"monospace" }}>{studyMaterial.text.slice(0,220)}...</p>
        </div>
      )}

      {/* Tools bar */}
      {studyMaterial && (
        <div style={{ marginBottom:22 }}>
          <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:8, scrollbarWidth:"none" }}>
            {TOOLS.map(t => (
              <button key={t.id} onClick={() => { const opts=["summarize","explain","translate"]; if(opts.includes(t.id)) setActiveTool(t.id); else runTool(t.id); }} style={btnStyle(activeTool===t.id)}>
                <span>{t.icon}</span><span>{t.label}</span>
              </button>
            ))}
          </div>
          {/* Tool options */}
          {activeTool === "summarize" && (
            <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap" }}>
              {["points","paragraph"].map(m => (<button key={m} onClick={() => setSummarizeMode(m)} style={{ padding:"6px 13px", borderRadius:8, border:"1px solid #e5e7eb", background:summarizeMode===m?"#ede9fe":"#fff", color:summarizeMode===m?"#7c3aed":"#6b7280", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{m==="points"?"Bullet Points":"Paragraph"}</button>))}
              <button onClick={() => runTool("summarize")} style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#7c3aed", color:"#fff", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>Generate →</button>
            </div>
          )}
          {activeTool === "translate" && (
            <div style={{ display:"flex", gap:8, marginTop:10, alignItems:"center", flexWrap:"wrap" }}>
              <select value={translateLang} onChange={e => setTranslateLang(e.target.value)} style={{ padding:"7px 12px", borderRadius:8, border:"1.5px solid #e5e7eb", fontSize:13, color:"#374151", background:"#fff", cursor:"pointer", minWidth:220 }}>
                {LANGS.map(l => { const c = LANG_CONFIG[l]; return <option key={l} value={l}>{c?`${c.flag} ${l} — ${c.native}`:l}</option>; })}
              </select>
              <button onClick={() => runTool("translate")} style={{ padding:"7px 16px", borderRadius:8, border:"none", background:"#7c3aed", color:"#fff", fontSize:13, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:700 }}>Translate →</button>
            </div>
          )}
          {activeTool === "explain" && (
            <div style={{ display:"flex", gap:8, marginTop:10, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:12, color:"#6b7280", fontFamily:"'DM Mono',monospace" }}>Explain level:</span>
              {[["eli5","👶 ELI5"],["school","🏫 School"],["exam","🎓 Exam"]].map(([m,l]) => (
                <button key={m} onClick={() => setExplainMode(m)} style={{ padding:"6px 13px", borderRadius:8, border:"1px solid #e5e7eb", background:explainMode===m?"#ede9fe":"#fff", color:explainMode===m?"#7c3aed":"#6b7280", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{l}</button>
              ))}
              <button onClick={() => runTool("explain")} style={{ padding:"6px 14px", borderRadius:8, border:"none", background:"#7c3aed", color:"#fff", fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>Open Explainer →</button>
            </div>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && activeTool !== "tutor" && (
        <div style={{ textAlign:"center", padding:"36px 0" }}>
          <div style={{ width:38, height:38, borderRadius:"50%", border:"3px solid #ede9fe", borderTopColor:"#7c3aed", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} />
          <p style={{ margin:0, fontSize:14, color:"#7c3aed", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>AI is thinking...</p>
        </div>
      )}

      {/* Text output */}
      {toolOutput?.type === "text" && !loading && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"22px 26px", boxShadow:"0 4px 20px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize:11, fontWeight:700, color:"#7c3aed", fontFamily:"'DM Mono',monospace", letterSpacing:0.8, marginBottom:10 }}>{toolOutput.tool?.toUpperCase()}</div>
          <pre style={{ margin:0, fontSize:14, lineHeight:1.85, color:"#111827", fontFamily:"inherit", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{toolOutput.content}</pre>
          <div style={{ marginTop:12, display:"flex", gap:8 }}>
            <button onClick={() => { navigator.clipboard.writeText(toolOutput.content); addToast("Copied!"); }} style={{ padding:"7px 14px", background:"#f3f4f6", border:"none", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace", color:"#374151", fontWeight:600 }}>Copy</button>
          </div>
          <ReadAloudPlayer text={toolOutput.content} langName="English" />
        </div>
      )}

      {/* Translate output */}
      {toolOutput?.type === "translate" && !loading && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"22px 26px", boxShadow:"0 4px 20px rgba(0,0,0,0.04)" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
            <span style={{ fontSize:20 }}>{LANG_CONFIG[toolOutput.lang]?.flag}</span>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:"#7c3aed", fontFamily:"'DM Mono',monospace" }}>TRANSLATED TO {toolOutput.lang.toUpperCase()}</div>
              <div style={{ fontSize:11, color:"#9ca3af" }}>{LANG_CONFIG[toolOutput.lang]?.native} · {toolOutput.langCode}</div>
            </div>
          </div>
          <pre style={{ margin:0, fontSize:14, lineHeight:1.85, color:"#111827", fontFamily:"inherit", whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{toolOutput.content}</pre>
          <div style={{ marginTop:12, display:"flex", gap:8 }}>
            <button onClick={() => { navigator.clipboard.writeText(toolOutput.content); addToast("Copied!"); }} style={{ padding:"7px 14px", background:"#f3f4f6", border:"none", borderRadius:8, fontSize:12, cursor:"pointer", fontFamily:"'DM Mono',monospace", color:"#374151", fontWeight:600 }}>Copy</button>
          </div>
          <ReadAloudPlayer text={toolOutput.content} langName={toolOutput.lang} />
        </div>
      )}

      {/* Read Aloud output */}
      {toolOutput?.type === "readaloud" && !loading && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"22px 26px", boxShadow:"0 4px 20px rgba(0,0,0,0.04)" }}>
          <div style={{ fontSize:13, fontWeight:700, color:"#7c3aed", fontFamily:"'DM Mono',monospace", marginBottom:4 }}>▶ Read Aloud</div>
          <div style={{ background:"#f9fafb", borderRadius:10, padding:"10px 13px", marginBottom:4, maxHeight:100, overflowY:"auto" }}>
            <p style={{ margin:0, fontSize:12, color:"#6b7280", lineHeight:1.6, fontFamily:"monospace" }}>{toolOutput.content.slice(0,280)}...</p>
          </div>
          <ReadAloudPlayer text={toolOutput.content} langName="English" />
        </div>
      )}

      {/* Highlights */}
      {toolOutput?.type === "highlights" && !loading && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12 }}>
          {toolOutput.items.map((item, i) => (
            <div key={i} style={{ background:i%2===0?"#fdf4ff":"#eff6ff", border:`1px solid ${i%2===0?"#e9d5ff":"#bfdbfe"}`, borderRadius:12, padding:"13px 15px" }}>
              <div style={{ fontSize:10, fontWeight:700, color:i%2===0?"#9333ea":"#2563eb", fontFamily:"'DM Mono',monospace", marginBottom:5, letterSpacing:0.8 }}>KEY POINT {i+1}</div>
              <p style={{ margin:0, fontSize:13, color:"#374151", lineHeight:1.6 }}>{item}</p>
            </div>
          ))}
        </div>
      )}

      {/* Quiz */}
      {toolOutput?.type === "quiz" && quizState && !quizState.done && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"26px", boxShadow:"0 4px 20px rgba(0,0,0,0.04)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
            <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:"#6b7280", fontWeight:600 }}>Q {quizState.current+1}/{quizState.questions.length}</span>
            <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:"#7c3aed", fontWeight:700 }}>Score: {quizState.score}</span>
          </div>
          <div style={{ width:"100%", height:5, background:"#f3f4f6", borderRadius:99, marginBottom:18, overflow:"hidden" }}>
            <div style={{ height:"100%", background:"linear-gradient(90deg,#7c3aed,#4f46e5)", borderRadius:99, width:`${((quizState.current+1)/quizState.questions.length)*100}%`, transition:"width 0.3s" }} />
          </div>
          <h3 style={{ margin:"0 0 18px", fontSize:16, color:"#111827", lineHeight:1.5 }}>{quizState.questions[quizState.current].q}</h3>
          <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
            {quizState.questions[quizState.current].options.map((opt, i) => {
              let bg="#f9fafb", border="#e5e7eb", color="#374151";
              if (quizState.selected !== null) {
                if (i===quizState.questions[quizState.current].answer) { bg="#dcfce7"; border="#86efac"; color="#16a34a"; }
                else if (i===quizState.selected) { bg="#fef2f2"; border="#fca5a5"; color="#dc2626"; }
              }
              return <button key={i} onClick={() => answerQuiz(i)} style={{ padding:"11px 15px", borderRadius:10, border:`1.5px solid ${border}`, background:bg, fontSize:14, color, cursor:"pointer", textAlign:"left", fontWeight:quizState.selected!==null&&i===quizState.questions[quizState.current].answer?700:400, transition:"all 0.15s" }}>{opt}</button>;
            })}
          </div>
          {quizState.selected !== null && (
            <div>
              {quizState.questions[quizState.current].explanation && (
                <div style={{ marginTop:12, padding:"10px 14px", background:"#eff6ff", borderRadius:9, fontSize:13, color:"#1e40af", lineHeight:1.6 }}>
                  💡 {quizState.questions[quizState.current].explanation}
                </div>
              )}
              <button onClick={nextQuiz} style={{ marginTop:12, padding:"9px 22px", background:"#7c3aed", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>
                {quizState.current+1 < quizState.questions.length ? "Next →" : "See Results"}
              </button>
            </div>
          )}
        </div>
      )}
      {toolOutput?.type === "quiz" && quizState?.done && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"44px", textAlign:"center" }}>
          <div style={{ fontSize:50, marginBottom:12 }}>🎉</div>
          <h2 style={{ margin:"0 0 8px", fontFamily:"'DM Mono',monospace", color:"#111827" }}>Quiz Complete!</h2>
          <p style={{ margin:"0 0 24px", fontSize:16, color:"#6b7280" }}>Score: <strong style={{ color:"#7c3aed" }}>{quizState.score}/{quizState.questions.length}</strong> · {Math.round((quizState.score/quizState.questions.length)*100)}%</p>
          <button onClick={() => runTool("quiz")} style={{ padding:"10px 22px", background:"#7c3aed", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>Try Again</button>
        </div>
      )}

      {/* Flashcards */}
      {toolOutput?.type === "flashcards" && flashState && !flashState.done && (
        <div style={{ maxWidth:460, margin:"0 auto" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
            <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:"#6b7280" }}>Card {flashState.current+1}/{flashState.cards.length}</span>
            <span style={{ fontSize:12, fontFamily:"'DM Mono',monospace", color:"#16a34a", fontWeight:600 }}>Known: {flashState.known.length}</span>
          </div>
          <div onClick={flipCard} style={{ minHeight:190, borderRadius:18, cursor:"pointer", background:flashState.flipped?"linear-gradient(135deg,#4f46e5,#7c3aed)":"#fff", border:"2px solid #e5e7eb", padding:"28px 24px", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", textAlign:"center", transition:"background 0.3s", boxShadow:"0 8px 28px rgba(0,0,0,0.08)" }}>
            <div style={{ fontSize:10, fontWeight:700, letterSpacing:1.2, color:flashState.flipped?"rgba(255,255,255,0.6)":"#9ca3af", fontFamily:"'DM Mono',monospace", marginBottom:12 }}>{flashState.flipped?"ANSWER":"QUESTION"}</div>
            <p style={{ margin:0, fontSize:15, lineHeight:1.65, fontWeight:600, color:flashState.flipped?"#fff":"#111827" }}>{flashState.flipped?flashState.cards[flashState.current].back:flashState.cards[flashState.current].front}</p>
            <div style={{ fontSize:11, color:flashState.flipped?"rgba(255,255,255,0.4)":"#d1d5db", marginTop:14 }}>tap to flip</div>
          </div>
          {flashState.flipped && (
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <button onClick={() => nextCard(false)} style={{ flex:1, padding:"11px", background:"#fef2f2", border:"1.5px solid #fca5a5", borderRadius:10, color:"#dc2626", fontSize:14, fontWeight:600, cursor:"pointer" }}>✗ Review Again</button>
              <button onClick={() => nextCard(true)} style={{ flex:1, padding:"11px", background:"#dcfce7", border:"1.5px solid #86efac", borderRadius:10, color:"#16a34a", fontSize:14, fontWeight:600, cursor:"pointer" }}>✓ Got It!</button>
            </div>
          )}
        </div>
      )}
      {toolOutput?.type === "flashcards" && flashState?.done && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"44px", textAlign:"center" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🃏</div>
          <h2 style={{ margin:"0 0 8px", fontFamily:"'DM Mono',monospace" }}>Deck Complete!</h2>
          <p style={{ color:"#6b7280", margin:"0 0 22px" }}>Marked <strong style={{ color:"#16a34a" }}>{flashState.known.length}</strong> of {flashState.cards.length} as known</p>
          <button onClick={() => runTool("flashcards")} style={{ padding:"10px 22px", background:"#7c3aed", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>New Deck</button>
        </div>
      )}

      {/* AI Tutor */}
      {toolOutput?.type === "tutor" && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.04)" }}>
          <div style={{ padding:"13px 18px", borderBottom:"1px solid #e5e7eb", background:"linear-gradient(135deg,#fdf4ff,#eff6ff)", display:"flex", alignItems:"center", gap:10 }}>
            <span style={{ fontSize:16 }}>◎</span>
            <div><div style={{ fontSize:13, fontWeight:700, color:"#7c3aed", fontFamily:"'DM Mono',monospace" }}>AI Tutor</div><div style={{ fontSize:11, color:"#6b7280" }}>Answers based on your material</div></div>
          </div>
          <div style={{ height:280, overflowY:"auto", padding:"14px 18px", display:"flex", flexDirection:"column", gap:9 }}>
            {tutorMsgs.map((m, i) => (
              <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start" }}>
                <div style={{ maxWidth:"78%", padding:"9px 13px", borderRadius:12, background:m.role==="user"?"#7c3aed":"#f3f4f6", color:m.role==="user"?"#fff":"#111827", fontSize:14, lineHeight:1.65 }}>{m.text}</div>
              </div>
            ))}
            {loading && <div style={{ fontSize:13, color:"#9ca3af", fontFamily:"'DM Mono',monospace" }}>AI is typing...</div>}
          </div>
          <div style={{ padding:"11px 14px", borderTop:"1px solid #e5e7eb", display:"flex", gap:8 }}>
            <input value={tutorInput} onChange={e => setTutorInput(e.target.value)} onKeyDown={e => e.key==="Enter"&&sendTutor()} placeholder="Ask a question..." style={{ flex:1, padding:"9px 13px", border:"1.5px solid #e5e7eb", borderRadius:10, fontSize:14, outline:"none", color:"#111827" }} onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"} />
            <button onClick={sendTutor} disabled={loading} style={{ padding:"9px 16px", background:"#7c3aed", border:"none", borderRadius:10, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>→</button>
          </div>
        </div>
      )}

      {/* Word Explainer Bot */}
      {toolOutput?.type === "explainer" && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.04)" }}>
          {/* Header */}
          <div style={{ padding:"14px 20px", borderBottom:"1px solid #e5e7eb", background:"linear-gradient(135deg,#fdf4ff,#fff7ed)" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:"linear-gradient(135deg,#7c3aed,#ea580c)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>🔍</div>
              <div>
                <div style={{ fontSize:14, fontWeight:700, color:"#111827", fontFamily:"'DM Mono',monospace" }}>Word Explainer</div>
                <div style={{ fontSize:11, color:"#6b7280" }}>Type any difficult word or term — AI explains it simply with real examples</div>
              </div>
              {/* Level badge */}
              <div style={{ marginLeft:"auto", display:"flex", gap:6 }}>
                {[["eli5","👶"],["school","🏫"],["exam","🎓"]].map(([m,icon]) => (
                  <button key={m} onClick={() => setExplainMode(m)} title={m} style={{ width:28, height:28, borderRadius:8, border:`1.5px solid ${explainMode===m?"#7c3aed":"#e5e7eb"}`, background:explainMode===m?"#ede9fe":"#f9fafb", fontSize:14, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>{icon}</button>
                ))}
              </div>
            </div>
            <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {["osmosis","photosynthesis","inflation","algorithm","democracy","gravity"].map(ex => (
                <button key={ex} onClick={() => { setExplainInput(ex); }} style={{ padding:"3px 10px", background:"#f3f4f6", border:"1px solid #e5e7eb", borderRadius:20, fontSize:11, color:"#6b7280", cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>{ex}</button>
              ))}
            </div>
          </div>

          {/* Messages */}
          <div style={{ height:360, overflowY:"auto", padding:"16px 18px", display:"flex", flexDirection:"column", gap:12 }}>
            {explainMsgs.map((m, i) => (
              <div key={i} style={{ display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start", gap:8, alignItems:"flex-start" }}>
                {m.role === "ai" && (
                  <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#7c3aed,#ea580c)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0, marginTop:2 }}>🔍</div>
                )}
                <div style={{
                  maxWidth:"82%",
                  padding: m.role==="user" ? "9px 14px" : "12px 16px",
                  borderRadius: m.role==="user" ? "16px 16px 4px 16px" : "4px 16px 16px 16px",
                  background: m.role==="user" ? "linear-gradient(135deg,#7c3aed,#4f46e5)" : "#f8f7ff",
                  border: m.role==="ai" ? "1px solid #e9d5ff" : "none",
                  color: m.role==="user" ? "#fff" : "#111827",
                  fontSize: 14,
                  lineHeight: 1.75,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}>
                  {m.role === "ai" && m.text.includes("MEANING:") ? (
                    // Parse structured response into sections
                    <div>
                      {m.text.split(/\n(?=[A-Z ]+:)/).map((section, si) => {
                        const colonIdx = section.indexOf(":");
                        if (colonIdx === -1) return <p key={si} style={{ margin:"0 0 8px" }}>{section.trim()}</p>;
                        const label = section.slice(0, colonIdx).trim();
                        const body = section.slice(colonIdx + 1).trim();
                        const sectionColors = {
                          "MEANING": { bg:"#ede9fe", color:"#7c3aed", icon:"📖" },
                          "IN SIMPLE WORDS": { bg:"#f0fdf4", color:"#16a34a", icon:"💬" },
                          "REAL-WORLD EXAMPLE": { bg:"#fff7ed", color:"#ea580c", icon:"🌍" },
                          "MEMORY TIP": { bg:"#fef9c3", color:"#ca8a04", icon:"🧠" },
                          "RELATED WORDS": { bg:"#eff6ff", color:"#2563eb", icon:"🔗" },
                        };
                        const sc = sectionColors[label] || { bg:"#f3f4f6", color:"#374151", icon:"•" };
                        return (
                          <div key={si} style={{ marginBottom:10, borderRadius:10, overflow:"hidden", border:`1px solid ${sc.bg}` }}>
                            <div style={{ padding:"5px 12px", background:sc.bg, fontSize:11, fontWeight:700, color:sc.color, fontFamily:"'DM Mono',monospace", letterSpacing:0.5, display:"flex", alignItems:"center", gap:6 }}>
                              <span>{sc.icon}</span><span>{label}</span>
                            </div>
                            <div style={{ padding:"8px 12px", fontSize:13, color:"#374151", lineHeight:1.7, background:"#fff" }}>{body}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <span>{m.text}</span>
                  )}
                </div>
                {m.role === "user" && (
                  <div style={{ width:28, height:28, borderRadius:8, background:"#7c3aed", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, flexShrink:0, marginTop:2, color:"#fff", fontWeight:700 }}>S</div>
                )}
              </div>
            ))}
            {loading && activeTool === "explain" && (
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <div style={{ width:28, height:28, borderRadius:8, background:"linear-gradient(135deg,#7c3aed,#ea580c)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13 }}>🔍</div>
                <div style={{ padding:"10px 14px", background:"#f8f7ff", border:"1px solid #e9d5ff", borderRadius:"4px 16px 16px 16px", display:"flex", gap:5, alignItems:"center" }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#7c3aed", animation:"bounce 0.8s infinite" }} />
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#7c3aed", animation:"bounce 0.8s 0.15s infinite" }} />
                  <div style={{ width:6, height:6, borderRadius:"50%", background:"#7c3aed", animation:"bounce 0.8s 0.3s infinite" }} />
                </div>
              </div>
            )}
            <div ref={explainEndRef} />
          </div>

          {/* Input */}
          <div style={{ padding:"12px 16px", borderTop:"1px solid #e5e7eb", background:"#fafafa" }}>
            <div style={{ display:"flex", gap:8 }}>
              <input
                value={explainInput}
                onChange={e => setExplainInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendExplain()}
                placeholder="Type a word or phrase to explain... e.g. 'mitosis', 'compound interest'"
                style={{ flex:1, padding:"11px 15px", border:"1.5px solid #e5e7eb", borderRadius:12, fontSize:14, outline:"none", color:"#111827", background:"#fff" }}
                onFocus={e => e.target.style.borderColor="#7c3aed"}
                onBlur={e => e.target.style.borderColor="#e5e7eb"}
              />
              <button
                onClick={sendExplain}
                disabled={loading || !explainInput.trim()}
                style={{ padding:"11px 20px", background:loading||!explainInput.trim()?"#e9d5ff":"linear-gradient(135deg,#7c3aed,#ea580c)", border:"none", borderRadius:12, color:"#fff", fontSize:14, fontWeight:700, cursor:loading||!explainInput.trim()?"default":"pointer", flexShrink:0 }}
              >Explain →</button>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
              <span style={{ fontSize:11, color:"#9ca3af", fontFamily:"'DM Mono',monospace" }}>
                Level: {explainMode === "eli5" ? "👶 ELI5" : explainMode === "school" ? "🏫 School" : "🎓 Exam"} · Change level in the header
              </span>
              {explainMsgs.length > 1 && (
                <button onClick={() => { setExplainMsgs([explainMsgs[0]]); }} style={{ fontSize:11, color:"#9ca3af", background:"none", border:"none", cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>Clear chat</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* YouTube */}
      {toolOutput?.type === "youtube" && !loading && (
        <div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:14, fontWeight:700, color:"#111827", fontFamily:"'DM Mono',monospace", marginBottom:3 }}>▷ YouTube Videos for Your Topic</div>
            <div style={{ fontSize:12, color:"#6b7280" }}>AI found {toolOutput.queries.length} search queries from your material. Click to search YouTube.</div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))", gap:12 }}>
            {toolOutput.videos.map((v, i) => {
              const cls = [{ bg:"#fef2f2",border:"#fca5a5",badge:"#fee2e2",badgeText:"#b91c1c" },{ bg:"#eff6ff",border:"#93c5fd",badge:"#dbeafe",badgeText:"#1d4ed8" },{ bg:"#f0fdf4",border:"#86efac",badge:"#dcfce7",badgeText:"#15803d" },{ bg:"#fdf4ff",border:"#d8b4fe",badge:"#f3e8ff",badgeText:"#7e22ce" },{ bg:"#fffbeb",border:"#fcd34d",badge:"#fef3c7",badgeText:"#92400e" }][i%5];
              return (
                <a key={v.id} href={v.searchUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none", display:"block" }}>
                  <div style={{ background:cls.bg, border:`1.5px solid ${cls.border}`, borderRadius:14, overflow:"hidden", transition:"transform 0.15s, box-shadow 0.15s", cursor:"pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.transform="translateY(-3px)"; e.currentTarget.style.boxShadow="0 8px 24px rgba(0,0,0,0.1)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="none"; }}>
                    <div style={{ height:120, background:`linear-gradient(135deg,${cls.bg},${cls.border}30)`, display:"flex", alignItems:"center", justifyContent:"center", position:"relative", borderBottom:`1px solid ${cls.border}` }}>
                      <div style={{ width:50, height:36, background:"#ff0000", borderRadius:9, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 14px rgba(255,0,0,0.4)" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>
                      </div>
                      <div style={{ position:"absolute", top:8, left:8, background:cls.badge, color:cls.badgeText, fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:20, fontFamily:"'DM Mono',monospace" }}>VIDEO {i+1}</div>
                      <div style={{ position:"absolute", top:8, right:8, background:"#ff0000", color:"#fff", fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:6, fontFamily:"'DM Mono',monospace" }}>YouTube</div>
                    </div>
                    <div style={{ padding:"12px 14px" }}>
                      <p style={{ margin:"0 0 6px", fontSize:13, fontWeight:700, color:"#111827", lineHeight:1.4, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden" }}>{v.query}</p>
                      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                        <span style={{ fontSize:11, color:"#6b7280", fontFamily:"'DM Mono',monospace" }}>Search YouTube →</span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
          <div style={{ marginTop:18, background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 18px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", marginBottom:8, letterSpacing:0.5 }}>CUSTOM SEARCH</div>
            <div style={{ display:"flex", gap:8 }}>
              <input id="yt-search" defaultValue={toolOutput.queries[0]||""} placeholder="Search any topic on YouTube..." style={{ flex:1, padding:"8px 13px", border:"1.5px solid #e5e7eb", borderRadius:9, fontSize:14, outline:"none", color:"#111827" }} onFocus={e => e.target.style.borderColor="#ef4444"} onBlur={e => e.target.style.borderColor="#e5e7eb"} onKeyDown={e => { if(e.key==="Enter"){ const q=e.target.value.trim(); if(q) window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,"_blank"); }}} />
              <button onClick={() => { const el=document.getElementById("yt-search"); const q=el?.value?.trim(); if(q) window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`,"_blank"); }} style={{ padding:"8px 16px", background:"#ff0000", border:"none", borderRadius:9, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5,3 19,12 5,21"/></svg>Search
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Educational Games */}
      {toolOutput?.type === "games" && !loading && (
        <div>
          {/* Header */}
          <div style={{ background:"linear-gradient(135deg,#1e1b4b,#312e81)", borderRadius:18, padding:"22px 26px", marginBottom:20, color:"#fff", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:-20, right:-20, fontSize:100, opacity:0.06 }}>🎮</div>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:6 }}>
              <span style={{ fontSize:28 }}>🎮</span>
              <div>
                <div style={{ fontSize:18, fontWeight:800, fontFamily:"'DM Mono',monospace" }}>Educational Games</div>
                <div style={{ fontSize:12, opacity:0.7, marginTop:2 }}>AI picked {toolOutput.games.length} games based on your study topic — click any to play!</div>
              </div>
            </div>
          </div>

          {/* Games grid */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:14, marginBottom:20 }}>
            {toolOutput.games.map((g, i) => {
              const catColors = {
                Quiz:       { bg:"#eff6ff", border:"#bfdbfe", badge:"#dbeafe", badgeText:"#1e40af", icon:"❓" },
                Puzzle:     { bg:"#fdf4ff", border:"#e9d5ff", badge:"#f3e8ff", badgeText:"#7e22ce", icon:"🧩" },
                Adventure:  { bg:"#f0fdf4", border:"#bbf7d0", badge:"#dcfce7", badgeText:"#166534", icon:"🗺" },
                Simulation: { bg:"#fff7ed", border:"#fed7aa", badge:"#ffedd5", badgeText:"#9a3412", icon:"🔬" },
                Creative:   { bg:"#fef2f2", border:"#fecaca", badge:"#fee2e2", badgeText:"#991b1b", icon:"🎨" },
                Strategy:   { bg:"#f0f9ff", border:"#bae6fd", badge:"#e0f2fe", badgeText:"#0c4a6e", icon:"♟" },
              };
              const ageColors = { "6-8":"#16a34a", "8-12":"#2563eb", "10-15":"#7c3aed" };
              const c = catColors[g.category] || catColors["Quiz"];
              return (
                <a key={i} href={g.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration:"none", display:"block" }}>
                  <div
                    style={{ background:"#fff", border:`2px solid ${c.border}`, borderRadius:16, overflow:"hidden", transition:"all 0.18s", cursor:"pointer", height:"100%" }}
                    onMouseEnter={e => { e.currentTarget.style.transform="translateY(-4px)"; e.currentTarget.style.boxShadow=`0 10px 28px ${c.border}88`; }}
                    onMouseLeave={e => { e.currentTarget.style.transform="translateY(0)"; e.currentTarget.style.boxShadow="none"; }}
                  >
                    {/* Card top banner */}
                    <div style={{ background:`linear-gradient(135deg,${c.bg},${c.border}44)`, padding:"16px 16px 12px", borderBottom:`1px solid ${c.border}` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                        <span style={{ fontSize:30 }}>{g.emoji}</span>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                          <span style={{ fontSize:10, fontWeight:700, background:c.badge, color:c.badgeText, padding:"3px 8px", borderRadius:20, fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>
                            {c.icon} {g.category}
                          </span>
                          <span style={{ fontSize:10, fontWeight:700, color:"#fff", background:ageColors[g.ageRange]||"#7c3aed", padding:"2px 8px", borderRadius:20, fontFamily:"'DM Mono',monospace" }}>
                            Age {g.ageRange}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize:14, fontWeight:800, color:"#111827", lineHeight:1.3, marginBottom:4 }}>{g.title}</div>
                      <div style={{ fontSize:11, fontWeight:600, color:c.badgeText, fontFamily:"'DM Mono',monospace", background:c.badge, display:"inline-block", padding:"2px 8px", borderRadius:6 }}>{g.platform}</div>
                    </div>
                    {/* Card body */}
                    <div style={{ padding:"12px 16px 14px" }}>
                      <p style={{ margin:"0 0 12px", fontSize:13, color:"#4b5563", lineHeight:1.6 }}>{g.description}</p>
                      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 12px", background:c.bg, borderRadius:9, border:`1px solid ${c.border}` }}>
                        <span style={{ fontSize:13 }}>🎮</span>
                        <span style={{ fontSize:12, fontWeight:700, color:c.badgeText, fontFamily:"'DM Mono',monospace" }}>Play Now →</span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>

          {/* Category filter legend */}
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"14px 18px", marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, marginBottom:10 }}>GAME CATEGORIES</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {[
                { label:"Quiz", icon:"❓", color:"#1e40af", bg:"#dbeafe" },
                { label:"Puzzle", icon:"🧩", color:"#7e22ce", bg:"#f3e8ff" },
                { label:"Adventure", icon:"🗺", color:"#166534", bg:"#dcfce7" },
                { label:"Simulation", icon:"🔬", color:"#9a3412", bg:"#ffedd5" },
                { label:"Creative", icon:"🎨", color:"#991b1b", bg:"#fee2e2" },
                { label:"Strategy", icon:"♟", color:"#0c4a6e", bg:"#e0f2fe" },
              ].map(cat => (
                <div key={cat.label} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", background:cat.bg, borderRadius:20 }}>
                  <span style={{ fontSize:12 }}>{cat.icon}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:cat.color, fontFamily:"'DM Mono',monospace" }}>{cat.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Age guide */}
          <div style={{ background:"#f9fafb", border:"1px solid #e5e7eb", borderRadius:14, padding:"14px 18px" }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, marginBottom:10 }}>AGE GUIDE</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
              {[["6-8","#16a34a","Primary (Grade 1-3)"],["8-12","#2563eb","Middle (Grade 3-7)"],["10-15","#7c3aed","Upper (Grade 5-10)"]].map(([age, color, label]) => (
                <div key={age} style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 12px", background:`${color}15`, border:`1px solid ${color}44`, borderRadius:20 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:color }} />
                  <span style={{ fontSize:11, fontWeight:700, color, fontFamily:"'DM Mono',monospace" }}>Age {age}</span>
                  <span style={{ fontSize:11, color:"#6b7280" }}>· {label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mock Test */}
      {toolOutput?.type === "mocktest" && !toolOutput.done && (
        <div style={{ maxWidth:520, margin:"0 auto" }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:12 }}>
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:13, color:"#374151", fontWeight:600 }}>Q {toolOutput.current+1}/{toolOutput.questions.length}</span>
            <span style={{ fontFamily:"'DM Mono',monospace", fontSize:13, color:"#dc2626", fontWeight:700 }}>⏱ {Math.floor(toolOutput.timeLeft/60).toString().padStart(2,"0")}:{(toolOutput.timeLeft%60).toString().padStart(2,"0")}</span>
          </div>
          <div style={{ width:"100%", height:5, background:"#f3f4f6", borderRadius:99, marginBottom:20, overflow:"hidden" }}>
            <div style={{ height:"100%", background:"linear-gradient(90deg,#7c3aed,#4f46e5)", borderRadius:99, width:`${((toolOutput.current+1)/toolOutput.questions.length)*100}%` }} />
          </div>
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:15, padding:"24px" }}>
            <h3 style={{ margin:"0 0 18px", fontSize:15, color:"#111827", lineHeight:1.5 }}>{toolOutput.questions[toolOutput.current].q}</h3>
            <div style={{ display:"flex", flexDirection:"column", gap:9 }}>
              {toolOutput.questions[toolOutput.current].options.map((opt, i) => (
                <button key={i} onClick={() => {
                  const a = [...toolOutput.answers]; a[toolOutput.current] = i;
                  if (toolOutput.current+1 >= toolOutput.questions.length) setToolOutput(o => ({ ...o, answers:a, done:true }));
                  else setToolOutput(o => ({ ...o, answers:a, current:o.current+1 }));
                  addXP(5);
                }} style={{ padding:"11px 14px", borderRadius:10, border:"1.5px solid #e5e7eb", background:"#f9fafb", fontSize:14, color:"#374151", cursor:"pointer", textAlign:"left", transition:"all 0.1s" }} onMouseEnter={e => { e.target.style.borderColor="#7c3aed"; e.target.style.background="#fdf4ff"; }} onMouseLeave={e => { e.target.style.borderColor="#e5e7eb"; e.target.style.background="#f9fafb"; }}>{opt}</button>
              ))}
            </div>
          </div>
        </div>
      )}
      {toolOutput?.type === "mocktest" && toolOutput.done && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"44px", textAlign:"center" }}>
          <div style={{ fontSize:50, marginBottom:12 }}>🏆</div>
          <h2 style={{ fontFamily:"'DM Mono',monospace", color:"#111827", margin:"0 0 8px" }}>Test Complete!</h2>
          <p style={{ fontSize:16, color:"#6b7280", margin:"0 0 22px" }}>
            Score: <strong style={{ color:"#7c3aed" }}>{toolOutput.answers.filter((a,i) => a===toolOutput.questions[i]?.answer).length}/{toolOutput.questions.length}</strong>
            {" "}· {Math.round((toolOutput.answers.filter((a,i) => a===toolOutput.questions[i]?.answer).length/toolOutput.questions.length)*100)}%
          </p>
          <button onClick={() => runTool("mocktest")} style={{ padding:"10px 22px", background:"#7c3aed", border:"none", borderRadius:10, color:"#fff", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>Retake</button>
        </div>
      )}
    </div>
  );
}


export default HomePage;
