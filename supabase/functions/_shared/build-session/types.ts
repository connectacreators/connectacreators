// supabase/functions/_shared/build-session/types.ts

export type BuildStatus = "running" | "paused" | "completed" | "cancelled";

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
  phase: string;
  ideas: BuildIdea[];
  currentIdeaIndex: number;
  selectedIdeas: BuildIdea[];
  currentFrameworkVideoId: string | null;
  currentScriptDraft: string | null;
  currentScriptId: string | null;
  cachedCanvasContext: string | null;
  cachedCanvasContextAt: string | null;
  autoPilot: boolean;
  createdAt: string;
  updatedAt: string;
}
