// src/components/dashboard/SingleBrandDashboard.tsx
//
// Dashboard for Connecta Plus subscribers and regular users (Dr Calvin's
// Clinic, etc.) — the classic 3-folder layout. Click a folder card to
// drill into its sub-tools, click "Back" to return.
//
// Dark grey background, off-white text. Cards are Graphite with subtle
// bone borders + bone offset shadow.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
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

// ─── Dark theme tokens ───
const BG = "#141414";              // Ink (page)
const CARD_BG = "#1F1F1F";         // Graphite (cards)
const BORDER = "rgba(234,230,220,0.14)";
const BORDER_STRONG = "rgba(234,230,220,0.22)";
const SHADOW = "rgba(234,230,220,0.18)";
const SHADOW_HOVER = "rgba(234,230,220,0.28)";
const TEXT = "#EAE6DC";            // Bone
const TEXT_MUTED = "rgba(234,230,220,0.60)";
const TEXT_SUBTLE = "rgba(234,230,220,0.45)";

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
    <div
      className="flex-1 flex flex-col items-center justify-center overflow-y-auto"
      style={{ background: BG, padding: "48px 28px", minHeight: "100%" }}
    >
      <div className="w-full max-w-4xl flex flex-col items-center">

        {/* Small Figtree subtitle: "Hi {brand} 👋" */}
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
          style={{
            fontSize: 13,
            color: TEXT_MUTED,
            marginBottom: 8,
            textAlign: "center",
            fontFamily: "Figtree, sans-serif",
            letterSpacing: "0.02em",
          }}
        >
          Hi {brandName ?? firstName}{" "}
          <motion.span
            style={{ display: "inline-block", transformOrigin: "70% 70%" }}
            animate={{ rotate: [0, 14, -8, 14, -4, 10, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 3, ease: "easeInOut" }}
          >
            👋
          </motion.span>
        </motion.p>

        {/* Big EB Garamond H1: "What do you want to do today?" */}
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94], delay: 0.1 }}
          style={{
            fontSize: 40,
            fontWeight: 500,
            color: TEXT,
            letterSpacing: "-0.015em",
            marginBottom: 40,
            fontFamily: "'EB Garamond', Georgia, serif",
            textAlign: "center",
          }}
        >
          What do you want to do today?
        </motion.h1>

        {/* Both views inside one AnimatePresence with proper keys so they swap cleanly */}
        <AnimatePresence mode="wait">
          {!folder ? (
            <motion.div
              key="folders"
              className="grid grid-cols-1 md:grid-cols-3 gap-5 w-full"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              {folders.map((f, idx) => {
                const Icon = f.icon;
                return (
                  <motion.button
                    key={f.key}
                    type="button"
                    onClick={() => setActiveFolder(f.key)}
                    className="text-left"
                    initial={{ opacity: 0, y: 20, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{
                      duration: 0.5,
                      delay: 0.15 + idx * 0.08,
                      ease: [0.34, 1.36, 0.64, 1],
                    }}
                    whileHover={{ y: -2, x: -1 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      background: CARD_BG,
                      border: `1px solid ${BORDER}`,
                      boxShadow: `3px 3px 0 ${SHADOW}`,
                      borderRadius: 14,
                      padding: 28,
                      cursor: "pointer",
                      minHeight: 200,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 12,
                      textAlign: "center",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      el.style.boxShadow = `5px 5px 0 ${SHADOW_HOVER}`;
                      el.style.borderColor = BORDER_STRONG;
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLButtonElement;
                      el.style.boxShadow = `3px 3px 0 ${SHADOW}`;
                      el.style.borderColor = BORDER;
                    }}
                  >
                    <motion.div
                      animate={{ rotate: [0, -3, 3, 0] }}
                      transition={{ duration: 4, repeat: Infinity, repeatDelay: 2 + idx * 0.5, ease: "easeInOut" }}
                    >
                      <Icon size={36} strokeWidth={1.5} color={TEXT} />
                    </motion.div>
                    <div
                      style={{
                        fontSize: 20,
                        fontWeight: 500,
                        color: TEXT,
                        letterSpacing: "-0.01em",
                        fontFamily: "'EB Garamond', Georgia, serif",
                      }}
                    >
                      {f.label}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: TEXT_MUTED,
                        lineHeight: 1.5,
                        fontFamily: "Figtree, sans-serif",
                        maxWidth: 220,
                      }}
                    >
                      {f.description}
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              key={`folder-${folder.key}`}
              className="w-full"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35 }}
            >
              <button
                type="button"
                onClick={() => setActiveFolder(null)}
                className="inline-flex items-center gap-1.5 mb-5"
                style={{
                  background: CARD_BG,
                  border: `1px solid ${BORDER_STRONG}`,
                  boxShadow: `1px 1px 0 ${SHADOW}`,
                  padding: "5px 12px",
                  borderRadius: 999,
                  fontSize: 12,
                  color: TEXT,
                  cursor: "pointer",
                  fontFamily: "Figtree, sans-serif",
                }}
              >
                <ChevronLeft size={13} strokeWidth={2} />
                Back
              </button>

              <div
                style={{
                  fontSize: 10,
                  letterSpacing: "0.20em",
                  textTransform: "uppercase",
                  color: TEXT_SUBTLE,
                  marginBottom: 12,
                  fontFamily: "Figtree, sans-serif",
                  fontWeight: 600,
                }}
              >
                {folder.label}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {folder.subCards.map((sub, idx) => {
                  const Icon = sub.icon;
                  return (
                    <motion.button
                      key={sub.label}
                      type="button"
                      onClick={() => navigate(sub.path)}
                      className="text-left"
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: idx * 0.05, ease: [0.25, 0.46, 0.45, 0.94] }}
                      whileHover={{ y: -1, x: -1 }}
                      whileTap={{ scale: 0.98 }}
                      style={{
                        background: CARD_BG,
                        border: `1px solid ${BORDER}`,
                        boxShadow: `2px 2px 0 ${SHADOW}`,
                        borderRadius: 12,
                        padding: 14,
                        cursor: "pointer",
                      }}
                      onMouseEnter={(e) => {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.boxShadow = `3px 3px 0 ${SHADOW_HOVER}`;
                        el.style.borderColor = BORDER_STRONG;
                      }}
                      onMouseLeave={(e) => {
                        const el = e.currentTarget as HTMLButtonElement;
                        el.style.boxShadow = `2px 2px 0 ${SHADOW}`;
                        el.style.borderColor = BORDER;
                      }}
                    >
                      <div style={{ height: 26, marginBottom: 6 }}>
                        <Icon size={20} strokeWidth={1.5} color={TEXT} />
                      </div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 500,
                          color: TEXT,
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
                          color: TEXT_MUTED,
                          lineHeight: 1.4,
                          fontFamily: "Figtree, sans-serif",
                        }}
                      >
                        {sub.description}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
