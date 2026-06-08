// src/hooks/useViewMode.ts
//
// Read-only subscription to the sidebar client selector.
//
// DashboardSidebar owns the selector: it writes the choice to
// localStorage("dashboard_viewMode") and broadcasts a "viewModeChanged"
// CustomEvent. This hook lets other surfaces (e.g. the dashboard) react to
// that selection without duplicating the parse/listen wiring.
//
// Values: "master" | "me" | "<client-uuid>".

import { useEffect, useState } from "react";

const KEY = "dashboard_viewMode";

function readMode(): string {
  if (typeof window === "undefined") return "master";
  return localStorage.getItem(KEY) ?? "master";
}

export function useViewMode(): string {
  const [mode, setMode] = useState<string>(readMode);

  useEffect(() => {
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setMode(typeof detail === "string" ? detail : readMode());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setMode(readMode());
    };
    window.addEventListener("viewModeChanged", onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("viewModeChanged", onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return mode;
}
