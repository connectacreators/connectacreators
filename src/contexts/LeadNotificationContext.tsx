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

export function LeadNotificationProvider({ children }: { children: React.ReactNode }) {
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isFirstRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
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

  const pollLeads = useCallback(async (silent = true) => {
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

      if (!isFirstRef.current) {
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

      knownIdsRef.current = new Set(fetched.map(l => l.id));
      isFirstRef.current = false;
    } catch {
      // silent fail
    }
  }, [playSound]);

  // Initial fetch + interval
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;

    const start = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await pollLeads();
      interval = setInterval(() => pollLeads(), POLL_INTERVAL);
    };

    start();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        isFirstRef.current = true;
        knownIdsRef.current = new Set();
        pollLeads();
        interval = setInterval(() => pollLeads(), POLL_INTERVAL);
      }
      if (event === "SIGNED_OUT") {
        clearInterval(interval);
        knownIdsRef.current = new Set();
        isFirstRef.current = true;
        setNewLeadCount(0);
      }
    });

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, [pollLeads]);

  const resetCount = useCallback(() => setNewLeadCount(0), []);

  return (
    <LeadNotificationContext.Provider value={{ newLeadCount, resetCount }}>
      {children}
    </LeadNotificationContext.Provider>
  );
}
