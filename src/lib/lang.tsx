"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type Lang = "en" | "de";
type Ctx = { lang: Lang; setLang: (l: Lang) => void; L: (en: string, de: string) => string };
const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, L: (en) => en });

/** English by default; German one click away. `L("English", "Deutsch")` keeps both texts side by side. */
export function LangProvider({ initial, children }: { initial: Lang; children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    document.cookie = `m2m_lang=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
  }, []);
  const L = useCallback((en: string, de: string) => (lang === "de" ? de : en), [lang]);
  const value = useMemo(() => ({ lang, setLang, L }), [lang, setLang, L]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);
export const useL = () => useContext(LangCtx).L;
