// supabase/functions/companion-chat/canvasReader.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/**
 * Read the active canvas for a client and return its content as a formatted string.
 * Extracted from build-tool-handlers.ts handleGetCanvasContext so both regular
 * companion-chat (Drawer/AI page) and build mode can use the same logic.
 */
export async function readCanvasContext(
  adminClient: SupabaseClient,
  clientId: string,
): Promise<string> {
  const { data: canvases, error: canvasErr } = await adminClient
    .from("canvas_states")
    .select("id, name, nodes")
    .eq("client_id", clientId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false });

  if (canvasErr) console.warn("[readCanvasContext] query failed:", canvasErr.message);
  if (!canvases || canvases.length === 0) {
    return "No active canvas found for this client.";
  }

  const canvas = canvases[0];
  const nodes = (canvas.nodes as any[]) ?? [];

  const textNodes = nodes.filter((n: any) => n.type === "textNoteNode");
  const researchNodes = nodes.filter((n: any) => n.type === "researchNoteNode");
  const mediaNodes = nodes.filter(
    (n: any) =>
      n.type === "mediaNode" &&
      (n.data?.fileType === "voice" || n.data?.fileType === "pdf") &&
      typeof n.data?.audioTranscription === "string",
  );

  const lines: string[] = [];
  // Hard cap on the total bytes we send back to Claude. Without this a single
  // packed canvas (12 text + 8 research + 6 transcripts at 800-1000 chars each)
  // can produce ~22k chars and crowd out the rest of the conversation context.
  const MAX_CHARS = 6000;
  let used = 0;
  let truncatedCount = 0;
  const pushLine = (line: string): boolean => {
    if (used + line.length + 1 > MAX_CHARS) {
      truncatedCount++;
      return false;
    }
    lines.push(line);
    used += line.length + 1;
    return true;
  };

  if (mediaNodes.length > 0) {
    pushLine("# Voice/PDF Transcripts:");
    for (const n of mediaNodes.slice(0, 6)) {
      const text = ((n.data?.audioTranscription as string) ?? "").slice(0, 1000);
      if (text.trim() && !pushLine(`- ${text}`)) break;
    }
  }

  if (textNodes.length > 0) {
    pushLine("# Text Notes:");
    for (const n of textNodes.slice(0, 12)) {
      const text = ((n.data?.noteText as string) ?? "").slice(0, 800);
      if (text.trim() && !pushLine(`- ${text}`)) break;
    }
  }

  if (researchNodes.length > 0) {
    pushLine("# Research Notes:");
    for (const n of researchNodes.slice(0, 8)) {
      const text = ((n.data?.text as string) ?? "").slice(0, 800);
      if (text.trim() && !pushLine(`- ${text}`)) break;
    }
  }

  if (truncatedCount > 0) {
    lines.push(`(…${truncatedCount} more note(s) omitted to stay within context budget)`);
  }

  if (lines.length === 0) {
    return `Canvas "${canvas.name ?? "untitled"}" is empty.`;
  }

  const summary = [
    mediaNodes.length > 0 ? `${mediaNodes.length} transcript(s)` : null,
    textNodes.length > 0 ? `${textNodes.length} text note(s)` : null,
    researchNodes.length > 0 ? `${researchNodes.length} research note(s)` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return `Canvas "${canvas.name ?? "untitled"}" — ${summary}.\n\n${lines.join("\n")}`;
}
