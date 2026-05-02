import { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Public routes where lead notifications should never appear
const PUBLIC_ROUTES = ["/reto", "/reto/en", "/es", "/", "/home", "/about", "/select-plan",
  "/signup", "/coming-soon", "/privacy-policy", "/terms-and-conditions"];

function isPublicRoute(): boolean {
  const pathname = window.location.pathname;
  if (PUBLIC_ROUTES.includes(pathname)) return true;
  if (/^\/(s|f|p|book|public)\//.test(pathname)) return true;
  return false;
}

type LeadNotificationContextType = {
  newLeadCount: number;
  resetCount: () => void;
};

const LeadNotificationContext = createContext<LeadNotificationContextType>({
  newLeadCount: 0,
  resetCount: () => {},
});

export const useLeadNotifications = () => useContext(LeadNotificationContext);

// Track which lead IDs we've already notified about to avoid duplicates
const STORAGE_KEY = "connecta_known_lead_ids";
const BOOKED_KEY = "connecta_booked_lead_ids";
const LAST_OPEN_KEY = "connecta_last_open_at";

function loadSet(key: string): Set<string> {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return new Set(JSON.parse(stored));
  } catch {}
  return new Set();
}

function saveSet(key: string, ids: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {}
}

function getLastOpenAt(): string | null {
  try {
    return localStorage.getItem(LAST_OPEN_KEY);
  } catch {}
  return null;
}

function setLastOpenAt(ts: string) {
  try {
    localStorage.setItem(LAST_OPEN_KEY, ts);
  } catch {}
}

export function LeadNotificationProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownIdsRef = useRef<Set<string>>(loadSet(STORAGE_KEY));
  const bookedIdsRef = useRef<Set<string>>(loadSet(BOOKED_KEY));
  const readyRef = useRef(false);
  const [newLeadCount, setNewLeadCount] = useState(0);

  // Pre-load notification sound
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

  // On startup: notify about leads created since last visit, then seed known IDs
  const seedKnownIds = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("leads")
        .select("id, name, source, status, created_at")
        .order("created_at", { ascending: false })
        .limit(500);

      if (data) {
        const lastOpenAt = getLastOpenAt();
        const newSinceLastOpen = lastOpenAt
          ? data.filter((r: any) => r.created_at > lastOpenAt && !knownIdsRef.current.has(r.id))
          : [];

        // Fire notifications for leads created while we were away
        if (newSinceLastOpen.length > 0) {
          // Show individual toasts (up to 5), then a summary for the rest
          const toShow = newSinceLastOpen.slice(0, 5);
          const remaining = newSinceLastOpen.length - toShow.length;

          // Stagger toasts slightly so they don't all stack at once
          toShow.forEach((lead: any, i: number) => {
            setTimeout(() => {
              playSound();
              toast.success(`New lead: ${lead.name || "Unknown"}`, {
                description: [lead.source, lead.status].filter(Boolean).join(" • "),
                duration: 8000,
              });
            }, i * 400);
          });

          if (remaining > 0) {
            setTimeout(() => {
              toast.info(`+${remaining} more new lead${remaining > 1 ? "s" : ""} since your last visit`, {
                duration: 8000,
              });
            }, toShow.length * 400);
          }

          setNewLeadCount(newSinceLastOpen.length);
        }

        // Seed all IDs as known so realtime doesn't re-notify
        const ids = new Set(data.map((r: any) => r.id as string));
        const bookedIds = new Set(data.filter((r: any) => r.status === "Booked").map((r: any) => r.id as string));
        knownIdsRef.current = ids;
        bookedIdsRef.current = bookedIds;
        saveSet(STORAGE_KEY, ids);
        saveSet(BOOKED_KEY, bookedIds);
      }
    } catch {}

    // Record this visit timestamp
    setLastOpenAt(new Date().toISOString());
    readyRef.current = true;
  }, [playSound]);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let authSub: { unsubscribe: () => void } | null = null;

    const setupRealtime = async () => {
      if (isPublicRoute()) return;
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Seed first (fires missed notifications), then subscribe — 1s grace period
      await seedKnownIds();
      await new Promise(r => setTimeout(r, 1000));

      channel = supabase
        .channel("lead-realtime-notifications")
        .on(
          "postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "leads" },
          (payload: any) => {
            if (!readyRef.current) return;
            const lead = payload.new;
            const id = lead.id as string;
            if (knownIdsRef.current.has(id)) return;

            knownIdsRef.current.add(id);
            saveSet(STORAGE_KEY, knownIdsRef.current);
            playSound();
            setNewLeadCount(prev => prev + 1);
            toast.success(`New lead: ${lead.name || "Unknown"}`, {
              description: [lead.source, lead.status].filter(Boolean).join(" • "),
              duration: 8000,
            });
          }
        )
        .on(
          "postgres_changes" as any,
          { event: "UPDATE", schema: "public", table: "leads" },
          (payload: any) => {
            if (!readyRef.current) return;
            const lead = payload.new;
            const prev = payload.old;
            const id = lead.id as string;

            // Notify on any status change
            if (!lead.status || lead.status === prev?.status) return;

            // Track booked separately to show booking details
            if (lead.status === "Booked") {
              if (bookedIdsRef.current.has(id)) return;
              bookedIdsRef.current.add(id);
              saveSet(BOOKED_KEY, bookedIdsRef.current);
              playSound();
              const dateStr = lead.booking_date
                ? `${lead.booking_date}${lead.booking_time ? " at " + lead.booking_time : ""}`
                : "";
              toast.success(`Booked: ${lead.name || "Unknown"}`, {
                description: dateStr || "Appointment confirmed",
                duration: 8000,
              });
            } else {
              playSound();
              toast.info(`Lead updated: ${lead.name || "Unknown"}`, {
                description: `Status → ${lead.status}`,
                duration: 6000,
              });
            }
          }
        )
        .subscribe();
    };

    const teardown = () => {
      if (channel) {
        supabase.removeChannel(channel);
        channel = null;
      }
      readyRef.current = false;
    };

    setupRealtime();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setupRealtime();
      if (event === "SIGNED_OUT") {
        teardown();
        knownIdsRef.current = new Set();
        bookedIdsRef.current = new Set();
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(BOOKED_KEY);
        setNewLeadCount(0);
      }
    });
    authSub = subscription;

    return () => {
      teardown();
      authSub?.unsubscribe();
    };
  }, [playSound, seedKnownIds]);

  const resetCount = useCallback(() => setNewLeadCount(0), []);

  return (
    <LeadNotificationContext.Provider value={{ newLeadCount, resetCount }}>
      {children}
    </LeadNotificationContext.Provider>
  );
}
