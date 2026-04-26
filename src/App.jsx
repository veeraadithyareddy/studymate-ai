import { useState, useEffect, useCallback } from "react";

import { AppContext } from "./context/AppContext";
import { nowStr } from "./utils/helpers";
import Toast   from "./components/Toast";
import Sidebar from "./components/Sidebar";
import AuthPage from "./auth/AuthPage";

import HomePage            from "./pages/HomePage";
import DashboardPage       from "./pages/DashboardPage";
import MindMapPage         from "./pages/MindMapPage";
import VivaPage            from "./pages/VivaPage";
import AdaptivePage        from "./pages/AdaptivePage";
import TeacherPage         from "./pages/TeacherPage";
import GamificationPage    from "./pages/GamificationPage";
import ProgressPage        from "./pages/ProgressPage";
import PomodoroPage        from "./pages/PomodoroPage";
import PlannerPage         from "./pages/PlannerPage";
import NotesPage           from "./pages/NotesPage";
import HistoryPage         from "./pages/HistoryPage";
import SettingsPage        from "./pages/SettingsPage";
import ExplainerVideoPage  from "./pages/ExplainerVideoPage";
import MultiplayerQuizPage from "./pages/MultiplayerQuizPage";
import AutoReelPage        from "./pages/AutoReelPage";
import InfographicPage     from "./pages/InfographicPage";
import StoryModePage       from "./pages/StoryModePage";
import DebateModePage      from "./pages/DebateModePage";
import StudyMusicPage      from "./pages/StudyMusicPage";
import { StudyGroupsPage, ShareChallengePage, ClassroomPage, PeerLearningPage } from "./pages/SocialLearning";

const NAV = [
  { id:"home",           label:"Home" },
  { id:"dashboard",      label:"Dashboard" },
  { id:"mindmap",        label:"Mind Map" },
  { id:"viva",           label:"Viva Practice" },
  { id:"adaptive",       label:"Adaptive AI" },
  { id:"explainer",      label:"AI Teacher" },
  { id:"explainervideo", label:"Explainer Video" },
  { id:"reel",           label:"Auto Reel" },
  { id:"infographic",    label:"Infographic" },
  { id:"story",          label:"Story Mode" },
  { id:"debate",         label:"Debate Mode" },
  { id:"gamification",   label:"Achievements" },
  { id:"progress",       label:"Progress" },
  { id:"pomodoro",       label:"Pomodoro" },
  { id:"planner",        label:"Study Planner" },
  { id:"notes",          label:"Notes" },
  { id:"history",        label:"History" },
  { id:"settings",       label:"Settings" },
  { id:"multiplayer",    label:"Quiz Battle" },
  { id:"music",          label:"Study Music" },
  { id:"studygroups",    label:"Study Groups" },
  { id:"sharechallenge", label:"Share & Challenge" },
  { id:"classroom",      label:"Classroom" },
  { id:"peerlearn",      label:"Peer Learning" },
];

