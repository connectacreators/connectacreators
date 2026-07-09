// Shared client-switcher state — one source of truth for "which client am I
// working on". Used by DashboardSidebar (desktop dropdown) and
// MobileClientSwitcher (top-bar pill + sheet). Instances stay in sync via the
// "viewModeChanged" window event plus localStorage("dashboard_viewMode");
// switching also navigates to the equivalent route for the new client, so
// every client-scoped page follows the selection.
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { readCache, writeCache } from "@/lib/sessionCache";
import { useAuth } from "@/hooks/useAuth";

export type SwitcherClient = { id: string; name: string };

export function useClientSwitcher() {
  const { user, isAdmin, isUser, isVideographer, isEditor } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const isSubscriber = !isAdmin && !isVideographer && !isEditor && !isUser;
  // Everyone except editors can switch between their clients
  const showClientSelector = !isEditor;

  // Hydrate from cache so the selected client name appears instantly on
  // navigation; background fetch refreshes if stale.
  const [ownClientId, setOwnClientId] = useState<string | null>(
    () => (user ? readCache<{ id: string | null; name: string | null }>(`ownClient_${user.id}`, { id: null, name: null }).id : null),
  );
  const [ownClientName, setOwnClientName] = useState<string | null>(
    () => (user ? readCache<{ id: string | null; name: string | null }>(`ownClient_${user.id}`, { id: null, name: null }).name : null),
  );
  const [viewMode, setViewMode] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("dashboard_viewMode");
      if (stored) return stored;
    }
    // Subscribers and agency users default to "me", admins to "master"
    return (isUser || isSubscriber) ? "me" : "master";
  });
  const [clients, setClients] = useState<SwitcherClient[]>([]);

  // Cross-instance sync: another switcher (sidebar/mobile) changed the mode.
  useEffect(() => {
    const handler = (e: Event) => setViewMode((e as CustomEvent).detail as string);
    window.addEventListener("viewModeChanged", handler);
    return () => window.removeEventListener("viewModeChanged", handler);
  }, []);

  // Sync viewMode when URL contains a client ID (e.g. navigating from Clients list)
  useEffect(() => {
    const match = location.pathname.match(/^\/clients\/([^/]+)/);
    if (match) {
      const urlClientId = match[1];
      if (urlClientId && urlClientId !== viewMode) {
        setViewMode(urlClientId);
        localStorage.setItem("dashboard_viewMode", urlClientId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Fetch own client record via junction table
  useEffect(() => {
    if (!user) return;
    supabase
      .from("subscriber_clients")
      .select("client_id, clients(id, name)")
      .eq("subscriber_user_id", user.id)
      .eq("is_primary", true)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.client_id) {
          const id = data.client_id;
          const name = (data as any).clients?.name ?? null;
          setOwnClientId(id);
          setOwnClientName(name);
          writeCache(`ownClient_${user.id}`, { id, name });
        } else {
          supabase.from("clients").select("id, name").eq("user_id", user.id).maybeSingle()
            .then(({ data: fb }) => {
              if (fb) {
                setOwnClientId(fb.id);
                setOwnClientName(fb.name);
                writeCache(`ownClient_${user.id}`, { id: fb.id, name: fb.name });
              }
            });
        }
      });
  }, [user]);

  // Fetch clients list for selector
  useEffect(() => {
    if (!user || !showClientSelector) return;
    // Cancel stale resolutions: role loads async, so this effect runs first
    // with role="client" (default → isSubscriber=true, fires empty subscriber query),
    // then re-runs after role resolves to "admin" (fires full clients query). Without
    // this guard, the late-resolving subscriber query overwrites the admin result with [].
    let cancelled = false;

    if (isUser || isSubscriber) {
      // Fetch non-primary subscriber clients (primary shown as "My Brand" separately)
      supabase
        .from("subscriber_clients")
        .select("client_id, is_primary, clients(id, name)")
        .eq("subscriber_user_id", user.id)
        .eq("is_primary", false)
        .order("created_at")
        .then(({ data }) => {
          if (cancelled || !data) return;
          setClients(data.map((d: any) => ({
            id: d.clients.id,
            name: d.clients.name,
          })));
        });
    } else if (user.email === "robertogaunaj@gmail.com") {
      // Roberto's admin view only lists Connecta Plus clients. Uses the same
      // pattern as Subscribers.tsx (clients.user_id → user_roles) since that
      // is the canonical link. Connecta+ subscribers added via the Subscribers
      // UI set clients.user_id directly and don't populate the legacy
      // subscriber_clients junction — using the junction filtered them out
      // (e.g. Spencer Barton was missing here despite holding the role).
      (async () => {
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "connecta_plus");
        const userIds = (roleRows ?? []).map((r) => r.user_id);
        if (cancelled) return;
        if (userIds.length === 0) { setClients([]); return; }
        const { data } = await supabase
          .from("clients")
          .select("id, name")
          .in("user_id", userIds)
          .is("parent_subscriber_id", null)
          .order("name");
        if (cancelled || !data) return;
        setClients(data);
      })();
    } else {
      supabase.from("clients").select("id, name").order("name")
        .then(({ data }) => {
          if (cancelled || !data) return;
          setClients(data);
        });
    }
    return () => { cancelled = true; };
  }, [user, showClientSelector, isUser, isSubscriber]);

  // Sync viewMode to localStorage, broadcast change, and navigate to same feature for new client
  const switchTo = (mode: string) => {
    setViewMode(mode);
    localStorage.setItem("dashboard_viewMode", mode);
    window.dispatchEvent(new CustomEvent("viewModeChanged", { detail: mode }));

    // Navigate to the equivalent route for the newly selected client
    const [pathname, search] = (location.pathname + location.search).split("?");
    const queryString = search ? `?${search}` : "";

    // Extract the feature segment from current path
    const clientPathMatch = pathname.match(/^\/clients\/[^/]+\/(.+)$/);
    const feature = clientPathMatch ? clientPathMatch[1] : pathname.replace(/^\//, "");

    // Only auto-navigate for features that have client-specific routes
    const clientFeatures = ["vault", "scripts", "editing-queue", "content-calendar", "leads", "booking-settings", "lead-calendar", "strategy", "contracts"];
    if (!clientFeatures.includes(feature)) return;

    const targetClientId = mode === "master" ? null : mode === "me" ? ownClientId : mode;

    if (targetClientId) {
      navigate(`/clients/${targetClientId}/${feature}${queryString}`);
    } else {
      // Master mode — navigate to master route if it exists
      const masterFeatures = ["vault", "scripts", "editing-queue", "content-calendar"];
      if (masterFeatures.includes(feature)) {
        navigate(`/${feature}${queryString}`);
      }
    }
  };

  const selectedClientId = viewMode === "master" ? null : viewMode === "me" ? ownClientId : viewMode;

  return {
    viewMode,
    clients,
    setClients,
    ownClientId,
    ownClientName,
    selectedClientId,
    isSubscriber,
    showClientSelector,
    switchTo,
  };
}
