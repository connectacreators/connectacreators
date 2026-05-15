// src/components/dashboard/ToolFolders.tsx
//
// The three tool folders the dashboard surfaced before the agency
// redesign — Content Creation · Sales · Client Set Up. Kept here so
// users can still access every tool from the dashboard. Each folder
// is a sticker card with a list of sub-tool links. Routes scope to
// the active client when one is selected.

import { Link } from "react-router-dom";
import {
  Layers,
  FileText,
  Archive,
  Clapperboard,
  Calendar,
  Target,
  CalendarDays,
  BarChart3,
  Sparkles,
  Globe,
  Zap,
  Database,
  ScrollText,
  Share2,
  type LucideIcon,
} from "lucide-react";

interface ToolLink {
  label: string;
  icon: LucideIcon;
  path: string;
}

interface Folder {
  key: "content" | "sales" | "setup";
  label: string;
  tools: ToolLink[];
}

function buildFolders(clientId: string | null): Folder[] {
  const c = clientId; // local alias for readability
  return [
    {
      key: "content",
      label: "Content Creation",
      tools: [
        { label: "Super Canvas",     icon: Layers,       path: c ? `/clients/${c}/scripts?view=canvas` : "/scripts?view=canvas" },
        { label: "Scripts",          icon: FileText,     path: c ? `/clients/${c}/scripts`              : "/scripts" },
        { label: "Vault",            icon: Archive,      path: c ? `/clients/${c}/vault`                : "/vault" },
        { label: "Editing Queue",    icon: Clapperboard, path: c ? `/clients/${c}/editing-queue`        : "/editing-queue" },
        { label: "Content Calendar", icon: Calendar,     path: c ? `/clients/${c}/content-calendar`     : "/content-calendar" },
      ],
    },
    {
      key: "sales",
      label: "Sales",
      tools: [
        { label: "Lead Tracker",  icon: Target,       path: c ? `/clients/${c}/leads`         : "/leads" },
        { label: "Lead Calendar", icon: CalendarDays, path: c ? `/clients/${c}/lead-calendar` : "/lead-calendar" },
      ],
    },
    {
      key: "setup",
      label: "Client Set Up",
      tools: [
        { label: "Content Strategy", icon: BarChart3,  path: c ? `/clients/${c}/strategy`         : "/dashboard" },
        { label: "Brand Setup",      icon: Sparkles,   path: c ? `/onboarding/${c}`               : "/onboarding" },
        { label: "Public Booking",   icon: Globe,      path: c ? `/clients/${c}/booking-settings` : "/dashboard" },
        { label: "Landing Page",     icon: Zap,        path: c ? `/clients/${c}/landing-page`     : "/" },
        { label: "Database",         icon: Database,   path: c ? `/clients/${c}/database`         : "/master-database" },
        { label: "Contracts",        icon: ScrollText, path: c ? `/clients/${c}/contracts`        : "/dashboard" },
        { label: "Social Accounts",  icon: Share2,     path: c ? `/clients/${c}/social-accounts`  : "/dashboard" },
      ],
    },
  ];
}

interface ToolFoldersProps {
  activeClientId: string | null;
}

export function ToolFolders({ activeClientId }: ToolFoldersProps) {
  const folders = buildFolders(activeClientId);

  return (
    <section style={{ marginTop: 28 }}>
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
        Tools{activeClientId ? "" : " — agency view"}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {folders.map((folder) => (
          <div
            key={folder.key}
            style={{
              background: "#ffffff",
              border: "1px solid #141414",
              boxShadow: "3px 3px 0 #141414",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: "#141414",
                letterSpacing: "-0.005em",
                marginBottom: 8,
                fontFamily: "'EB Garamond', Georgia, serif",
              }}
            >
              {folder.label}
            </div>
            <div className="flex flex-col">
              {folder.tools.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link
                    key={tool.label}
                    to={tool.path}
                    className="flex items-center gap-2 py-1.5"
                    style={{
                      fontSize: 12,
                      color: "rgba(20,20,20,0.75)",
                      borderTop: "1px solid rgba(20,20,20,0.06)",
                      transition: "color 120ms",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "#141414"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(20,20,20,0.75)"; }}
                  >
                    <Icon size={13} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                    <span>{tool.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
