import { useState, useRef, useEffect, useCallback, useContext } from "react";
import { AppContext, useApp } from "../context/AppContext";
import { callAI, callClaude, summarizeLargeText } from "../utils/ai";
import { LANG_CONFIG, nowStr, safeJSON, stripMd, wc } from "../utils/helpers";

// ─── SETTINGS PAGE ────────────────────────────────────────────────────────────
function SettingsPage() {
  const { settings, setSettings } = useApp();
  const [testStatus, setTestStatus] = useState("");
  const [testing, setTesting] = useState(false);
  const [showKeys, setShowKeys] = useState({});
  const fonts = ["System UI", "Georgia", "Courier New", "Verdana", "Trebuchet MS"];
  const accents = [{ name:"Purple", value:"#7c3aed" },{ name:"Blue", value:"#2563eb" },{ name:"Green", value:"#16a34a" },{ name:"Pink", value:"#db2777" },{ name:"Orange", value:"#ea580c" }];

  const testConnection = async () => {
    setTesting(true); setTestStatus("");
    try {
      const result = await callAI("Reply with exactly: OK", "Reply with exactly: OK", 20);
      setTestStatus(result.length > 0 ? "success" : "fail");
    } catch(e) { setTestStatus("error:" + e.message); }
    setTesting(false);
  };

  const toggleShow = (id) => setShowKeys(k => ({...k, [id]: !k[id]}));

  const PROVIDERS = [
    { id:"claude",  label:"Claude",   icon:"⚡", color:"#d97706", bg:"#fffbeb", border:"#fcd34d", sublabel:"Anthropic · Best quality",    free:false },
    { id:"groq",    label:"Groq",     icon:"🆓", color:"#16a34a", bg:"#f0fdf4", border:"#86efac", sublabel:"Free daily reset · Llama 3",   free:true  },
    { id:"openai",  label:"ChatGPT",  icon:"🤖", color:"#0891b2", bg:"#ecfeff", border:"#67e8f9", sublabel:"OpenAI · GPT-4o",              free:false },
    { id:"gemini",  label:"Gemini",   icon:"💎", color:"#7c3aed", bg:"#fdf4ff", border:"#d8b4fe", sublabel:"Google · Free tier available", free:true  },
  ];

  const KEY_CONFIG = {
    claude:  { field:"claudeKey",  placeholder:"sk-ant-api03-...",  hint:"console.anthropic.com → API Keys",           link:"https://console.anthropic.com/settings/keys",  linkLabel:"Get key →" },
    groq:    { field:"groqKey",    placeholder:"gsk_...",            hint:"Free · No credit card · Daily renewal",      link:"https://console.groq.com/keys",                linkLabel:"Get free key →" },
    openai:  { field:"openaiKey",  placeholder:"sk-proj-...",        hint:"platform.openai.com → API Keys",             link:"https://platform.openai.com/api-keys",          linkLabel:"Get key →" },
    gemini:  { field:"geminiKey",  placeholder:"AIza...",            hint:"aistudio.google.com → Get API Key (free)",   link:"https://aistudio.google.com/app/apikey",        linkLabel:"Get free key →" },
  };

  const MODEL_CONFIG = {
    groq:   { field:"groqModel",   models:[
      { id:"llama-3.3-70b-versatile", label:"Llama 3.3 70B", sub:"Best quality · Recommended", badge:"⭐" },
      { id:"llama-3.1-8b-instant",    label:"Llama 3.1 8B",  sub:"Fastest · Great for quizzes", badge:"⚡" },
      { id:"mixtral-8x7b-32768",      label:"Mixtral 8x7B",  sub:"Long context · Detailed",     badge:"📄" },
    ]},
    openai: { field:"openaiModel", models:[
      { id:"gpt-4o-mini", label:"GPT-4o Mini", sub:"Fast · Affordable · Recommended", badge:"⭐" },
      { id:"gpt-4o",      label:"GPT-4o",      sub:"Most capable OpenAI model",       badge:"💪" },
      { id:"gpt-3.5-turbo", label:"GPT-3.5 Turbo", sub:"Fastest · Lowest cost",       badge:"⚡" },
    ]},
    gemini: { field:"geminiModel", models:[
      { id:"gemini-1.5-flash",   label:"Gemini 1.5 Flash", sub:"Free tier · Fast · Recommended", badge:"⭐" },
      { id:"gemini-2.0-flash",   label:"Gemini 2.0 Flash", sub:"Latest · Very fast",              badge:"🆕" },
      { id:"gemini-1.5-pro",     label:"Gemini 1.5 Pro",   sub:"Most capable Gemini",             badge:"💪" },
    ]},
  };

  const activeProvider = settings.provider || "claude";
  const kc = KEY_CONFIG[activeProvider];
  const activeKey = settings[kc?.field] || "";
  const mc = MODEL_CONFIG[activeProvider];
  const providerColor = PROVIDERS.find(p=>p.id===activeProvider)?.color || "#7c3aed";

  return (
    <div>
      <h2 style={{ fontFamily:"'DM Mono',monospace", fontSize:20, fontWeight:700, color:"#111827", margin:"0 0 22px" }}>Settings</h2>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

        {/* ── AI Provider ─────────────────────────────────────────────────── */}
        <div style={{ background:"#fff", border:"2px solid #7c3aed22", borderRadius:18, padding:"22px 24px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:18 }}>
            <span style={{ fontSize:20 }}>🤖</span>
            <div>
              <div style={{ fontSize:14, fontWeight:700, color:"#111827", fontFamily:"'DM Mono',monospace" }}>AI Provider</div>
              <div style={{ fontSize:12, color:"#6b7280" }}>Choose your AI engine — all use your own API key</div>
            </div>
          </div>

          {/* 4 provider cards */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:10, marginBottom:22 }}>
            {PROVIDERS.map(p => (
              <div key={p.id} onClick={() => setSettings(s => ({...s, provider:p.id}))} style={{
                padding:"14px 16px", borderRadius:14,
                border:`2px solid ${settings.provider===p.id ? p.border : "#e5e7eb"}`,
                background:settings.provider===p.id ? p.bg : "#f9fafb",
                cursor:"pointer", transition:"all 0.18s", position:"relative",
              }}>
                {settings.provider===p.id && (
                  <div style={{ position:"absolute", top:8, right:8, fontSize:9, fontWeight:700, color:p.color, background:`${p.border}88`, padding:"2px 7px", borderRadius:20, fontFamily:"'DM Mono',monospace" }}>ACTIVE</div>
                )}
                <div style={{ fontSize:26, marginBottom:8 }}>{p.icon}</div>
                <div style={{ fontSize:13, fontWeight:700, color:settings.provider===p.id ? p.color : "#374151", fontFamily:"'DM Mono',monospace", marginBottom:3 }}>{p.label}</div>
                <div style={{ fontSize:11, color:"#6b7280", lineHeight:1.4 }}>{p.sublabel}</div>
                {p.free && <div style={{ marginTop:6, fontSize:10, fontWeight:700, color:"#16a34a", fontFamily:"'DM Mono',monospace" }}>FREE TIER ✓</div>}
              </div>
            ))}
          </div>

          {/* Active provider key input */}
          {kc && (
            <div style={{ background:"#f9fafb", borderRadius:12, padding:"16px 18px", marginBottom:16, border:"1px solid #f3f4f6" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
                <label style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5 }}>
                  {activeProvider.toUpperCase()} API KEY
                </label>
                <a href={kc.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:11, color:providerColor, fontFamily:"'DM Mono',monospace", fontWeight:700, textDecoration:"none" }}>
                  {kc.linkLabel}
                </a>
              </div>
              <div style={{ position:"relative", marginBottom:8 }}>
                <input
                  type={showKeys[activeProvider] ? "text" : "password"}
                  value={activeKey}
                  onChange={e => setSettings(s => ({...s, [kc.field]: e.target.value}))}
                  placeholder={kc.placeholder}
                  style={{ width:"100%", padding:"10px 42px 10px 13px", border:`1.5px solid ${activeKey?"#d1d5db":"#e5e7eb"}`, borderRadius:10, fontSize:13, outline:"none", color:"#111827", fontFamily:"'DM Mono',monospace", boxSizing:"border-box", background:"#fff", transition:"border 0.15s" }}
                  onFocus={e => e.target.style.borderColor=providerColor}
                  onBlur={e => e.target.style.borderColor=activeKey?"#d1d5db":"#e5e7eb"}
                />
                <button onClick={() => toggleShow(activeProvider)} style={{ position:"absolute", right:11, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:15, color:"#9ca3af", lineHeight:1 }}>
                  {showKeys[activeProvider] ? "🙈" : "👁"}
                </button>
              </div>
              <p style={{ margin:0, fontSize:11, color:"#9ca3af", lineHeight:1.6 }}>{kc.hint}</p>
            </div>
          )}

          {/* Model selector for providers that have a choice */}
          {mc && (
            <div style={{ marginBottom:18 }}>
              <label style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, display:"block", marginBottom:10 }}>
                {activeProvider.toUpperCase()} MODEL
              </label>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {mc.models.map(m => {
                  const active = settings[mc.field] === m.id;
                  return (
                    <div key={m.id} onClick={() => setSettings(s => ({...s, [mc.field]: m.id}))} style={{
                      display:"flex", alignItems:"center", gap:12, padding:"11px 14px",
                      borderRadius:10, border:`1.5px solid ${active ? "#d8b4fe" : "#e5e7eb"}`,
                      background:active ? "#fdf4ff" : "#f9fafb", cursor:"pointer", transition:"all 0.15s",
                    }}>
                      <div style={{ width:17, height:17, borderRadius:"50%", border:`2px solid ${active ? providerColor : "#d1d5db"}`, background:active ? providerColor : "transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {active && <div style={{ width:6, height:6, borderRadius:"50%", background:"#fff" }} />}
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:"#111827", fontFamily:"'DM Mono',monospace" }}>{m.label}</div>
                        <div style={{ fontSize:11, color:"#6b7280" }}>{m.sub}</div>
                      </div>
                      <span style={{ fontSize:13 }}>{m.badge}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All keys saved status */}
          <div style={{ background:"#f3f4f6", borderRadius:10, padding:"12px 14px", marginBottom:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", letterSpacing:0.5, marginBottom:8 }}>SAVED API KEYS</div>
            <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
              {PROVIDERS.map(p => {
                const kf = KEY_CONFIG[p.id]?.field;
                const hasKey = !!(settings[kf]);
                return (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:5, padding:"4px 10px", borderRadius:20, background:hasKey?"#dcfce7":"#f3f4f6", border:`1px solid ${hasKey?"#86efac":"#d1d5db"}` }}>
                    <span style={{ fontSize:12 }}>{p.icon}</span>
                    <span style={{ fontSize:11, fontFamily:"'DM Mono',monospace", fontWeight:600, color:hasKey?"#16a34a":"#9ca3af" }}>{p.label}</span>
                    <span style={{ fontSize:11 }}>{hasKey ? "✓" : "—"}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Test connection */}
          <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
            <button onClick={testConnection} disabled={testing || !activeKey} style={{
              padding:"10px 22px", border:"none", borderRadius:10,
              background:testing||!activeKey?"#f3f4f6":providerColor,
              color:testing||!activeKey?"#9ca3af":"#fff",
              fontSize:13, fontWeight:700, cursor:testing||!activeKey?"default":"pointer",
              fontFamily:"'DM Mono',monospace", display:"flex", alignItems:"center", gap:8, transition:"all 0.15s",
            }}>
              {testing
                ? <><div style={{ width:14,height:14,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.4)",borderTopColor:"#fff",animation:"spin 0.8s linear infinite" }}/> Testing...</>
                : <><span>⚡</span> Test Connection</>}
            </button>
            {testStatus === "success" && <span style={{ fontSize:13, color:"#16a34a", fontWeight:700, fontFamily:"'DM Mono',monospace" }}>✓ Connected! Key is working.</span>}
            {testStatus === "fail"    && <span style={{ fontSize:13, color:"#d97706", fontWeight:600, fontFamily:"'DM Mono',monospace" }}>⚠ Unexpected response format.</span>}
            {testStatus.startsWith("error") && <span style={{ fontSize:12, color:"#dc2626", fontFamily:"'DM Mono',monospace", maxWidth:300 }}>✗ {testStatus.replace("error:","")}</span>}
          </div>
        </div>

        {/* ── Appearance ──────────────────────────────────────────────────── */}
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px 22px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", marginBottom:12, letterSpacing:0.5 }}>THEME</div>
          <div style={{ display:"flex", gap:8 }}>
            {[["light","☀️ Light"],["dark","🌙 Dark"]].map(([t,l]) => <button key={t} onClick={() => setSettings(s => ({...s,theme:t}))} style={{ padding:"8px 16px", borderRadius:9, border:"1px solid #e5e7eb", background:settings.theme===t?"#7c3aed":"#f3f4f6", color:settings.theme===t?"#fff":"#374151", fontSize:13, cursor:"pointer", fontFamily:"'DM Mono',monospace", fontWeight:600 }}>{l}</button>)}
          </div>
        </div>
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px 22px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", marginBottom:12, letterSpacing:0.5 }}>ACCENT COLOR</div>
          <div style={{ display:"flex", gap:10 }}>
            {accents.map(a => <button key={a.value} onClick={() => setSettings(s => ({...s,accent:a.value}))} title={a.name} style={{ width:32, height:32, borderRadius:"50%", background:a.value, border:settings.accent===a.value?"3px solid #111827":"2px solid transparent", cursor:"pointer", outline:"none" }} />)}
          </div>
        </div>
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px 22px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", marginBottom:12, letterSpacing:0.5 }}>FONT</div>
          <select value={settings.font||"System UI"} onChange={e => setSettings(s => ({...s,font:e.target.value}))} style={{ padding:"8px 14px", borderRadius:9, border:"1.5px solid #e5e7eb", fontSize:14, color:"#374151", background:"#fff", cursor:"pointer", outline:"none", fontFamily:settings.font }}>
            {fonts.map(f => <option key={f} style={{ fontFamily:f }}>{f}</option>)}
          </select>
          <p style={{ margin:"10px 0 0", fontSize:14, color:"#6b7280", fontFamily:settings.font||"inherit" }}>The quick brown fox jumps over the lazy dog.</p>
        </div>
        <div style={{ background:"#fff", border:"1px solid #e5e7eb", borderRadius:14, padding:"18px 22px" }}>
          <div style={{ fontSize:12, fontWeight:700, color:"#374151", fontFamily:"'DM Mono',monospace", marginBottom:12, letterSpacing:0.5 }}>SPEECH RATE</div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <input type="range" min={0.5} max={1.5} step={0.1} value={settings.speechRate||0.92} onChange={e => setSettings(s => ({...s,speechRate:parseFloat(e.target.value)}))} style={{ flex:1 }}/>
            <span style={{ fontSize:13, fontFamily:"'DM Mono',monospace", color:"#374151", minWidth:32 }}>{(settings.speechRate||0.92).toFixed(1)}x</span>
          </div>
        </div>
      </div>
    </div>
  );
}


export default SettingsPage;
