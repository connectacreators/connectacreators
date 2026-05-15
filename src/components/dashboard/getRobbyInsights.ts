// src/components/dashboard/getRobbyInsights.ts
//
// Phase-1 deterministic Robby insights. Given a client's pending items,
// returns 0-3 RobbyInsight rows ready to render. Each row, when clicked,
// hands a prompt off to the AI drawer.

import type { ReactNode } from "react";
import { createElement, Fragment } from "react";
import { AlertCircle, Flame, BarChart3, type LucideIcon } from "lucide-react";
import type { PendingItem } from "@/hooks/useDashboardPendingItems";
import { DASHBOARD_PROMPTS } from "./PROMPTS";

export interface RobbyInsight {
  id: string;
  icon: LucideIcon;
  text: ReactNode;
  actionLabel: string;
  /** Resolved prompt to send to the AI drawer (already includes client name). */
  prompt: string;
}

function findPrompt(id: string, clientName: string): string {
  const def = DASHBOARD_PROMPTS.find((p) => p.id === id);
  if (!def) return "";
  return def.prompt.replace(/\{client\}/g, clientName);
}

export function getRobbyInsights(clientName: string, pendingItems: PendingItem[]): RobbyInsight[] {
  const insights: RobbyInsight[] = [];

  const approveItem = pendingItems.find((p) => /to approve/i.test(p.label));
  if (approveItem) {
    const countMatch = approveItem.label.match(/^(\d+)/);
    const count = countMatch ? Number(countMatch[1]) : 1;
    insights.push({
      id: "approve",
      icon: AlertCircle,
      text: createElement(
        Fragment,
        null,
        `${count} item${count === 1 ? "" : "s"} for `,
        createElement("strong", null, clientName),
        ` need your approval before going live. Worth a 30-second review.`,
      ),
      actionLabel: "Open in editor →",
      prompt: `Show me what's pending approval for ${clientName} and summarize each item in one line.`,
    });
  }

  insights.push({
    id: "viral-angles",
    icon: Flame,
    text: createElement(
      Fragment,
      null,
      `Trending angles match `,
      createElement("strong", null, clientName),
      `'s niche right now. I can pull the top 3 and draft hooks.`,
    ),
    actionLabel: "See the hooks →",
    prompt: findPrompt("viral-angles", clientName),
  });

  insights.push({
    id: "perf-audit",
    icon: BarChart3,
    text: createElement(
      Fragment,
      null,
      `I can audit `,
      createElement("strong", null, clientName),
      `'s last 30 days and call out what's working before it cools off.`,
    ),
    actionLabel: "Run the audit →",
    prompt: findPrompt("audit-performance", clientName),
  });

  return insights;
}
