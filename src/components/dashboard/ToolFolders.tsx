// src/components/dashboard/ToolFolders.tsx
//
// The three tool folders the dashboard surfaced before the agency
// redesign — Content Creation · Sales · Client Set Up. Kept here so
// users can still access every tool from the dashboard. Each folder
// is a sticker card with a list of sub-tool links. Routes scope to
// the active client when one is selected.

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
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
      // When no client is active, client-scoped tools land on /clients so the user
      // can pick one — instead of self-routing back to /dashboard (the old "looks
      // broken" behavior). Brand Setup keeps /onboarding (its agency-wide entry
      // point) and Database keeps /master-database (a real agency-level page).
      tools: [
        { label: "Content Strategy", icon: BarChart3,  path: c ? `/clients/${c}/strategy`         : "/clients" },
        { label: "Brand Setup",      icon: Sparkles,   path: c ? `/onboarding/${c}`               : "/onboarding" },
        { label: "Public Booking",   icon: Globe,      path: c ? `/clients/${c}/booking-settings` : "/clients" },
        { label: "Landing Page",     icon: Zap,        path: c ? `/clients/${c}/landing-page`     : "/clients" },
        { label: "Database",         icon: Database,   path: c ? `/clients/${c}/database`         : "/master-database" },
        { label: "Contracts",        icon: ScrollText, path: c ? `/clients/${c}/contracts`        : "/clients" },
        { label: "Social Accounts",  icon: Share2,     path: c ? `/clients/${c}/social-accounts`  : "/clients" },
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
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.45 }}
      style={{ marginTop: 28 }}
    >
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.20em",
          textTransform: "uppercase",
          color: "hsl(var(--ink-on-cream) / 0.45)",
          marginBottom: 10,
          fontFamily: "var(--font-body, Figtree), sans-serif",
          fontWeight: 600,
        }}
      >
        Tools{activeClientId ? "" : " — agency view"}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
        {folders.map((folder, idx) => (
          <motion.div
            key={folder.key}
            initial={{ opacity: 0, y: 14, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.45, ease: [0.34, 1.36, 0.64, 1], delay: 0.5 + idx * 0.07 }}
            whileHover={{ y: -2, x: -1 }}
            style={{
              background: "#ffffff",
              border: "1px solid hsl(var(--ink-on-cream))",
              boxShadow: "3px 3px 0 hsl(var(--ink-on-cream))",
              borderRadius: 12,
              padding: 14,
            }}
          >
            <div
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: "hsl(var(--ink-on-cream))",
                letterSpacing: "-0.005em",
                marginBottom: 8,
                fontFamily: "var(--font-display, 'EB Garamond'), Georgia, serif",
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
                      color: "hsl(var(--ink-on-cream) / 0.75)",
                      borderTop: "1px solid hsl(var(--ink-on-cream) / 0.06)",
                      transition: "color 120ms",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--ink-on-cream))"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.color = "hsl(var(--ink-on-cream) / 0.75)"; }}
                  >
                    <Icon size={13} strokeWidth={1.5} style={{ flexShrink: 0 }} />
                    <span>{tool.label}</span>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
