// src/components/dashboard/SingleBrandDashboard.tsx
//
// Dashboard for Connecta Plus subscribers and regular users (Dr Calvin's
// Clinic, etc.) — the classic 3-folder layout. Click a folder card to
// drill into its sub-tools, click "Back" to return.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Sparkles,
  BarChart3,
  Settings2,
  ChevronLeft,
  Layers,
  FileText,
  Archive,
  Clapperboard,
  Calendar,
  Target,
  CalendarDays,
  Globe,
  Zap,
  Database,
  ScrollText,
  Share2,
  type LucideIcon,
} from "lucide-react";

type FolderKey = "content" | "sales" | "setup";

interface SubCard {
  label: string;
  description: string;
  icon: LucideIcon;
  path: string;
}

interface Folder {
  key: FolderKey;
  label: string;
  description: string;
  icon: LucideIcon;
  subCards: SubCard[];
}

function buildFolders(clientId: string | null): Folder[] {
  const c = clientId;
  return [
    {
      key: "content",
      label: "Content Creation",
      description: "Scripts · Vault · Editing Queue · Content Calendar",
      icon: Sparkles,
      subCards: [
        { label: "Super Canvas",     description: "AI-powered script planning canvas",   icon: Layers,       path: c ? `/clients/${c}/scripts?view=canvas` : "/scripts?view=canvas" },
        { label: "Scripts",          description: "View and manage scripts",             icon: FileText,     path: c ? `/clients/${c}/scripts`              : "/scripts" },
        { label: "Vault",            description: "Script templates from viral videos",  icon: Archive,      path: c ? `/clients/${c}/vault`                : "/vault" },
        { label: "Editing Queue",    description: "Track video production status",       icon: Clapperboard, path: c ? `/clients/${c}/editing-queue`        : "/editing-queue" },
        { label: "Content Calendar", description: "Schedule & approve posts",            icon: Calendar,     path: c ? `/clients/${c}/content-calendar`     : "/content-calendar" },
      ],
    },
    {
      key: "sales",
      label: "Sales",
      description: "Lead Tracker · Lead Calendar",
      icon: BarChart3,
      subCards: [
        { label: "Lead Tracker",  description: "Track incoming leads",  icon: Target,       path: c ? `/clients/${c}/leads`         : "/leads" },
        { label: "Lead Calendar", description: "Calendar view of leads", icon: CalendarDays, path: c ? `/clients/${c}/lead-calendar` : "/lead-calendar" },
      ],
    },
    {
      key: "setup",
      label: "Client Set Up",
      description: "Onboarding · Booking · Landing Page · Database",
      icon: Settings2,
      subCards: [
        { label: "Content Strategy", description: "Goals, mix, ManyChat & fulfillment score", icon: BarChart3,  path: c ? `/clients/${c}/strategy`         : "/dashboard" },
        { label: "Brand Setup",      description: "Complete client onboarding form",          icon: Sparkles,   path: c ? `/onboarding/${c}`               : "/onboarding" },
        { label: "Public Booking",   description: "Calendly-style public calendar",           icon: Globe,      path: c ? `/clients/${c}/booking-settings` : "/dashboard" },
        { label: "Landing Page",     description: "Build your custom landing page",           icon: Zap,        path: c ? `/clients/${c}/landing-page`     : "/" },
        { label: "Database",         description: "Direct database access",                   icon: Database,   path: c ? `/clients/${c}/database`         : "/dashboard" },
        { label: "Contracts",        description: "Upload, sign & send contracts",            icon: ScrollText, path: c ? `/clients/${c}/contracts`        : "/dashboard" },
        { label: "Social Accounts",  description: "Connect Facebook & Instagram for scheduling", icon: Share2,  path: c ? `/clients/${c}/social-accounts`  : "/dashboard" },
      ],
    },
  ];
}

interface SingleBrandDashboardProps {
  firstName: string;
  brandName: string | null;
  clientId: string | null;
}

export function SingleBrandDashboard({ firstName, brandName, clientId }: SingleBrandDashboardProps) {
  const navigate = useNavigate();
  const [activeFolder, setActiveFolder] = useState<FolderKey | null>(null);

  const folders = buildFolders(clientId);
  const folder = folders.find((f) => f.key === activeFolder) ?? null;

  return (
    <div className="min-h-screen" style={{ background: "#EAE6DC", padding: "22px 28px" }}>
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
        Hi {brandName ?? firstName}.
      </h1>
      <p style={{ fontSize: 14, color: "rgba(20,20,20,0.55)", marginBottom: 28 }}>
        What do you want to do today?
      </p>

      {/* ── No folder open: show 3 big folder cards ── */}
      {!folder && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {folders.map((f) => {
            const Icon = f.icon;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setActiveFolder(f.key)}
                className="text-left transition-transform duration-150"
                style={{
                  background: "#ffffff",
                  border: "1px solid #141414",
                  boxShadow: "3px 3px 0 #141414",
                  borderRadius: 14,
                  padding: 20,
                  cursor: "pointer",
                  minHeight: 160,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.boxShadow = "4px 4px 0 #141414";
                  el.style.transform = "translate(-1px, -1px)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLButtonElement;
                  el.style.boxShadow = "3px 3px 0 #141414";
                  el.style.transform = "translate(0, 0)";
                }}
              >
                <Icon size={28} strokeWidth={1.5} color="#141414" />
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 500,
                    color: "#141414",
                    letterSpacing: "-0.01em",
                    fontFamily: "'EB Garamond', Georgia, serif",
                  }}
                >
                  {f.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "rgba(20,20,20,0.55)",
                    lineHeight: 1.45,
                    fontFamily: "Figtree, sans-serif",
                    maxWidth: 220,
                  }}
                >
                  {f.description}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Folder opened: back button + sub-cards ── */}
      {folder && (
        <>
          <button
            type="button"
            onClick={() => setActiveFolder(null)}
            className="inline-flex items-center gap-1.5 mb-5"
            style={{
              background: "#ffffff",
              border: "1px solid #141414",
              boxShadow: "1px 1px 0 #141414",
              padding: "5px 12px",
              borderRadius: 999,
              fontSize: 12,
              color: "#141414",
              cursor: "pointer",
              fontFamily: "Figtree, sans-serif",
            }}
          >
            <ChevronLeft size={13} strokeWidth={2} />
            Back
          </button>

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
            {folder.label}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {folder.subCards.map((sub) => {
              const Icon = sub.icon;
              return (
                <button
                  key={sub.label}
                  type="button"
                  onClick={() => navigate(sub.path)}
                  className="text-left transition-transform duration-150"
                  style={{
                    background: "#ffffff",
                    border: "1px solid #141414",
                    boxShadow: "2px 2px 0 #141414",
                    borderRadius: 12,
                    padding: 14,
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.boxShadow = "3px 3px 0 #141414";
                    el.style.transform = "translate(-1px, -1px)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLButtonElement;
                    el.style.boxShadow = "2px 2px 0 #141414";
                    el.style.transform = "translate(0, 0)";
                  }}
                >
                  <div style={{ height: 26, marginBottom: 6 }}>
                    <Icon size={20} strokeWidth={1.5} color="#141414" />
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: "#141414",
                      letterSpacing: "-0.005em",
                      marginBottom: 3,
                      fontFamily: "'EB Garamond', Georgia, serif",
                    }}
                  >
                    {sub.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "rgba(20,20,20,0.55)",
                      lineHeight: 1.4,
                      fontFamily: "Figtree, sans-serif",
                    }}
                  >
                    {sub.description}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
