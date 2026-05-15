// src/components/dashboard/PROMPTS.ts
//
// The 6 AI quick prompt cards on the dashboard. Each card opens the
// AI drawer (CompanionDrawer) pre-loaded with `prompt` and the current
// active client context.

import {
  Anchor,
  FileText,
  Flame,
  CalendarDays,
  Clapperboard,
  BarChart3,
  type LucideIcon,
} from "lucide-react";

export interface DashboardPrompt {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Template — `{client}` is substituted at click time. */
  prompt: string;
}

export const DASHBOARD_PROMPTS: DashboardPrompt[] = [
  {
    id: "hooks",
    title: "Generate hooks",
    description: "3–5 viral hooks for the active client, tuned to their voice + niche",
    icon: Anchor,
    prompt: "Give me 5 hook ideas for {client} about a topic of your choice. Match their tone and use proven outlier formulas.",
  },
  {
    id: "script-from-notes",
    title: "Script from notes",
    description: "Drop talking points; get a polished reel script with hook, body, CTA",
    icon: FileText,
    prompt: "Turn the notes I paste next into a 45-second reel script for {client}. Hook, body, CTA structure.",
  },
  {
    id: "viral-angles",
    title: "Find viral angles",
    description: "Scan today's Viral Today for the client's niche; pull 3 angles worth remixing",
    icon: Flame,
    prompt: "Pull 3 trending angles from Viral Today that fit {client}'s niche. Tell me what's working and why.",
  },
  {
    id: "plan-week",
    title: "Plan the week",
    description: "Lay out next 7 days of posts across clients — mix formats, batch shoot days",
    icon: CalendarDays,
    prompt: "Plan the next 7 days of content across all clients. Group shoot days, mix formats, flag gaps.",
  },
  {
    id: "edit-feedback",
    title: "Edit feedback",
    description: "Critique a draft edit as a sales coach — pacing, hook strength, CTA punch",
    icon: Clapperboard,
    prompt: "Critique an edit for {client}. Pacing, hook strength, CTA — call out what to fix before posting.",
  },
  {
    id: "audit-performance",
    title: "Audit performance",
    description: "What's working? What to double-down on? Cuts through 30 days of data",
    icon: BarChart3,
    prompt: "Audit the last 30 days of {client}'s posts. What's working, what's not, what to double-down on.",
  },
];

/**
 * Substitute `{client}` in the prompt template. When no client is
 * scoped, use "across all clients" as a sensible fallback.
 */
export function renderPrompt(prompt: string, clientName: string | null): string {
  return prompt.replace(/\{client\}/g, clientName ?? "across all clients");
}
