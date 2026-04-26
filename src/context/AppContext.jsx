import { useState, useRef, useEffect, useCallback, createContext, useContext, useMemo } from "react";

// ─── Context ──────────────────────────────────────────────────────────────────
const AppContext = createContext();
const useApp = () => useContext(AppContext);


export { AppContext, useApp };
