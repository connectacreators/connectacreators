import { useCallback, useSyncExternalStore } from "react";

const LANG_KEY = "language";
const LANG_EVENT = "language-changed";

export type Language = "en" | "es";

function getLang(): Language {
  if (typeof window === "undefined") return "en";
  return (localStorage.getItem(LANG_KEY) as Language) || "en";
}

function subscribe(callback: () => void) {
  const handler = () => callback();
  window.addEventListener(LANG_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(LANG_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useLanguage() {
  const language = useSyncExternalStore(subscribe, getLang, () => "en" as Language);

  const toggleLanguage = useCallback(() => {
    const next: Language = getLang() === "en" ? "es" : "en";
    localStorage.setItem(LANG_KEY, next);
    window.dispatchEvent(new Event(LANG_EVENT));
  }, []);

  return { language, toggleLanguage };
}
