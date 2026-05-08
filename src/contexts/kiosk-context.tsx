import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export interface KioskStudent {
  studentId: string;
  name: string;
  email: string;
  discordId: string;
}

export interface KioskUser {
  id: string;
  name: string;
  email: string;
}

interface KioskSession {
  student: KioskStudent;
  user: KioskUser;
}

interface KioskContextValue {
  session: KioskSession | null;
  setSession: (s: KioskSession | null) => void;
  logout: () => void;
  resetTimeout: () => void;
}

const INACTIVITY_MS = 2 * 60 * 1000; // 2 minutes

const KioskContext = createContext<KioskContextValue | null>(null);

export function KioskProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<KioskSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const logout = useCallback(() => {
    setSessionState(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const resetTimeout = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (session) {
      timerRef.current = setTimeout(logout, INACTIVITY_MS);
    }
  }, [session, logout]);

  const setSession = useCallback(
    (s: KioskSession | null) => {
      setSessionState(s);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (s) {
        timerRef.current = setTimeout(logout, INACTIVITY_MS);
      }
    },
    [logout],
  );

  // Reset timeout on any interaction while logged in
  useEffect(() => {
    if (!session) return;
    const events = ["mousedown", "keydown", "touchstart"];
    const handle = () => resetTimeout();
    events.forEach((e) => window.addEventListener(e, handle));
    return () => events.forEach((e) => window.removeEventListener(e, handle));
  }, [session, resetTimeout]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <KioskContext.Provider
      value={{ session, setSession, logout, resetTimeout }}
    >
      {children}
    </KioskContext.Provider>
  );
}

export function useKiosk() {
  const ctx = useContext(KioskContext);
  if (!ctx) throw new Error("useKiosk must be used within KioskProvider");
  return ctx;
}
