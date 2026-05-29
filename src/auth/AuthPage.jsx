import { useState, useRef, useEffect, useCallback, createContext, useContext, useMemo } from "react";

// ─── AUTH PAGES ───────────────────────────────────────────────────────────────

function useAuth() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("smai_user") || "null"); } catch { return null; }
  });

  const login = (userData) => {
    localStorage.setItem("smai_user", JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem("smai_user");
    setUser(null);
  };

  return { user, login, logout };
}

function FloatingParticles() {
  const canvasRef = useRef();
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let W = canvas.width = window.innerWidth;
    let H = canvas.height = window.innerHeight;
    const particles = Array.from({ length: 70 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 2.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.6, vy: -(Math.random() * 0.5 + 0.2),
      alpha: Math.random() * 0.5 + 0.1,
      color: ["#c084fc","#818cf8","#38bdf8","#f472b6","#fb923c"][Math.floor(Math.random()*5)],
      pulse: Math.random() * Math.PI * 2,
    }));
    let raf;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.pulse += 0.03;
        if (p.y < -5) { p.y = H + 5; p.x = Math.random() * W; }
        if (p.x < -5) p.x = W + 5; if (p.x > W + 5) p.x = -5;
        ctx.save(); ctx.globalAlpha = p.alpha * (0.6 + Math.sin(p.pulse) * 0.4);
        ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
      raf = requestAnimationFrame(draw);
    };
    draw();
    const resize = () => { W = canvas.width = window.innerWidth; H = canvas.height = window.innerHeight; };
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:0 }} />;
}

