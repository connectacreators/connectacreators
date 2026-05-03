// src/components/assistant/index.ts
// Barrel re-exports for the shared assistant components.
// Components added incrementally during Phase B.1.
export { AssistantThreadList } from "./AssistantThreadList.tsx";
export type {
  AssistantThreadListProps,
  ThreadListItem,
} from "./AssistantThreadList.tsx";
export { AssistantChat } from "./AssistantChat.tsx";
export type { AssistantChatProps } from "./AssistantChat.tsx";
export { AssistantTextInput } from "./AssistantTextInput.tsx";
export type {
  AssistantTextInputProps,
  MentionableNode,
  ModelOption,
  PromptPreset,
} from "./AssistantTextInput.tsx";
export { AssistantChipsBar } from "./AssistantChipsBar.tsx";
export type { AssistantChipsBarProps } from "./AssistantChipsBar.tsx";
export { AssistantContextPanel } from "./AssistantContextPanel.tsx";
export type {
  AssistantContextPanelProps,
  ContextNode,
} from "./AssistantContextPanel.tsx";
