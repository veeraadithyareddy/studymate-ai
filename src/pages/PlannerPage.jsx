import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── PLANNER PAGE ─────────────────────────────────────────────────────────────
function PlannerPage() {
  const today = new Date().toISOString().split("T")[0];

  // AI Plan state
  const [subject, setSubject] = useState("");
  const [topics, setTopics] = useState("");
  const [examDate, setExamDate] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState("2");
  const [plan, setPlan] = useState(() => { try { return JSON.parse(localStorage.getItem("smai_plan")||"null"); } catch { return null; } });
  const [generating, setGenerating] = useState(false);
  const [planError, setPlanError] = useState("");

  // Manual tasks state
  const [tasks, setTasks] = useState(() => { try { return JSON.parse(localStorage.getItem("smai_tasks")||"[]"); } catch { return []; } });
  const [taskInput, setTaskInput] = useState("");
  const [taskDue, setTaskDue] = useState("");

  const saveTasks = (u) => { setTasks(u); localStorage.setItem("smai_tasks", JSON.stringify(u)); };
  const addTask = () => { if (!taskInput.trim()) return; saveTasks([...tasks, { id:Date.now(), text:taskInput, due:taskDue, done:false }]); setTaskInput(""); setTaskDue(""); };
  const toggleTask = (id) => saveTasks(tasks.map(t => t.id===id?{...t,done:!t.done}:t));
  const delTask = (id) => saveTasks(tasks.filter(t => t.id!==id));

  // Compute days between today and exam
  const daysLeft = examDate ? Math.max(0, Math.ceil((new Date(examDate) - new Date(today)) / (1000*60*60*24))) : null;

  // Helper: add days to a date string
  const addDays = (dateStr, n) => {
    const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n);
    return d.toISOString().split("T")[0];
  };

  const generatePlan = async () => {
    if (!subject.trim()) { setPlanError("Please enter the subject name."); return; }
    if (!topics.trim()) { setPlanError("Please enter the topics to cover."); return; }
    if (!examDate) { setPlanError("Please select an exam date."); return; }
    if (new Date(examDate) <= new Date(today)) { setPlanError("Exam date must be in the future."); return; }
    setPlanError(""); setGenerating(true);

    try {
      const days = Math.max(1, Math.ceil((new Date(examDate) - new Date(today)) / (1000*60*60*24)));
      const topicList = topics.split(",").map(t => t.trim()).filter(Boolean);
      const sys = "You are an expert exam preparation planner. Return ONLY valid JSON. No explanation, no markdown, no extra text.";

      // ── Step 1: overview + phases + tips (small, reliable) ──────────────────
      const step1 = await callClaude(
        `Subject: ${subject}
Topics: ${topicList.join(", ")}
Days until exam: ${days}
Hours per day: ${hoursPerDay}

Return ONLY this JSON (no other text):
{"overview":"2 sentence study strategy","phases":[{"phase":"Phase name","days":"Day 1-X","goal":"brief goal"}],"examTips":["tip1","tip2","tip3","tip4","tip5"]}

Keep phases to max 3. Make phases cover all ${days} days proportionally.`,
        sys, 600
      );

      const meta = safeJSON(step1, {});

      // ── Step 2: build daily schedule in batches of 10 days ──────────────────
      const batchSize = 10;
      const batches = Math.ceil(days / batchSize);
      let allDays = [];

      for (let b = 0; b < batches; b++) {
        const startDay = b * batchSize + 1;
        const endDay = Math.min(startDay + batchSize - 1, days);
        const count = endDay - startDay + 1;

        // Figure out which topics go in this batch
        const startFrac = (startDay - 1) / days;
        const endFrac = endDay / days;
        const batchTopics = topicList.length > 0
          ? topicList.slice(
              Math.floor(startFrac * topicList.length),
              Math.max(Math.floor(endFrac * topicList.length), Math.floor(startFrac * topicList.length) + 1)
            )
          : [subject];

        const isLastBatch = b === batches - 1;
        const revisionNote = isLastBatch ? "Last 1-2 days must be full revision/mock test days." : "";

        const prompt2 = `Subject: ${subject}, Days ${startDay}-${endDay} of ${days} total, ${hoursPerDay}h/day
Topics for these days: ${batchTopics.join(", ")}
${revisionNote}

Return ONLY a JSON array of exactly ${count} objects (no other text):
[{"day":${startDay},"date":"${addDays(today, startDay)}","topic":"specific topic","tasks":["task1","task2"],"tip":"one short tip"}]

Use real dates starting from ${addDays(today, startDay)}. Each day must have exactly 2 tasks. Keep topic and tasks concise.`;

        const r2 = await callClaude(prompt2, sys, 800);
        const batch = safeJSON(r2, []);

        // If JSON parse failed, build fallback days
        if (!batch.length) {
          for (let i = 0; i < count; i++) {
            const dayNum = startDay + i;
            const topicIdx = Math.floor(((dayNum - 1) / days) * topicList.length);
            const isRevision = dayNum >= days - 1;
            allDays.push({
              day: dayNum,
              date: addDays(today, dayNum),
              topic: isRevision ? "Revision & Mock Test" : (batchTopics[i % batchTopics.length] || subject),
              tasks: isRevision ? ["Review all topics", "Practice past papers"] : ["Read and understand concepts", "Solve practice problems"],
              tip: isRevision ? "Focus on weak areas" : "Take short breaks every 45 mins",
            });
          }
        } else {
          // Normalize days in case Claude off-by-one
          batch.forEach((d, i) => {
            d.day = startDay + i;
            d.date = addDays(today, startDay + i);
            if (!d.tasks || !d.tasks.length) d.tasks = ["Study the topic", "Practice problems"];
          });
          allDays = allDays.concat(batch);
        }
      }

      const planData = {
        subject,
        examDate,
        totalDays: days,
        hoursPerDay: parseInt(hoursPerDay),
        overview: meta.overview || `Study ${subject} over ${days} days covering ${topicList.join(", ")}.`,
        phases: meta.phases || [{ phase: "Study Phase", days: `Day 1-${days}`, goal: `Cover all ${subject} topics` }],
        dailyPlan: allDays,
        examTips: meta.examTips || ["Review notes daily", "Practice past papers", "Sleep well before exam", "Stay hydrated", "Attempt all questions"],
      };

      setPlan(planData);
      localStorage.setItem("smai_plan", JSON.stringify(planData));
      setPlanError("");
    } catch(e) {
      setPlanError("Error: " + e.message);
    }
    setGenerating(false);
  };

  const clearPlan = () => { setPlan(null); localStorage.removeItem("smai_plan"); setSubject(""); setTopics(""); setExamDate(""); };

  const phaseColors = ["#7c3aed","#2563eb","#16a34a","#d97706","#dc2626","#0891b2"];

  // Mark a daily task done
  const [doneDays, setDoneDays] = useState(() => { try { return JSON.parse(localStorage.getItem("smai_done_days")||"[]"); } catch { return []; } });
  const toggleDay = (day) => {
    const u = doneDays.includes(day) ? doneDays.filter(d=>d!==day) : [...doneDays, day];
    setDoneDays(u); localStorage.setItem("smai_done_days", JSON.stringify(u));
  };

  const completedCount = plan ? doneDays.filter(d => plan.dailyPlan.some(p=>p.day===d)).length : 0;
  const progressPct = plan ? Math.round((completedCount / plan.dailyPlan.length) * 100) : 0;

  return (
    <div>
      <h2 style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827", margin:"0 0 6px" }}>AI Study Planner</h2>
      <p style={{ margin:"0 0 22px", fontSize:13, color:"#6b7280" }}>Enter your subject, topics and exam date — AI builds a personalised day-by-day plan</p>

      {/* Input form */}
      {!plan && (
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"24px 26px", marginBottom:22, boxShadow:"0 4px 20px rgba(0,0,0,0.04)" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14, marginBottom:14 }}>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, display:"block", marginBottom:6 }}>SUBJECT / EXAM NAME</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. Mathematics, Physics, History..." style={{ width:"100%", padding:"10px 13px", border:"1.5px solid #e5e7eb", borderRadius:10, fontSize:14, outline:"none", color:"#111827", boxSizing:"border-box" }} onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"} />
            </div>
            <div>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, display:"block", marginBottom:6 }}>EXAM DATE</label>
              <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)} min={today} style={{ width:"100%", padding:"10px 13px", border:"1.5px solid #e5e7eb", borderRadius:10, fontSize:14, outline:"none", color:"#374151", boxSizing:"border-box" }} onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"} />
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <label style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, display:"block", marginBottom:6 }}>TOPICS TO COVER</label>
            <textarea value={topics} onChange={e => setTopics(e.target.value)} placeholder="e.g. Algebra, Trigonometry, Calculus, Probability, Statistics, Coordinate Geometry..." rows={3} style={{ width:"100%", padding:"10px 13px", border:"1.5px solid #e5e7eb", borderRadius:10, fontSize:14, outline:"none", color:"#111827", resize:"vertical", fontFamily:"inherit", boxSizing:"border-box", lineHeight:1.6 }} onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"} />
            <p style={{ margin:"5px 0 0", fontSize:12, color:"#9ca3af" }}>Separate topics with commas. Be specific for better planning.</p>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, whiteSpace:"nowrap" }}>HOURS / DAY</label>
              <select value={hoursPerDay} onChange={e => setHoursPerDay(e.target.value)} style={{ padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:9, fontSize:13, color:"#374151", background:"#fff", cursor:"pointer", outline:"none" }}>
                {["1","2","3","4","5","6","8"].map(h => <option key={h} value={h}>{h} hour{h!=="1"?"s":""}</option>)}
              </select>
            </div>
            {examDate && daysLeft !== null && (
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ padding:"6px 14px", background: daysLeft <= 3 ? "#fef2f2" : daysLeft <= 7 ? "#fffbeb" : "#f0fdf4", border:`1px solid ${daysLeft<=3?"#fca5a5":daysLeft<=7?"#fcd34d":"#86efac"}`, borderRadius:20 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:daysLeft<=3?"#dc2626":daysLeft<=7?"#d97706":"#16a34a", fontFamily:"'DM Mono',monospace" }}>
                    {daysLeft === 0 ? "⚠ Exam is today!" : `📅 ${daysLeft} day${daysLeft!==1?"s":""} until exam`}
                  </span>
                </div>
              </div>
            )}
          </div>
          {planError && <div style={{ padding:"10px 14px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:9, fontSize:13, color:"#dc2626", marginBottom:14, fontFamily:"'DM Mono',monospace" }}>⚠ {planError}</div>}
          <button onClick={generatePlan} disabled={generating} style={{ padding:"11px 28px", background:generating?"#c4b5fd":"linear-gradient(135deg,#7c3aed,#4f46e5)", border:"none", borderRadius:11, color:"#fff", fontSize:14, fontWeight:700, cursor:generating?"default":"pointer", fontFamily:"'DM Mono',monospace", boxShadow:"0 4px 14px rgba(124,58,237,0.35)", display:"flex", alignItems:"center", gap:8 }}>
            {generating ? <><div style={{ width:16, height:16, borderRadius:"50%", border:"2px solid rgba(255,255,255,0.4)", borderTopColor:"#fff", animation:"spin 0.8s linear infinite" }}/><span>Generating your plan...</span></> : <><span>✦</span><span>Generate AI Study Plan</span></>}
          </button>
        </div>
      )}

      {/* Plan display */}
      {plan && (
        <div>
          {/* Plan header */}
          <div style={{ background:"linear-gradient(135deg,#7c3aed,#4f46e5)", borderRadius:18, padding:"22px 26px", marginBottom:20, color:"#fff" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:12 }}>
              <div>
                <div style={{ fontSize:11, fontWeight:600, opacity:0.7, fontFamily:"'DM Mono',monospace", letterSpacing:0.8, marginBottom:4 }}>AI STUDY PLAN</div>
                <div style={{ fontSize:22, fontWeight:800, fontFamily:"'DM Mono',monospace" }}>{plan.subject}</div>
                <div style={{ fontSize:13, opacity:0.8, marginTop:4 }}>Exam: {new Date(plan.examDate).toLocaleDateString("en-IN",{day:"numeric",month:"long",year:"numeric"})}</div>
              </div>
              <div style={{ textAlign:"right" }}>
                <div style={{ fontSize:32, fontWeight:900, fontFamily:"'DM Mono',monospace" }}>{plan.totalDays}</div>
                <div style={{ fontSize:12, opacity:0.7, fontFamily:"'DM Mono',monospace" }}>days · {plan.hoursPerDay}h/day</div>
              </div>
            </div>
            {/* Progress bar */}
            <div style={{ marginTop:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, opacity:0.8, fontFamily:"'DM Mono',monospace", marginBottom:6 }}>
                <span>Progress</span><span>{completedCount}/{plan.dailyPlan.length} days done · {progressPct}%</span>
              </div>
              <div style={{ width:"100%", height:8, background:"rgba(255,255,255,0.2)", borderRadius:99, overflow:"hidden" }}>
                <div style={{ height:"100%", background:"rgba(255,255,255,0.9)", borderRadius:99, width:`${progressPct}%`, transition:"width 0.5s" }} />
              </div>
            </div>
          </div>

          {/* Overview */}
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"16px 20px", marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#7c3aed", fontFamily:"'DM Mono',monospace", letterSpacing:0.8, marginBottom:8 }}>STRATEGY OVERVIEW</div>
            <p style={{ margin:0, fontSize:14, color:"#374151", lineHeight:1.7 }}>{plan.overview}</p>
          </div>

          {/* Phases */}
          {plan.phases && plan.phases.length > 0 && (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:10, marginBottom:16 }}>
              {plan.phases.map((ph, i) => (
                <div key={i} style={{ background:"#fff", border:`1.5px solid ${phaseColors[i%phaseColors.length]}33`, borderRadius:12, padding:"12px 14px", borderLeft:`4px solid ${phaseColors[i%phaseColors.length]}` }}>
                  <div style={{ fontSize:11, fontWeight:700, color:phaseColors[i%phaseColors.length], fontFamily:"'DM Mono',monospace", marginBottom:4 }}>{ph.days}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:"#111827", marginBottom:3 }}>{ph.phase}</div>
                  <div style={{ fontSize:12, color:"#6b7280", lineHeight:1.5 }}>{ph.goal}</div>
                </div>
              ))}
            </div>
          )}

          {/* Daily plan */}
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:16, padding:"18px 20px", marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.8, marginBottom:14 }}>DAY-BY-DAY SCHEDULE</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {plan.dailyPlan.map((d, i) => {
                const isDone = doneDays.includes(d.day);
                const isToday = d.date === today;
                const isPast = d.date < today;
                return (
                  <div key={i} style={{ border:`1.5px solid ${isToday?"#7c3aed":isDone?"#86efac":isPast?"#f3f4f6":"#e5e7eb"}`, borderRadius:12, padding:"14px 16px", background:isToday?"#fdf4ff":isDone?"#f0fdf4":isPast?"#fafafa":"#fff", opacity:isPast&&!isDone?0.7:1, transition:"all 0.2s" }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
                      <input type="checkbox" checked={isDone} onChange={() => toggleDay(d.day)} style={{ width:18, height:18, accentColor:"#7c3aed", cursor:"pointer", flexShrink:0, marginTop:2 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:6 }}>
                          <span style={{ fontSize:11, fontWeight:700, color:isToday?"#7c3aed":isDone?"#16a34a":"#9ca3af", fontFamily:"'DM Mono',monospace", background:isToday?"#ede9fe":isDone?"#dcfce7":"#f3f4f6", padding:"2px 8px", borderRadius:20 }}>
                            {isToday?"TODAY ·":""} Day {d.day}
                          </span>
                          <span style={{ fontSize:12, color:"#6b7280", fontFamily:"'DM Mono',monospace" }}>{d.date ? new Date(d.date+"T00:00:00").toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"}) : ""}</span>
                          <span style={{ fontSize:11, color:"#9ca3af", marginLeft:"auto", fontFamily:"'DM Mono',monospace" }}>{d.hours}h</span>
                        </div>
                        <div style={{ fontSize:14, fontWeight:700, color:isDone?"#16a34a":"#111827", marginBottom:6, textDecoration:isDone?"line-through":"none" }}>{d.topic}</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:d.tip?8:0 }}>
                          {(d.tasks||[]).map((task, ti) => (
                            <div key={ti} style={{ display:"flex", alignItems:"flex-start", gap:6 }}>
                              <span style={{ color:"#7c3aed", fontSize:12, flexShrink:0, marginTop:2 }}>›</span>
                              <span style={{ fontSize:13, color:isDone?"#9ca3af":"#374151", lineHeight:1.5, textDecoration:isDone?"line-through":"none" }}>{task}</span>
                            </div>
                          ))}
                        </div>
                        {d.tip && <div style={{ fontSize:12, color:"#d97706", background:"#fffbeb", border:"1px solid #fcd34d", borderRadius:7, padding:"5px 10px", display:"inline-block" }}>💡 {d.tip}</div>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Exam tips */}
          {plan.examTips && plan.examTips.length > 0 && (
            <div style={{ background:"linear-gradient(135deg,#eff6ff,#fdf4ff)", border:"1px solid #bfdbfe", borderRadius:14, padding:"16px 20px", marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:"#2563eb", fontFamily:"'DM Mono',monospace", letterSpacing:0.8, marginBottom:10 }}>EXAM TIPS FROM AI</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {plan.examTips.map((tip, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                    <div style={{ width:22, height:22, borderRadius:"50%", background:"#2563eb", color:"#fff", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{i+1}</div>
                    <span style={{ fontSize:13, color:"#374151", lineHeight:1.6, paddingTop:2 }}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
            <button onClick={clearPlan} style={{ padding:"9px 18px", background:"#fef2f2", border:"1px solid #fca5a5", borderRadius:10, color:"#dc2626", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>✕ Clear Plan</button>
            <button onClick={generatePlan} disabled={generating} style={{ padding:"9px 18px", background:"#ede9fe", border:"1px solid #c4b5fd", borderRadius:10, color:"#7c3aed", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'DM Mono',monospace" }}>↺ Regenerate</button>
          </div>
        </div>
      )}

      {/* Manual tasks section */}
      <div style={{ marginTop:28 }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.8, marginBottom:12 }}>QUICK TASKS (manual)</div>
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"14px 16px", marginBottom:12 }}>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            <input value={taskInput} onChange={e => setTaskInput(e.target.value)} onKeyDown={e => e.key==="Enter"&&addTask()} placeholder="Add a quick task..." style={{ flex:1, minWidth:160, padding:"8px 12px", border:"1.5px solid #e5e7eb", borderRadius:9, fontSize:14, outline:"none", color:"#111827" }} onFocus={e => e.target.style.borderColor="#7c3aed"} onBlur={e => e.target.style.borderColor="#e5e7eb"} />
            <input type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} style={{ padding:"8px 10px", border:"1.5px solid #e5e7eb", borderRadius:9, fontSize:13, outline:"none", color:"#374151" }}/>
            <button onClick={addTask} style={{ padding:"8px 14px", background:"#7c3aed", border:"none", borderRadius:9, color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer" }}>Add</button>
          </div>
        </div>
        {tasks.length > 0 && (
          <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:12, padding:"12px 16px" }}>
            {tasks.map(t => (
              <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #f3f4f6" }}>
                <input type="checkbox" checked={t.done} onChange={() => toggleTask(t.id)} style={{ width:16, height:16, accentColor:"#7c3aed", cursor:"pointer", flexShrink:0 }}/>
                <span style={{ flex:1, fontSize:14, color:t.done?"#9ca3af":"#111827", textDecoration:t.done?"line-through":"none" }}>{t.text}</span>
                {t.due && <span style={{ fontSize:11, color:"#9ca3af", fontFamily:"'DM Mono',monospace" }}>{t.due}</span>}
                <button onClick={() => delTask(t.id)} style={{ background:"none", border:"none", color:"#d1d5db", cursor:"pointer", fontSize:15 }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


export default PlannerPage;
