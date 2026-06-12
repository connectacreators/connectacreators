// src/components/dashboard/getRobbyInsights.ts
//
// Phase-1 deterministic Robby insights. Given a client's pending items,
// returns 0-3 RobbyInsight rows ready to render. Each row, when clicked,
// hands a prompt off to the AI drawer.

import type { ReactNode } from "react";
import { createElement, Fragment } from "react";
import { AlertCircle, Flame, BarChart3, type LucideIcon } from "lucide-react";
import type { PendingItem } from "@/hooks/useDashboardPendingItems";
import type { Language } from "@/hooks/useLanguage";
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

export function getRobbyInsights(clientName: string, pendingItems: PendingItem[], lang: Language = "en"): RobbyInsight[] {
  const es = lang === "es";
  const insights: RobbyInsight[] = [];

  const approveItem = pendingItems.find((p) => /to approve/i.test(p.label));
  if (approveItem) {
    const countMatch = approveItem.label.match(/^(\d+)/);
    const count = countMatch ? Number(countMatch[1]) : 1;
    insights.push({
      id: "approve",
      icon: AlertCircle,
      text: es
        ? createElement(
            Fragment,
            null,
            `${count} elemento${count === 1 ? "" : "s"} de `,
            createElement("strong", null, clientName),
            ` necesitan tu aprobación antes de publicarse. Vale una revisión de 30 segundos.`,
          )
        : createElement(
            Fragment,
            null,
            `${count} item${count === 1 ? "" : "s"} for `,
            createElement("strong", null, clientName),
            ` need your approval before going live. Worth a 30-second review.`,
          ),
      actionLabel: es ? "Abrir en el editor →" : "Open in editor →",
      prompt: `Show me what's pending approval for ${clientName} and summarize each item in one line.`,
    });
  }

  insights.push({
    id: "viral-angles",
    icon: Flame,
    text: es
      ? createElement(
          Fragment,
          null,
          `Hay ángulos en tendencia que encajan con el nicho de `,
          createElement("strong", null, clientName),
          ` ahora mismo. Puedo sacar los 3 mejores y redactar hooks.`,
        )
      : createElement(
          Fragment,
          null,
          `Trending angles match `,
          createElement("strong", null, clientName),
          `'s niche right now. I can pull the top 3 and draft hooks.`,
        ),
    actionLabel: es ? "Ver los hooks →" : "See the hooks →",
    prompt: findPrompt("viral-angles", clientName),
  });

  insights.push({
    id: "perf-audit",
    icon: BarChart3,
    text: es
      ? createElement(
          Fragment,
          null,
          `Puedo auditar `,
          createElement("strong", null, clientName),
          ` en los últimos 30 días y señalar qué está funcionando antes de que se enfríe.`,
        )
      : createElement(
          Fragment,
          null,
          `I can audit `,
          createElement("strong", null, clientName),
          `'s last 30 days and call out what's working before it cools off.`,
        ),
    actionLabel: es ? "Ejecutar la auditoría →" : "Run the audit →",
    prompt: findPrompt("audit-performance", clientName),
  });

  return insights;
}
