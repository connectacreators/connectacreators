import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
}

const CompanionContext = createContext<CompanionContextType | null>(null);

export function CompanionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companionName, setCompanionName] = useState("AI");
  const [setupDone, setSetupDone] = useState(true);
  const [tasks, setTasks] = useState<CompanionTask[]>([]);
  const [clientId, setClientId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // Resolve primary client ID
  useEffect(() => {
    if (!user) { setClientId(null); return; }
    supabase.from("clients").select("id").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) setClientId(data.id); });
  }, [user]);

  // Load companion state once client is known
  useEffect(() => {
    if (!clientId) return;
    supabase.from("companion_state").select("companion_name, companion_setup_done")
      .eq("client_id", clientId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setCompanionName(data.companion_name);
          setSetupDone(data.companion_setup_done);
        } else {
          setSetupDone(false);
        }
      });
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
