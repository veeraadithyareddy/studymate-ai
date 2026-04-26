import { useState, useRef, useEffect, useCallback, createContext, useContext, useMemo } from "react";

// ─── Toast ────────────────────────────────────────────────────────────────────
function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div style={{ position:"fixed", bottom:24, right:24, zIndex:9999, background:"linear-gradient(135deg,#22c55e,#16a34a)", color:"#fff", borderRadius:14, padding:"11px 20px", fontSize:13, fontWeight:600, boxShadow:"0 8px 28px rgba(34,197,94,0.35)", animation:"toastIn 0.3s cubic-bezier(.34,1.56,.64,1)" }}>{msg}</div>;
}


export default Toast;