// ── Inner app — only rendered when user is logged in ─────────────────────────
// All hooks are at top level here, no conditional hook calls
function StudyMateApp({ user, handleLogout }) {
  const [page, setPage]           = useState("home");
  const [collapsed, setCollapsed] = useState(false);
  const [toast, setToast]         = useState(null);
  const [studyMaterial, setStudyMaterial] = useState(null);

  const [sessionHistory, setSessionHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("smai_history") || "[]"); } catch { return []; }
  });
  const [userProgress, setUserProgress] = useState(() => {
    try { return JSON.parse(localStorage.getItem("smai_progress") || "{}"); } catch { return {}; }
  });
  const [settings, setSettings] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem("smai_settings") || "{}");
      return { theme:"light", accent:"#7c3aed", font:"System UI", speechRate:0.92, provider:"claude", claudeKey:"", groqKey:"", groqModel:"llama-3.3-70b-versatile", openaiKey:"", openaiModel:"gpt-4o-mini", geminiKey:"", geminiModel:"gemini-1.5-flash", ...s };
    } catch {
      return { theme:"light", accent:"#7c3aed", font:"System UI", speechRate:0.92, provider:"claude", claudeKey:"", groqKey:"", groqModel:"llama-3.3-70b-versatile", openaiKey:"", openaiModel:"gpt-4o-mini", geminiKey:"", geminiModel:"gemini-1.5-flash" };
    }
  });

  const addToast     = useCallback((msg) => setToast(msg), []);
  const addToHistory = useCallback((tool) => {
    setSessionHistory(h => {
      const u = [...h, { tool, date: nowStr() }];
      localStorage.setItem("smai_history", JSON.stringify(u));
      return u;
    });
  }, []);

  useEffect(() => { localStorage.setItem("smai_progress", JSON.stringify(userProgress)); }, [userProgress]);
  useEffect(() => {
    localStorage.setItem("smai_settings", JSON.stringify(settings));
    window.__smai_settings = settings;
  }, [settings]);
  useEffect(() => { window.__smai_settings = settings; }, []);

  // Daily streak
  useEffect(() => {
    const today = new Date().toDateString();
    setUserProgress(p => {
      if (p.lastStudyDay === today) return p;
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const streak = p.lastStudyDay === yesterday.toDateString() ? (p.streak || 0) + 1 : 1;
      return { ...p, lastStudyDay: today, streak };
    });
  }, []);

  const sideW = collapsed ? 58 : 210;

  const pages = {
    home:           <HomePage            addToHistory={addToHistory} addToast={addToast} />,
    dashboard:      <DashboardPage />,
    mindmap:        <MindMapPage         addToast={addToast} />,
    viva:           <VivaPage            addToast={addToast} />,
    adaptive:       <AdaptivePage        addToast={addToast} />,
    explainer:      <TeacherPage         addToast={addToast} />,
    gamification:   <GamificationPage />,
    progress:       <ProgressPage />,
    pomodoro:       <PomodoroPage />,
    planner:        <PlannerPage />,
    notes:          <NotesPage />,
    history:        <HistoryPage />,
    settings:       <SettingsPage />,
    explainervideo: <ExplainerVideoPage  addToast={addToast} />,
    multiplayer:    <MultiplayerQuizPage addToast={addToast} />,
    reel:           <AutoReelPage        addToast={addToast} />,
    infographic:    <InfographicPage     addToast={addToast} />,
    story:          <StoryModePage       addToast={addToast} />,
    debate:         <DebateModePage      addToast={addToast} />,
    music:          <StudyMusicPage      addToast={addToast} />,
    studygroups:    <StudyGroupsPage     addToast={addToast} />,
    sharechallenge: <ShareChallengePage  addToast={addToast} />,
    classroom:      <ClassroomPage       addToast={addToast} />,
    peerlearn:      <PeerLearningPage    addToast={addToast} />,
  };

  return (
    <AppContext.Provider value={{ studyMaterial, setStudyMaterial, sessionHistory, setSessionHistory, userProgress, setUserProgress, settings, setSettings, user, handleLogout }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600;700&family=Sora:wght@400;600;700;800&display=swap');
        *{box-sizing:border-box;}
        body{margin:0;background:#f5f3ff;font-family:${settings.font==="System UI"?"-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif":settings.font};}
        @keyframes spin{to{transform:rotate(360deg);}}
        @keyframes toastIn{from{transform:translateY(20px);opacity:0;}to{transform:translateY(0);opacity:1;}}
        @keyframes bounce{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:rgba(139,92,246,0.25);border-radius:99px;}
        textarea,input,select{font-family:inherit;}
      `}</style>

      <Sidebar page={page} setPage={setPage} collapsed={collapsed} setCollapsed={setCollapsed} user={user} handleLogout={handleLogout} NAV={NAV} />

      <main style={{ marginLeft:sideW, minHeight:"100vh", background:"#f5f3ff", padding:"26px 30px", transition:"margin-left 0.22s ease" }}>
        <div style={{ maxWidth:860, margin:"0 auto" }}>
          <div style={{ marginBottom:22 }}>
            <h1 style={{ margin:0, fontSize:24, fontWeight:800, fontFamily:"'DM Mono',monospace", color:"#111827", letterSpacing:-0.5 }}>
              {NAV.find(n => n.id === page)?.label || "Home"}
            </h1>
            <div style={{ fontSize:11, color:"#9ca3af", marginTop:2, fontFamily:"'DM Mono',monospace" }}>
              {nowStr()} · {userProgress.xp || 0} XP · Level {Math.floor((userProgress.xp || 0) / 100) + 1}
            </div>
          </div>
          {pages[page] || pages.home}
        </div>
      </main>

      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </AppContext.Provider>
  );
}

// ── Root — only manages auth state, no other hooks ───────────────────────────
export default function App() {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("smai_user") || "null"); } catch { return null; }
  });

  const handleLogin = (userData) => {
    localStorage.setItem("smai_user", JSON.stringify(userData));
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem("smai_user");
    setUser(null);
  };

  // Auth page styles (need to live outside StudyMateApp so they apply on login screen too)
  if (!user) {
    return (
      <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500;600;700&family=Sora:wght@400;600;700;800&display=swap');
          *{box-sizing:border-box;}
          body{margin:0;}
          @keyframes spin{to{transform:rotate(360deg);}}
          @keyframes authSlideUp{from{opacity:0;transform:translateY(32px) scale(0.97);}to{opacity:1;transform:translateY(0) scale(1);}}
          @keyframes authFadeIn{from{opacity:0;}to{opacity:1;}}
          @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
          @keyframes logoPulse{0%,100%{box-shadow:0 0 0 0 rgba(124,58,237,0.4)}50%{box-shadow:0 0 0 16px rgba(124,58,237,0)}}
          @keyframes float0{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-30px) scale(1.05)}}
          @keyframes float1{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(25px) scale(0.95)}}
          @keyframes float2{0%,100%{transform:translateY(0) scale(1)}50%{transform:translateY(-20px) scale(1.08)}}
          .auth-input:focus{border-color:rgba(139,92,246,0.7)!important;box-shadow:0 0 0 3px rgba(139,92,246,0.15)!important;}
          .auth-input::placeholder{color:rgba(255,255,255,0.3);}
          .feature-chip:hover{background:rgba(139,92,246,0.15)!important;transform:translateX(4px);}
        `}</style>
        <AuthPage onLogin={handleLogin} />
      </>
    );
  }

  return <StudyMateApp user={user} handleLogout={handleLogout} />;
}
