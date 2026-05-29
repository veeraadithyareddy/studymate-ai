
// ─── Helpers ──────────────────────────────────────────────────────────────────
const wc = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const nowStr = () => new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const stripMd = (t = "") => t.replace(/#{1,6}\s*/g,"").replace(/\*{1,3}([^*]+)\*{1,3}/g,"$1").replace(/`[^`]*`/g,"").replace(/^[-*+]\s+/gm,"").replace(/^\d+\.\s+/gm,"").replace(/\n{3,}/g,"\n\n").trim();
const safeJSON = (str, fallback = []) => { try { return JSON.parse(str.replace(/```json?|```/g,"").trim()); } catch { return fallback; } };

// ─── LANG CONFIG ──────────────────────────────────────────────────────────────
const LANG_CONFIG = {
  Spanish:{codes:["es-ES","es-MX","es"],flag:"🇪🇸",native:"Español"},
  French:{codes:["fr-FR","fr-CA","fr"],flag:"🇫🇷",native:"Français"},
  German:{codes:["de-DE","de"],flag:"🇩🇪",native:"Deutsch"},
  Hindi:{codes:["hi-IN","hi"],flag:"🇮🇳",native:"हिन्दी"},
  Tamil:{codes:["ta-IN","ta"],flag:"🇮🇳",native:"தமிழ்"},
  Telugu:{codes:["te-IN","te"],flag:"🇮🇳",native:"తెలుగు"},
  Mandarin:{codes:["zh-CN","zh"],flag:"🇨🇳",native:"普通话"},
  Japanese:{codes:["ja-JP","ja"],flag:"🇯🇵",native:"日本語"},
  Arabic:{codes:["ar-SA","ar"],flag:"🇸🇦",native:"العربية"},
  Portuguese:{codes:["pt-BR","pt-PT","pt"],flag:"🇧🇷",native:"Português"},
  Russian:{codes:["ru-RU","ru"],flag:"🇷🇺",native:"Русский"},
  Korean:{codes:["ko-KR","ko"],flag:"🇰🇷",native:"한국어"},
  Italian:{codes:["it-IT","it"],flag:"🇮🇹",native:"Italiano"},
  Dutch:{codes:["nl-NL","nl"],flag:"🇳🇱",native:"Nederlands"},
  Turkish:{codes:["tr-TR","tr"],flag:"🇹🇷",native:"Türkçe"},
  Polish:{codes:["pl-PL","pl"],flag:"🇵🇱",native:"Polski"},
  Swedish:{codes:["sv-SE","sv"],flag:"🇸🇪",native:"Svenska"},
  Indonesian:{codes:["id-ID","id"],flag:"🇮🇩",native:"Bahasa Indonesia"},
  Thai:{codes:["th-TH","th"],flag:"🇹🇭",native:"ภาษาไทย"},
  Vietnamese:{codes:["vi-VN","vi"],flag:"🇻🇳",native:"Tiếng Việt"},
  Bengali:{codes:["bn-IN","bn"],flag:"🇮🇳",native:"বাংলা"},
  Kannada:{codes:["kn-IN","kn"],flag:"🇮🇳",native:"ಕನ್ನಡ"},
  Malayalam:{codes:["ml-IN","ml"],flag:"🇮🇳",native:"മലയാളം"},
  Marathi:{codes:["mr-IN","mr"],flag:"🇮🇳",native:"मराठी"},
  Urdu:{codes:["ur-PK","ur"],flag:"🇵🇰",native:"اردو"},
  Hebrew:{codes:["he-IL","he"],flag:"🇮🇱",native:"עברית"},
  Greek:{codes:["el-GR","el"],flag:"🇬🇷",native:"Ελληνικά"},
};
const LANGS = Object.keys(LANG_CONFIG);


const TOOLS = [
  { id:"summarize",  icon:"≡",  label:"Summarize" },
  { id:"highlights", icon:"★",  label:"Highlights" },
  { id:"quiz",       icon:"?",  label:"Quiz" },
  { id:"flashcards", icon:"⊟",  label:"Flashcards" },
  { id:"tutor",      icon:"◎",  label:"AI Tutor" },
  { id:"explain",    icon:"✦",  label:"Explain" },
  { id:"essaycheck", icon:"✓",  label:"Essay Check" },
  { id:"translate",  icon:"⊕",  label:"Translate" },
  { id:"readaloud",  icon:"▶",  label:"Read Aloud" },
  { id:"youtube",    icon:"▷",  label:"YouTube" },
  { id:"cheatsheet", icon:"⊞",  label:"Cheat Sheet" },
  { id:"mocktest",   icon:"☑",  label:"Mock Test" },
  { id:"games",      icon:"🎮", label:"Games" },
];

export { wc, nowStr, stripMd, safeJSON, LANG_CONFIG, LANGS, TOOLS };

