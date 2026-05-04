// supabase/functions/_shared/build-session/types.ts
import type { BuildStateName } from "../build-fsm/states.ts";

export type BuildStatus =
  | "running"
  | "awaiting_user"
  | "paused"
  | "completed"
  | "cancelled"
  | "error";

export interface BuildIdea {
  title: string;
  keywords?: string[];
  description?: string;
}

export interface BuildSession {
  id: string;
  userId: string;
  clientId: string;
  threadId: string;
  canvasStateId: string | null;
  status: BuildStatus;
  currentState: BuildStateName;
  ideas: BuildIdea[];
  currentIdeaIndex: number;
  selectedIdeas: BuildIdea[];
  currentFrameworkVideoId: string | null;
  currentScriptDraft: string | null;
  currentScriptId: string | null;
  cachedCanvasContext: string | null;
  cachedCanvasContextAt: string | null;
  userInput: string | null;
  autoPilot: boolean;
  errorMessage: string | null;
  tokenUsage: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
}
