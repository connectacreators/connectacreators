import { useEffect } from "react";

export function useTheme() {
  useEffect(() => {
    document.documentElement.classList.remove("light");
    localStorage.removeItem("theme");
  }, []);

  return { theme: "dark" as const, toggleTheme: () => {} };
}
