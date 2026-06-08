import type { ScriptLine } from "@/hooks/useScripts";

type LineType = ScriptLine["line_type"];

// Editorial-dark line-type colors. Shared by the unified editor (ScriptDocEditor)
// and the public read-only script view so they never drift.
// Line text is colored by its type to match the left bar.
export const TYPE_TEXT_CLASS: Record<LineType, string> = {
  filming:        "text-[#C2823F]",                 // orange
  actor:          "text-[hsl(var(--aqua))]",        // aqua
  editor:         "text-[#7FB58A]",                 // green
  text_on_screen: "text-[hsl(var(--bone) / 0.62)]", // muted
};

export const TYPE_BAR_CLASS: Record<LineType, string> = {
  filming:        "bg-[#A85B1F]",
  actor:          "bg-[hsl(var(--aqua))]",
  editor:         "bg-[#7FB58A]",
  text_on_screen: "bg-[hsl(var(--bone) / 0.40)]",
};
