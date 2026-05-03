// supabase/functions/_shared/assistant/prompt.ts
import type {
  AssistantIdentity,
  AssistantMemory,
  AssistantMode,
  AssistantSurface,
} from "./types.ts";
import { buildIdentitySystemPrompt } from "./identity.ts";
import { formatMemoriesForPrompt } from "./memory.ts";

export interface CanvasContext {
  connectedNodeCount: number;
  connectedNodeTypes: string[];
}

export interface PageContext {
  path: string;
  activeClientId?: string | null;
}

export interface AssemblePromptParams {
  identity: AssistantIdentity;
  mode: AssistantMode;
  activeClientName?: string;
  memories: AssistantMemory[];
  surface: AssistantSurface;
  canvasContext?: CanvasContext;
  pageContext?: PageContext;
  /** Caller-provided extras (e.g. canvas's existing system prompt body, strategy data). */
  extras?: string[];
}

/**
 * Pure function — composes the system prompt from identity, mode, memory, surface, and extras.
 * No DB access. Easy to snapshot-test.
 */
export function assemblePromptSections(p: AssemblePromptParams): string {
  const sections: string[] = [];

  // 1. Identity
  sections.push(buildIdentitySystemPrompt(p.identity));

  // 2. Mode
  if (p.mode.mode === "agency") {
    sections.push(
      "You are operating in agency mode. Cross-client tools are available; per-client tools are not. " +
        "If the user asks for client-specific work, ask which client to switch to or use list_all_clients to surface options.",
    );
  } else {
    const name = p.activeClientName ?? "the active client";
    sections.push(
      `You are in client mode. Working on ${name} (clientId=${p.mode.clientId}). ` +
        "Client-specific tools are pre-scoped to this client; auto-fill any client_name argument with this client's name.",
    );
  }

  // 3. Memory
  const memoryText = formatMemoriesForPrompt(p.memories);
  if (memoryText) sections.push(memoryText);

  // 4. Surface context
  if (p.surface === "canvas") {
    const cnt = p.canvasContext?.connectedNodeCount ?? 0;
    const types = p.canvasContext?.connectedNodeTypes ?? [];
    const nodeBit = cnt === 0
      ? "No nodes are connected to your AI assistant node yet."
      : `${cnt} connected node${cnt === 1 ? "" : "s"} (${types.join(", ")}).`;
    sections.push(
      `You are rendered as the canvas AI assistant node. ${nodeBit} ` +
        "Use connected video transcripts and research notes as primary context for script generation.",
    );
  } else {
    sections.push(
      "You are rendered in the companion drawer. Concise replies. " +
        "If the user asks for full script editing, suggest opening the canvas — don't try to render canvas-specific UI here.",
    );
  }

  // 5. Page context
  if (p.pageContext) {
    sections.push(`Current page: ${p.pageContext.path}`);
  }

  // 6. Caller extras
  if (p.extras?.length) {
    sections.push(...p.extras);
  }

  return sections.join("\n\n");
}
