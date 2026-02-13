import { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Lead = {
  id: string;
  fullName: string;
  leadSource: string;
  client: string;
};

type LeadNotificationContextType = {
  newLeadCount: number;
  resetCount: () => void;
};

const LeadNotificationContext = createContext<LeadNotificationContextType>({
  newLeadCount: 0,
  resetCount: () => {},
});

export const useLeadNotifications = () => useContext(LeadNotificationContext);

const POLL_INTERVAL = 120_000; // 2 minutes
const STORAGE_KEY = "connecta_known_lead_ids";

function loadKnownIds(): Set<string> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return new Set(JSON.parse(stored));
  } catch {}
  return new Set();
}

function saveKnownIds(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {}
}

export function LeadNotificationProvider({ children }: { children: React.ReactNode }) {
  const knownIdsRef = useRef<Set<string>>(loadKnownIds());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [newLeadCount, setNewLeadCount] = useState(0);

  // Pre-load the notification sound
  useEffect(() => {
    audioRef.current = new Audio("/sounds/lead-notification.wav");
    audioRef.current.volume = 0.6;
  }, []);

  const playSound = useCallback(() => {
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } catch {}
  }, []);

  const pollLeads = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-leads`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });

      if (!res.ok) return;

      const result = await res.json();
      const fetched: Lead[] = (result.leads || []).map((l: any) => ({
        id: l.id,
        fullName: l.fullName,
        leadSource: l.leadSource,
        client: l.client,
      }));

      const previousSize = knownIdsRef.current.size;

      // If we had known IDs (from storage or previous poll), detect new ones
      if (previousSize > 0) {
        const newLeads = fetched.filter(l => !knownIdsRef.current.has(l.id));
        if (newLeads.length > 0) {
          playSound();
          setNewLeadCount(prev => prev + newLeads.length);
          newLeads.forEach(l => {
            toast.success(`🚀 New lead: ${l.fullName || "Unknown"}`, {
              description: [l.leadSource, l.client].filter(Boolean).join(" • "),
              duration: 8000,
            });
          });
        }
      }

      // Update known IDs and persist
      knownIdsRef.current = new Set(fetched.map(l => l.id));
      saveKnownIds(knownIdsRef.current);
    } catch {
      // silent fail
    }
  }, [playSound]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pollLeads();
    intervalRef.current = setInterval(() => pollLeads(), POLL_INTERVAL);
  }, [pollLeads]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Initial fetch + interval + auth listener
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) startPolling();
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        startPolling();
      }
      if (event === "SIGNED_OUT") {
        stopPolling();
        knownIdsRef.current = new Set();
        localStorage.removeItem(STORAGE_KEY);
        setNewLeadCount(0);
      }
    });

    return () => {
      stopPolling();
      subscription.unsubscribe();
    };
  }, [startPolling, stopPolling]);

  const resetCount = useCallback(() => setNewLeadCount(0), []);

  return (
    <LeadNotificationContext.Provider value={{ newLeadCount, resetCount }}>
      {children}
    </LeadNotificationContext.Provider>
  );
}
