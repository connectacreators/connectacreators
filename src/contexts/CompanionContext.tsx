import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AutonomyMode = "auto" | "ask" | "plan";

export interface CompanionTask {
  id: string;
  titleEn: string;
  titleEs: string;
  subtitleEn: string;
  subtitleEs: string;
  priority: "red" | "amber" | "blue";
  actionLabelEn: string;
  actionLabelEs: string;
  skipLabelEn: string;
  skipLabelEs: string;
  actionPath: string;
}

interface CompanionContextType {
  companionName: string;
  setCompanionName: (name: string) => void;
  setupDone: boolean;
  setSetupDone: (done: boolean) => void;
  tasks: CompanionTask[];
  refreshTasks: () => Promise<void>;
  clientId: string | null;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  loadingTasks: boolean;
  autonomyMode: AutonomyMode;
  setAutonomyMode: (mode: AutonomyMode) => void;
}

const CompanionContext = createContext<CompanionContextType | null>(null);

const COMPANION_NAME_CACHE_KEY = "connecta_companion_name";

export function CompanionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  // Hydrate from localStorage so the sidebar doesn't flash "AI" before the
  // companion_state row finishes loading. Falls back to "AI" only on the
  // first-ever visit (before naming).
  const [companionName, _setCompanionName] = useState<string>(() => {
    if (typeof window === "undefined") return "AI";
    return localStorage.getItem(COMPANION_NAME_CACHE_KEY) || "AI";
  });
  const setCompanionName = useCallback((name: string) => {
    _setCompanionName(name);
    if (typeof window !== "undefined") {
      localStorage.setItem(COMPANION_NAME_CACHE_KEY, name);
    }
  }, []);
  const [setupDone, setSetupDone] = useState(true);
  const [tasks, setTasks] = useState<CompanionTask[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [autonomyMode, setAutonomyModeState] = useState<AutonomyMode>("ask");

  // Resolve primary client ID
  useEffect(() => {
    if (!user) { setClientId(null); return; }
    supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setClientId(data.id); });
  }, [user]);

  // Load companion state once client is known
  useEffect(() => {
    if (!clientId) return;
    supabase.from("companion_state")
      .select("companion_name, companion_setup_done, workflow_context")
      .eq("client_id", clientId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCompanionName(data.companion_name);
          setSetupDone(data.companion_setup_done);
          const mode = data.workflow_context?.__autonomy_mode;
          if (mode === "auto" || mode === "ask" || mode === "plan") {
            setAutonomyModeState(mode);
          }
        } else {
          setSetupDone(false);
        }
      });
  }, [clientId]);

  const setAutonomyMode = useCallback(async (mode: AutonomyMode) => {
    setAutonomyModeState(mode);
    if (!clientId) return;
    // Merge into workflow_context
    const { data: existing } = await supabase.from("companion_state")
      .select("workflow_context").eq("client_id", clientId).maybeSingle();
    const merged = { ...(existing?.workflow_context || {}), __autonomy_mode: mode };
    await supabase.from("companion_state").upsert(
      { client_id: clientId, workflow_context: merged },
      { onConflict: "client_id" }
    );
  }, [clientId]);

  const refreshTasks = useCallback(async () => {
    if (!clientId) return;
    setLoadingTasks(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase.functions.invoke("get-companion-tasks", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (data?.tasks) setTasks(data.tasks);
    } finally {
      setLoadingTasks(false);
    }
  }, [clientId]);

  useEffect(() => { if (clientId) refreshTasks(); }, [clientId, refreshTasks]);

  return (
    <CompanionContext.Provider value={{
      companionName, setCompanionName,
      setupDone, setSetupDone,
      tasks, refreshTasks,
      clientId,
      isOpen, setIsOpen,
      loadingTasks,
      autonomyMode, setAutonomyMode,
    }}>
      {children}
    </CompanionContext.Provider>
  );
}

export function useCompanion() {
  const ctx = useContext(CompanionContext);
  if (!ctx) throw new Error("useCompanion must be used within CompanionProvider");
  return ctx;
}
