// src/pages/Dashboard.tsx
//
// Agency dashboard — replaces the old tool-launcher (3 folder cards).
// Two views:
//   1) Agency view (default)            — greeting + client roster + 6 AI prompt cards
//   2) Client-scoped view (?client=X)   — breadcrumb + "Robby's read" insight rows
//
// Spec: docs/superpowers/specs/2026-05-15-agency-dashboard-redesign-design.md

import { useMemo, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useCompanion } from "@/contexts/CompanionContext";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Loader2 } from "lucide-react";

import { useDashboardPendingItems } from "@/hooks/useDashboardPendingItems";
import { ClientCard } from "@/components/dashboard/ClientCard";
import { PromptCard } from "@/components/dashboard/PromptCard";
import { ActiveClientBreadcrumb } from "@/components/dashboard/ActiveClientBreadcrumb";
import { RobbyInsightRow } from "@/components/dashboard/RobbyInsightRow";
import { DASHBOARD_PROMPTS, renderPrompt } from "@/components/dashboard/PROMPTS";
import { getRobbyInsights } from "@/components/dashboard/getRobbyInsights";

interface Client {
  id: string;
  name: string;
}

export default function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { setIsOpen: setDrawerOpen } = useCompanion();

  const activeClientId = searchParams.get("client");

  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setClientsLoading(true);
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("[Dashboard] failed to load clients:", error);
          setClients([]);
        } else {
          setClients((data ?? []) as Client[]);
        }
        setClientsLoading(false);
      });
    return () => { cancelled = true; };
  }, [user]);

  const clientIds = useMemo(() => clients.map((c) => c.id), [clients]);
  const { data: pendingByClient, loading: pendingLoading } = useDashboardPendingItems(clientIds);

  const rosterClients = useMemo(
    () => clients.filter((c) => (pendingByClient[c.id]?.length ?? 0) > 0),
    [clients, pendingByClient],
  );

  const activeClient = useMemo(
    () => clients.find((c) => c.id === activeClientId) ?? null,
    [clients, activeClientId],
  );
  const activeClientName = activeClient?.name ?? null;

  const onClientClick = (clientId: string) => {
    navigate(`/dashboard?client=${clientId}`);
  };

  const onPromptClick = (promptId: string) => {
    const def = DASHBOARD_PROMPTS.find((p) => p.id === promptId);
    if (!def) return;
    const rendered = renderPrompt(def.prompt, activeClientName);
    (window as any).__companionPendingPrompt = rendered;
    setDrawerOpen(true);
  };

  const onInsightClick = (insightPrompt: string) => {
    (window as any).__companionPendingPrompt = insightPrompt;
    setDrawerOpen(true);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "rgba(20,20,20,0.40)" }} />
      </div>
    );
  }
  if (!user) return <ScriptsLogin />;

  const firstName =
    ((user.user_metadata?.first_name as string | undefined) ??
      user.email?.split("@")[0] ??
      "there");
  const pendingCount = rosterClients.length;

  return (
    <div className="min-h-screen" style={{ background: "#EAE6DC", padding: "22px 28px" }}>

      {!activeClient && (
        <>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 500,
              color: "#141414",
              letterSpacing: "-0.01em",
              marginBottom: 4,
              fontFamily: "'EB Garamond', Georgia, serif",
            }}
          >
            Hi {firstName}.
          </h1>
          <p style={{ fontSize: 12, color: "rgba(20,20,20,0.55)", marginBottom: 22 }}>
            {clientsLoading || pendingLoading
              ? "Loading…"
              : pendingCount === 0
                ? clients.length === 0
                  ? "Add your first client to get started."
                  : `All caught up across your ${clients.length} client${clients.length === 1 ? "" : "s"}.`
                : `${pendingCount} client${pendingCount === 1 ? "" : "s"} need${pendingCount === 1 ? "s" : ""} you today.`}
          </p>

          {rosterClients.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.20em",
                  textTransform: "uppercase",
                  color: "rgba(20,20,20,0.45)",
                  marginBottom: 10,
                  fontFamily: "Figtree, sans-serif",
                  fontWeight: 600,
                }}
              >
                Clients
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {rosterClients.map((c) => (
                  <ClientCard
                    key={c.id}
                    clientId={c.id}
                    name={c.name}
                    pendingItems={pendingByClient[c.id] ?? []}
                    onClick={onClientClick}
                  />
                ))}
              </div>
            </section>
          )}

          {!clientsLoading && clients.length === 0 && (
            <section style={{ marginBottom: 28 }}>
              <button
                type="button"
                onClick={() => navigate("/onboarding")}
                style={{
                  background: "#ffffff",
                  border: "1px dashed rgba(20,20,20,0.30)",
                  borderRadius: 12,
                  padding: 24,
                  width: "100%",
                  fontFamily: "Georgia, serif",
                  fontSize: 14,
                  color: "rgba(20,20,20,0.55)",
                  cursor: "pointer",
                }}
              >
                + Add your first client
              </button>
            </section>
          )}

          <section>
            <div
              style={{
                fontSize: 9.5,
                letterSpacing: "0.20em",
                textTransform: "uppercase",
                color: "rgba(20,20,20,0.45)",
                marginBottom: 10,
                fontFamily: "Figtree, sans-serif",
                fontWeight: 600,
              }}
            >
              Start with Robby
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {DASHBOARD_PROMPTS.map((p) => (
                <PromptCard
                  key={p.id}
                  icon={p.icon}
                  title={p.title}
                  description={p.description}
                  onClick={() => onPromptClick(p.id)}
                />
              ))}
            </div>
          </section>
        </>
      )}

      {activeClient && (
        <>
          <ActiveClientBreadcrumb clientName={activeClient.name} />
          <h1
            style={{
              fontSize: 26,
              fontWeight: 500,
              color: "#141414",
              letterSpacing: "-0.01em",
              marginBottom: 14,
              fontFamily: "'EB Garamond', Georgia, serif",
            }}
          >
            Robby's read on {activeClient.name}
          </h1>
          {getRobbyInsights(activeClient.name, pendingByClient[activeClient.id] ?? []).map((ins) => (
            <RobbyInsightRow
              key={ins.id}
              icon={ins.icon}
              text={ins.text}
              actionLabel={ins.actionLabel}
              onClick={() => onInsightClick(ins.prompt)}
            />
          ))}
        </>
      )}

    </div>
  );
}