function AuthPage({ onLogin }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [form, setForm] = useState({ name:"", email:"", password:"", confirm:"" });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setTimeout(() => setMounted(true), 50); }, []);
  useEffect(() => { setErrors({}); setForm({ name:"", email:"", password:"", confirm:"" }); }, [mode]);

  const validate = () => {
    const e = {};
    if (mode === "signup" && !form.name.trim()) e.name = "Name is required";
    if (!form.email.trim()) e.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Enter a valid email";
    if (!form.password) e.password = "Password is required";
    else if (form.password.length < 6) e.password = "Min 6 characters";
    if (mode === "signup" && form.password !== form.confirm) e.confirm = "Passwords don't match";
    return e;
  };

  const handleSubmit = async () => {
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setLoading(true);
    await new Promise(r => setTimeout(r, 1200)); // simulate auth
    if (mode === "login") {
      // Check stored user
      try {
        const stored = JSON.parse(localStorage.getItem("smai_accounts") || "{}");
        const acc = stored[form.email.toLowerCase()];
        if (!acc) { setErrors({ email: "No account found. Sign up first!" }); setLoading(false); return; }
        if (acc.password !== form.password) { setErrors({ password: "Wrong password" }); setLoading(false); return; }
        onLogin({ name: acc.name, email: form.email.toLowerCase(), avatar: acc.avatar });
      } catch { setErrors({ email: "Something went wrong. Try again." }); }
    } else {
      // Register
      try {
        const stored = JSON.parse(localStorage.getItem("smai_accounts") || "{}");
        if (stored[form.email.toLowerCase()]) { setErrors({ email: "Account already exists. Log in!" }); setLoading(false); return; }
        const initials = form.name.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2);
        const colors = ["#7c3aed","#0ea5e9","#ec4899","#f97316","#10b981","#f59e0b"];
        const avatar = { initials, color: colors[Math.floor(Math.random()*colors.length)] };
        stored[form.email.toLowerCase()] = { name: form.name.trim(), password: form.password, avatar };
        localStorage.setItem("smai_accounts", JSON.stringify(stored));
        onLogin({ name: form.name.trim(), email: form.email.toLowerCase(), avatar });
      } catch { setErrors({ email: "Something went wrong. Try again." }); }
    }
    setLoading(false);
  };

  const set = (k, v) => { setForm(f => ({...f, [k]:v})); setErrors(e => ({...e, [k]:""})); };

  const inputStyle = (field) => ({
    width:"100%", padding:"13px 16px", borderRadius:12,
    border:`1.5px solid ${errors[field] ? "#ef4444" : "rgba(139,92,246,0.2)"}`,
    background:"rgba(255,255,255,0.07)", color:"#fff",
    fontSize:14, fontFamily:"inherit", outline:"none",
    transition:"border-color 0.2s, box-shadow 0.2s",
    boxSizing:"border-box",
  });

  const FEATURES = [
    { icon:"🧠", text:"AI-powered study tools" },
    { icon:"🎬", text:"Cinematic study reels" },
    { icon:"⚡", text:"Instant quiz & flashcards" },
    { icon:"🗺️", text:"Visual mind maps" },
    { icon:"🏆", text:"XP & level system" },
    { icon:"🌍", text:"Multilingual support" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0a0015 0%,#0d0030 40%,#1a0040 70%,#0a0025 100%)", display:"flex", position:"relative", overflow:"hidden" }}>
      <FloatingParticles />

      {/* Mesh orbs */}
      {[
        { top:"10%", left:"5%", size:350, color:"#7c3aed" },
        { top:"60%", right:"5%", size:300, color:"#ec4899" },
        { top:"30%", left:"55%", size:200, color:"#0ea5e9" },
      ].map((o,i) => (
        <div key={i} style={{ position:"fixed", top:o.top, left:o.left, right:o.right, width:o.size, height:o.size, borderRadius:"50%", background:`radial-gradient(circle, ${o.color}22 0%, transparent 70%)`, filter:"blur(40px)", pointerEvents:"none", zIndex:0, animation:`float${i} ${6+i*2}s ease-in-out infinite` }}/>
      ))}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600;700&family=Sora:wght@400;600;700;800&display=swap');
        @keyframes authSlideUp { from { opacity:0; transform:translateY(32px) scale(0.97); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes authFadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes float0 { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-30px) scale(1.05)} }
        @keyframes float1 { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(25px) scale(0.95)} }
        @keyframes float2 { 0%,100%{transform:translateY(0) scale(1)} 50%{transform:translateY(-20px) scale(1.08)} }
        @keyframes spin { to { transform:rotate(360deg); } }
        @keyframes shimmer { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes logoPulse { 0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0.4)} 50%{box-shadow:0 0 0 16px rgba(124,58,237,0)} }
        .auth-input:focus { border-color: rgba(139,92,246,0.7) !important; box-shadow: 0 0 0 3px rgba(139,92,246,0.15) !important; }
        .auth-input::placeholder { color: rgba(255,255,255,0.3); }
        .feature-chip:hover { background: rgba(139,92,246,0.15) !important; transform: translateX(4px); }
      `}</style>

      {/* Left panel — branding */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", justifyContent:"center", padding:"60px 56px", position:"relative", zIndex:1, animation: mounted ? "authFadeIn 0.8s ease" : "none", opacity: mounted ? 1 : 0 }}>
        {/* Logo */}
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:52 }}>
          <div style={{ width:52, height:52, borderRadius:16, background:"linear-gradient(135deg,#7c3aed,#ec4899)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:26, animation:"logoPulse 3s infinite", flexShrink:0 }}>S</div>
          <div>
            <div style={{ fontSize:22, fontWeight:800, color:"#fff", fontFamily:"'Sora',sans-serif", letterSpacing:-0.5 }}>Study Mate AI</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.45)", fontFamily:"'DM Mono',monospace" }}>Study smarter ✨</div>
          </div>
        </div>

        {/* Headline */}
        <h1 style={{ fontSize:48, fontWeight:800, color:"#fff", fontFamily:"'Sora',sans-serif", lineHeight:1.15, margin:"0 0 16px", letterSpacing:-1.5 }}>
          Learn faster.<br/>
          <span style={{ background:"linear-gradient(90deg,#c084fc,#f472b6,#fb923c)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text", backgroundSize:"200%", animation:"shimmer 3s linear infinite" }}>
            Score higher.
          </span>
        </h1>
        <p style={{ fontSize:16, color:"rgba(255,255,255,0.55)", fontFamily:"'Sora',sans-serif", lineHeight:1.7, margin:"0 0 44px", maxWidth:420 }}>
          Your AI-powered study companion — from notes to knowledge in minutes.
        </p>

        {/* Feature chips */}
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {FEATURES.map((f,i) => (
            <div key={i} className="feature-chip" style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 16px", borderRadius:12, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.08)", cursor:"default", transition:"all 0.22s", width:"fit-content" }}>
              <span style={{ fontSize:18 }}>{f.icon}</span>
              <span style={{ fontSize:13, color:"rgba(255,255,255,0.7)", fontFamily:"'Sora',sans-serif", fontWeight:500 }}>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Floating student avatars */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginTop:44 }}>
          <div style={{ display:"flex" }}>
            {["#7c3aed","#ec4899","#f97316","#0ea5e9"].map((c,i) => (
              <div key={i} style={{ width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg,${c},${c}88)`, border:"2px solid rgba(255,255,255,0.2)", marginLeft: i>0?-10:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff" }}>
                {["A","B","C","D"][i]}
              </div>
            ))}
          </div>
          <span style={{ fontSize:13, color:"rgba(255,255,255,0.45)", fontFamily:"'DM Mono',monospace" }}>10,000+ students learning daily</span>
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{ width:480, display:"flex", alignItems:"center", justifyContent:"center", padding:"40px 48px", position:"relative", zIndex:1 }}>
        <div style={{ width:"100%", animation: mounted ? "authSlideUp 0.6s cubic-bezier(0.34,1.56,0.64,1)" : "none", opacity: mounted ? 1 : 0 }}>

          {/* Card */}
          <div style={{ background:"rgba(255,255,255,0.05)", backdropFilter:"blur(24px)", borderRadius:28, padding:"40px 36px", border:"1px solid rgba(255,255,255,0.1)", boxShadow:"0 32px 80px rgba(0,0,0,0.5)" }}>

            {/* Mode toggle */}
            <div style={{ display:"flex", background:"rgba(255,255,255,0.07)", borderRadius:14, padding:4, marginBottom:32 }}>
              {["login","signup"].map(m => (
                <button key={m} onClick={() => setMode(m)} style={{ flex:1, padding:"10px", borderRadius:11, border:"none", background: mode===m ? "linear-gradient(135deg,#7c3aed,#6d28d9)" : "transparent", color: mode===m ? "#fff" : "rgba(255,255,255,0.45)", fontSize:13, fontWeight:700, cursor:"pointer", fontFamily:"'Sora',sans-serif", transition:"all 0.25s", boxShadow: mode===m ? "0 4px 14px rgba(124,58,237,0.4)" : "none" }}>
                  {m === "login" ? "Sign In" : "Create Account"}
                </button>
              ))}
            </div>

            {/* Greeting */}
            <div style={{ marginBottom:28 }}>
              <h2 style={{ margin:"0 0 4px", fontSize:24, fontWeight:800, color:"#fff", fontFamily:"'Sora',sans-serif" }}>
                {mode === "login" ? "Welcome back! 👋" : "Join Study Mate AI 🚀"}
              </h2>
              <p style={{ margin:0, fontSize:13, color:"rgba(255,255,255,0.4)", fontFamily:"'DM Mono',monospace" }}>
                {mode === "login" ? "Sign in to continue your learning journey" : "Create your free account — takes 30 seconds"}
              </p>
            </div>

            {/* Fields */}
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {mode === "signup" && (
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.5)", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:6, letterSpacing:0.5 }}>FULL NAME</label>
                  <input className="auth-input" style={inputStyle("name")} placeholder="Your name" value={form.name} onChange={e => set("name", e.target.value)} onKeyDown={e => e.key==="Enter" && handleSubmit()} />
                  {errors.name && <div style={{ fontSize:11, color:"#f87171", marginTop:4, fontFamily:"'DM Mono',monospace" }}>⚠ {errors.name}</div>}
                </div>
              )}

              <div>
                <label style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.5)", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:6, letterSpacing:0.5 }}>EMAIL</label>
                <input className="auth-input" style={inputStyle("email")} type="email" placeholder="you@example.com" value={form.email} onChange={e => set("email", e.target.value)} onKeyDown={e => e.key==="Enter" && handleSubmit()} />
                {errors.email && <div style={{ fontSize:11, color:"#f87171", marginTop:4, fontFamily:"'DM Mono',monospace" }}>⚠ {errors.email}</div>}
              </div>

              <div>
                <label style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.5)", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:6, letterSpacing:0.5 }}>PASSWORD</label>
                <div style={{ position:"relative" }}>
                  <input className="auth-input" style={{...inputStyle("password"), paddingRight:48}} type={showPass?"text":"password"} placeholder="Min 6 characters" value={form.password} onChange={e => set("password", e.target.value)} onKeyDown={e => e.key==="Enter" && handleSubmit()} />
                  <button onClick={() => setShowPass(s=>!s)} style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:16, padding:0 }}>{showPass ? "🙈" : "👁"}</button>
                </div>
                {errors.password && <div style={{ fontSize:11, color:"#f87171", marginTop:4, fontFamily:"'DM Mono',monospace" }}>⚠ {errors.password}</div>}
              </div>

              {mode === "signup" && (
                <div>
                  <label style={{ fontSize:11, fontWeight:600, color:"rgba(255,255,255,0.5)", fontFamily:"'DM Mono',monospace", display:"block", marginBottom:6, letterSpacing:0.5 }}>CONFIRM PASSWORD</label>
                  <input className="auth-input" style={inputStyle("confirm")} type={showPass?"text":"password"} placeholder="Repeat password" value={form.confirm} onChange={e => set("confirm", e.target.value)} onKeyDown={e => e.key==="Enter" && handleSubmit()} />
                  {errors.confirm && <div style={{ fontSize:11, color:"#f87171", marginTop:4, fontFamily:"'DM Mono',monospace" }}>⚠ {errors.confirm}</div>}
                </div>
              )}
            </div>

            {/* Submit */}
            <button onClick={handleSubmit} disabled={loading} style={{ width:"100%", marginTop:24, padding:"14px", borderRadius:14, border:"none", background: loading ? "rgba(124,58,237,0.5)" : "linear-gradient(135deg,#7c3aed,#ec4899)", color:"#fff", fontSize:15, fontWeight:700, cursor: loading ? "not-allowed" : "pointer", fontFamily:"'Sora',sans-serif", boxShadow: loading ? "none" : "0 6px 24px rgba(124,58,237,0.5)", transition:"all 0.25s", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
              {loading
                ? <><div style={{ width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 0.8s linear infinite" }}/>{mode==="login"?"Signing in...":"Creating account..."}</>
                : mode === "login" ? "Sign In →" : "Create My Account →"
              }
            </button>

            {/* Divider */}
            <div style={{ display:"flex", alignItems:"center", gap:12, margin:"22px 0" }}>
              <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.1)" }}/>
              <span style={{ fontSize:11, color:"rgba(255,255,255,0.3)", fontFamily:"'DM Mono',monospace" }}>or continue as</span>
              <div style={{ flex:1, height:1, background:"rgba(255,255,255,0.1)" }}/>
            </div>

            {/* Guest */}
            <button onClick={() => onLogin({ name:"Guest", email:"guest@smai.app", avatar:{ initials:"G", color:"#6b7280" }, isGuest:true })} style={{ width:"100%", padding:"12px", borderRadius:14, border:"1.5px solid rgba(255,255,255,0.12)", background:"rgba(255,255,255,0.04)", color:"rgba(255,255,255,0.6)", fontSize:13, fontWeight:600, cursor:"pointer", fontFamily:"'Sora',sans-serif", transition:"all 0.2s" }}>
              👤 Continue as Guest
            </button>

            <p style={{ textAlign:"center", fontSize:11, color:"rgba(255,255,255,0.25)", fontFamily:"'DM Mono',monospace", margin:"18px 0 0" }}>
              Your data stays on your device · No server required
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}


export default AuthPage;
