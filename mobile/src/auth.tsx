import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, loadToken, setToken } from "./api";

export type User = { id: string; name: string; email: string; role: "tourist" | "staff" | "admin" | "operator"; phone?: string };
const Ctx = createContext<{ user: User | null; ready: boolean; signIn: (e: string, p: string, code?: string) => Promise<void>; signOut: () => Promise<void> }>({ user: null, ready: false, signIn: async () => {}, signOut: async () => {} });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null); const [ready, setReady] = useState(false);
  useEffect(() => { (async () => { try { if (await loadToken()) setUser((await api("/api/auth/me")).user); } catch { await setToken(null); } finally { setReady(true); } })(); }, []);
  const signIn = useCallback(async (email: string, password: string, code?: string) => { const r = await api("/api/auth/token", { body: { email, password, code } }); await setToken(r.token); setUser((await api("/api/auth/me")).user); }, []);
  const signOut = useCallback(async () => { await setToken(null); setUser(null); }, []);
  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}
