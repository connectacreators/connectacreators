// supabase/functions/_shared/assistant/types.ts
// Shared TypeScript interfaces for the assistant subsystem.

export type AssistantOrigin = 'drawer' | 'canvas';
export type AssistantRole = 'user' | 'assistant' | 'tool';
export type MemoryScope = 'user' | 'client';

export interface AssistantIdentity {
  name: string;            // companion_state.companion_name (per client today)
  language: 'en' | 'es';
}

export interface AssistantMemory {
  id?: string;
  scope: MemoryScope;
  clientId?: string;       // required when scope='client'
  key: string;
  value: string;
}

export interface ThreadMeta {
  id: string;
  userId: string;
  clientId?: string | null;
  canvasNodeId?: string | null;
  origin: AssistantOrigin;
  title?: string | null;
  messageCount: number;
  lastMessageAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageContent =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'script_preview'; script: unknown };

export interface AssistantMessage {
  id?: string;
  threadId: string;
  role: AssistantRole;
  content: MessageContent;
  model?: string;
  createdAt?: string;
}

export type AssistantMode =
  | { mode: 'agency'; clientId: null }
  | { mode: 'client'; clientId: string };

export type AssistantSurface = 'drawer' | 'canvas';
