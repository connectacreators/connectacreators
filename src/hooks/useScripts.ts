import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ScriptLine = {
  line_number: number;
  line_type: "filming" | "actor" | "editor" | "text_on_screen";
  section: "hook" | "body" | "cta";
  text: string;
  rich_text?: string;
};

export type Script = {
  id: string;
  client_id: string;
  title: string;
  raw_content: string;
  inspiration_url: string | null;
  idea_ganadora: string | null;
  target: string | null;
  formato: string | null;
  google_drive_link: string | null;
  grabado: boolean;
  created_at: string;
  deleted_at?: string | null;
  review_status?: 'approved' | 'needs_revision' | null;
  revision_notes?: string | null;
  caption?: string | null;
  folder_id?: string | null;
};

export type ScriptMetadata = {
  idea_ganadora: string | null;
  target: string | null;
  formato: string | null;
  google_drive_link: string | null;
};

// Mutex to prevent concurrent replaceAllLines from racing (delete-all + re-insert pattern)
const _locks = new Map<string, Promise<boolean>>();

// Helper: delete all lines for a script and re-insert them in order.
// This avoids 409 Conflict errors from unique constraint on (script_id, line_number).
// Uses a per-script mutex to prevent concurrent calls from wiping each other.
const replaceAllLines = async (scriptId: string, lines: { line_type: string; section: string; text: string; rich_text?: string }[]) => {
  // Wait for any in-flight operation on this script to finish
  const prev = _locks.get(scriptId);
  const op = (async () => {
    if (prev) await prev.catch(() => {});
    await supabase.from("script_lines").delete().eq("script_id", scriptId);
    if (lines.length === 0) return true;
    const rows = lines.map((l, i) => ({
      script_id: scriptId,
      line_number: i + 1,
      line_type: l.line_type,
      section: l.section,
      text: l.text,
      ...(l.rich_text !== undefined ? { rich_text: l.rich_text } : {}),
    }));
    const { error } = await supabase.from("script_lines").insert(rows);
    if (error) {
      console.error("replaceAllLines error:", error);
      return false;
    }
    return true;
  })();
  _locks.set(scriptId, op);
  const result = await op;
  // Clean up lock if we're still the latest
  if (_locks.get(scriptId) === op) _locks.delete(scriptId);
  return result;
};

// Save a snapshot of the current script lines into script_versions (for history)
const saveVersionSnapshot = async (scriptId: string) => {
  try {
    // Get current lines before the mutation
    const { data: currentLines } = await supabase
      .from("script_lines")
      .select("line_number, line_type, section, text")
      .eq("script_id", scriptId)
      .order("line_number");
    if (!currentLines || currentLines.length === 0) return;

    // Build raw_content from lines
    const rawContent = currentLines.map(l => l.text).join("\n");

    // Get next version number
    const { data: lastVersion } = await supabase
      .from("script_versions")
      .select("version_number")
      .eq("script_id", scriptId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextVersion = (lastVersion?.version_number ?? 0) + 1;

    await supabase.from("script_versions").insert({
      script_id: scriptId,
      version_number: nextVersion,
      raw_content: rawContent,
      lines_snapshot: currentLines,
    });
  } catch (e) {
    console.error("saveVersionSnapshot error:", e);
  }
};

export function useScripts() {
  const [loading, setLoading] = useState(false);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [trashedScripts, setTrashedScripts] = useState<Script[]>([]);

  const fetchScriptsByClient = async (clientId: string) => {
    const { data, error } = await supabase
      .from("scripts")
      .select("*")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .neq("status", "draft")
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setScripts(data || []);

    // Backfill: ensure every script has a video_edits row
    // Uses upsert with onConflict to prevent duplicates from concurrent calls
    if (data && data.length > 0) {
      try {
        const scriptIds = data.map((s: any) => s.id);
        const { data: existingEdits } = await supabase
          .from("video_edits")
          .select("script_id")
          .in("script_id", scriptIds)
          .is("deleted_at", null);
        const existingSet = new Set((existingEdits || []).map((e: any) => e.script_id));
        const missing = data.filter((s: any) => !existingSet.has(s.id));
        if (missing.length > 0) {
          const rows = missing.map((s: any) => ({
            client_id: clientId,
            script_id: s.id,
            reel_title: s.idea_ganadora || s.title || "Untitled",
            status: "Not started",
            script_url: `${window.location.origin}/s/${s.id}`,
            footage: s.google_drive_link || null,
            file_url: s.google_drive_link || "",
            post_status: "Unpublished",
          }));
          // onConflict on the partial unique index prevents duplicates if two calls race
          await supabase.from("video_edits").upsert(rows, { onConflict: "script_id", ignoreDuplicates: true });
          console.log(`[useScripts] Backfilled ${missing.length} video_edits rows`);
        }
      } catch (e) {
        console.error("[useScripts] video_edits backfill failed (non-fatal):", e);
      }
    }
  };

  const fetchTrashedScripts = async (clientId: string) => {
    const { data, error } = await supabase
      .from("scripts")
      .select("*")
      .eq("client_id", clientId)
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setTrashedScripts(data || []);
  };

  const directSave = async (params: {
    clientId: string;
    lines: ScriptLine[];
    ideaGanadora: string;
    target: string;
    formato: string;
    viralityScore?: number;
    inspirationUrl?: string;
    googleDriveLink?: string;
    existingScriptId?: string;
  }): Promise<{ scriptId: string; metadata: ScriptMetadata } | null> => {
    setLoading(true);
    try {
      if (!Array.isArray(params.lines) || params.lines.length === 0) {
        throw new Error("Script lines are required");
      }
      if (!params.ideaGanadora || params.ideaGanadora.trim() === "") {
        throw new Error("Script title (idea_ganadora) is required");
      }
      if (!params.clientId) {
        throw new Error("Client ID is required");
      }

      const rawContent = params.lines.map((l) => l.text).join("\n");

      let script: any;
      if (params.existingScriptId) {
        // Promote existing draft to complete
        const { data, error } = await supabase
          .from("scripts")
          .update({
            title: params.ideaGanadora,
            raw_content: rawContent,
            inspiration_url: params.inspirationUrl || null,
            idea_ganadora: params.ideaGanadora || null,
            target: params.target || null,
            formato: params.formato || null,
            google_drive_link: params.googleDriveLink || null,
            status: "complete",
            canvas_user_id: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", params.existingScriptId)
          .select()
          .single();
        if (error) throw error;
        script = data;
        // Delete old lines if any
        await supabase.from("script_lines").delete().eq("script_id", script.id);
      } else {
        const { data, error: scriptErr } = await supabase
          .from("scripts")
          .insert({
            client_id: params.clientId,
            title: params.ideaGanadora,
            raw_content: rawContent,
            inspiration_url: params.inspirationUrl || null,
            idea_ganadora: params.ideaGanadora || null,
            target: params.target || null,
            formato: params.formato || null,
            google_drive_link: params.googleDriveLink || null,
          })
          .select()
          .single();
        if (scriptErr) throw scriptErr;
        script = data;
      }

      const lineRows = params.lines.map((l, i) => ({
        script_id: script.id,
        line_number: i + 1,
        line_type: l.line_type,
        section: l.section || "body",
        text: l.text,
      }));
      const { error: linesErr } = await supabase.from("script_lines").insert(lineRows);
      if (linesErr) throw linesErr;

      toast.success("Script saved");
      setScripts((prev) => [script, ...prev]);

      // Auto-create or sync video_edits record for this script (upsert by script_id)
      try {
        const { data: existingEdit } = await supabase
          .from("video_edits")
          .select("id")
          .eq("script_id", script.id)
          .is("deleted_at", null)
          .maybeSingle();
        if (existingEdit) {
          await supabase.from("video_edits").update({
            reel_title: params.ideaGanadora || "Untitled",
            script_url: `${window.location.origin}/s/${script.id}`,
            footage: params.googleDriveLink || null,
          }).eq("id", existingEdit.id);
        } else {
          // upsert with ignoreDuplicates to prevent race condition duplicates
          await supabase.from("video_edits").upsert({
            client_id: params.clientId,
            script_id: script.id,
            reel_title: params.ideaGanadora || "Untitled",
            status: "Not started",
            script_url: `${window.location.origin}/s/${script.id}`,
            footage: params.googleDriveLink || null,
            file_url: params.googleDriveLink || "",
            post_status: "Unpublished",
          }, { onConflict: "script_id", ignoreDuplicates: true });
        }
      } catch (videoErr) {
        console.error("Auto-create/sync video_edits failed (non-fatal):", videoErr);
      }

      return {
        scriptId: script.id,
        metadata: {
          idea_ganadora: params.ideaGanadora || null,
          target: params.target || null,
          formato: params.formato || null,
          google_drive_link: params.googleDriveLink || null,
        },
      };
    } catch (e) {
      console.error(e);
      toast.error("Error processing script");
      return null;
    } finally {
      setLoading(false);
    }
  };

  // DEPRECATED: Use directSave instead
  const categorizeAndSave = async (
    clientId: string,
    title: string,
    rawContent: string,
    inspirationUrl?: string,
    formato?: string,
    googleDriveLink?: string
  ): Promise<{ lines: ScriptLine[]; metadata: ScriptMetadata; scriptId: string } | null> => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/categorize-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ rawScript: rawContent }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Error categorizing script");
        return null;
      }

      const result = await res.json() as { lines: ScriptLine[]; idea_ganadora: string; target: string; formato: string };

      const { data: script, error: scriptErr } = await supabase
        .from("scripts")
        .insert({
          client_id: clientId,
          title: result.idea_ganadora || title,
          raw_content: rawContent,
          inspiration_url: inspirationUrl || null,
          idea_ganadora: result.idea_ganadora || null,
          target: result.target || null,
          formato: result.formato || formato || null,
          google_drive_link: googleDriveLink || null,
        })
        .select()
        .single();
      if (scriptErr) throw scriptErr;

      const lineRows = result.lines.map((l, i) => ({
        script_id: script.id,
        line_number: i + 1,
        line_type: l.line_type,
        section: l.section || "body",
        text: l.text,
      }));
      const { error: linesErr } = await supabase.from("script_lines").insert(lineRows);
      if (linesErr) throw linesErr;

      toast.success("Script saved and categorized");
      setScripts((prev) => [script, ...prev]);

      return {
        lines: result.lines,
        metadata: {
          idea_ganadora: result.idea_ganadora || null,
          target: result.target || null,
          formato: result.formato || formato || null,
          google_drive_link: googleDriveLink || null,
        },
        scriptId: script.id,
      };
    } catch (e) {
      console.error(e);
      toast.error("Error processing script");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getScriptLines = async (scriptId: string): Promise<ScriptLine[]> => {
    const { data, error } = await supabase
      .from("script_lines")
      .select("line_number, line_type, text, section, rich_text")
      .eq("script_id", scriptId)
      .order("line_number");
    if (error) {
      console.error(error);
      return [];
    }
    return (data || []).map((d: any) => ({
      line_number: d.line_number,
      line_type: d.line_type,
      section: d.section || "body",
      text: d.text,
      rich_text: d.rich_text ?? undefined,
    })) as ScriptLine[];
  };

  const deleteScript = async (scriptId: string) => {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("scripts")
      .update({ deleted_at: now })
      .eq("id", scriptId);
    if (error) {
      toast.error("Error moving script to trash");
      console.error(error);
      return false;
    }
    // Cascade: also trash linked video_edit
    await supabase.from("video_edits").update({ deleted_at: now }).eq("script_id", scriptId);
    setScripts((prev) => prev.filter((s) => s.id !== scriptId));
    toast.success("Script moved to trash");
    return true;
  };

  const restoreScript = async (scriptId: string) => {
    const { error } = await supabase
      .from("scripts")
      .update({ deleted_at: null })
      .eq("id", scriptId);
    if (error) {
      toast.error("Error restoring script");
      console.error(error);
      return false;
    }
    // Cascade: also restore linked video_edit
    await supabase.from("video_edits").update({ deleted_at: null }).eq("script_id", scriptId);
    const restored = trashedScripts.find((s) => s.id === scriptId);
    setTrashedScripts((prev) => prev.filter((s) => s.id !== scriptId));
    if (restored) {
      setScripts((prev) => [{ ...restored, deleted_at: null }, ...prev]);
    }
    toast.success("Script restored");
    return true;
  };

  const permanentlyDeleteScript = async (scriptId: string) => {
    // Cascade: also permanently delete linked video_edit
    await supabase.from("video_edits").delete().eq("script_id", scriptId);
    const { error } = await supabase.from("scripts").delete().eq("id", scriptId);
    if (error) {
      toast.error("Error permanently deleting script");
      console.error(error);
      return false;
    }
    setTrashedScripts((prev) => prev.filter((s) => s.id !== scriptId));
    toast.success("Script permanently deleted");
    return true;
  };

  const updateScript = async (
    scriptId: string,
    title: string,
    rawContent: string,
    inspirationUrl?: string,
    formato?: string,
    googleDriveLink?: string
  ): Promise<{ lines: ScriptLine[]; metadata: ScriptMetadata } | null> => {
    setLoading(true);
    try {
      const { error: scriptErr } = await supabase
        .from("scripts")
        .update({
          title: title || "Sin título",
          raw_content: rawContent,
          inspiration_url: inspirationUrl || null,
          idea_ganadora: title || null,
          target: null,
          formato: formato || null,
          google_drive_link: googleDriveLink || null,
        })
        .eq("id", scriptId);
      if (scriptErr) throw scriptErr;

      const lines: ScriptLine[] = rawContent
        .split('\n')
        .filter(line => line.trim())
        .map(line => ({
          line_type: 'actor' as const,
          section: 'body' as const,
          text: line.trim(),
        }));

      const ok = await replaceAllLines(scriptId, lines);
      if (!ok) throw new Error("Failed to replace lines");

      // Sync title to linked video_edits record
      try {
        await supabase.from("video_edits").update({ reel_title: title || "Sin título" }).eq("script_id", scriptId);
      } catch (e) { console.error("Sync title to video_edits failed:", e); }

      toast.success("Script updated");

      setScripts((prev) =>
        prev.map((s) =>
          s.id === scriptId
            ? { ...s, title: title || "Sin título", raw_content: rawContent, inspiration_url: inspirationUrl || null, idea_ganadora: title || null, target: null, formato: formato || null, google_drive_link: googleDriveLink || null }
            : s
        )
      );

      return {
        lines,
        metadata: { idea_ganadora: title || null, target: null, formato: formato || null, google_drive_link: googleDriveLink || null },
      };
    } catch (e) {
      console.error(e);
      toast.error("Error updating script");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateGoogleDriveLink = async (scriptId: string, link: string) => {
    const { error } = await supabase.from("scripts").update({ google_drive_link: link || null }).eq("id", scriptId);
    if (error) { toast.error("Error saving link"); return false; }
    setScripts((prev) => prev.map((s) => (s.id === scriptId ? { ...s, google_drive_link: link || null } : s)));
    toast.success("Link saved");
    // Sync footage to linked video_edits record
    try {
      await supabase.from("video_edits").update({ footage: link || null }).eq("script_id", scriptId);
    } catch (e) { console.error("Sync footage to video failed:", e); }
    return true;
  };

  const toggleGrabado = async (scriptId: string, grabado: boolean) => {
    const { error } = await supabase.from("scripts").update({ grabado }).eq("id", scriptId);
    if (error) { toast.error("Error updating status"); return false; }
    setScripts((prev) => prev.map((s) => (s.id === scriptId ? { ...s, grabado } : s)));
    return true;
  };

  const updateScriptLine = async (scriptId: string, lineNumber: number, newText: string) => {
    if (lineNumber == null) { toast.error("Error updating line"); return false; }
    const { error } = await supabase.from("script_lines").update({ text: newText }).eq("script_id", scriptId).eq("line_number", lineNumber);
    if (error) { toast.error("Error updating line"); return false; }
    return true;
  };

  const deleteScriptLine = async (scriptId: string, lineNumber: number) => {
    if (lineNumber == null) { toast.error("Error deleting line"); return false; }

    // Save version snapshot before destructive operation
    await saveVersionSnapshot(scriptId);

    // Fetch all lines, remove the target, then replace all to avoid 409 conflicts
    const { data: allLines } = await supabase
      .from("script_lines")
      .select("line_number, line_type, section, text")
      .eq("script_id", scriptId)
      .order("line_number", { ascending: true });
    if (!allLines) return false;

    const remaining = allLines.filter(l => l.line_number !== lineNumber);
    const ok = await replaceAllLines(scriptId, remaining);
    if (!ok) { toast.error("Error deleting line"); return false; }
    return true;
  };

  const updateScriptLineType = async (scriptId: string, lineNumber: number, newType: string) => {
    if (lineNumber == null) return false;
    const { error } = await supabase.from("script_lines").update({ line_type: newType }).eq("script_id", scriptId).eq("line_number", lineNumber);
    if (error) { toast.error("Error changing line type"); return false; }
    return true;
  };

  const addScriptLine = async (scriptId: string, section: string, lineType: string, text: string): Promise<number | null> => {
    // Fetch all current lines
    const { data: allLines } = await supabase
      .from("script_lines")
      .select("line_number, line_type, section, text")
      .eq("script_id", scriptId)
      .order("line_number", { ascending: true });

    const lines = allLines || [];
    const sectionOrder: Record<string, number> = { hook: 0, body: 1, cta: 2 };
    const targetOrder = sectionOrder[section] ?? 1;

    // Find insert position: after the last line of this section (or earlier sections)
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if ((sectionOrder[lines[i].section] ?? 1) <= targetOrder) {
        insertIdx = i + 1;
      }
    }

    // Build new array with the new line inserted
    const newLines = [
      ...lines.slice(0, insertIdx).map(l => ({ line_type: l.line_type, section: l.section, text: l.text })),
      { line_type: lineType, section, text },
      ...lines.slice(insertIdx).map(l => ({ line_type: l.line_type, section: l.section, text: l.text })),
    ];

    const ok = await replaceAllLines(scriptId, newLines);
    if (!ok) { toast.error("Error adding line"); return null; }
    return insertIdx + 1; // 1-based line_number of the new line
  };

  // Reorder ALL lines of a script (supports cross-section drag & drop)
  const reorderAllLines = async (scriptId: string, orderedLines: ScriptLine[]) => {
    // Save version snapshot before destructive reorder
    await saveVersionSnapshot(scriptId);

    const ok = await replaceAllLines(scriptId, orderedLines.map(l => ({
      line_type: l.line_type,
      section: l.section,
      text: l.text,
    })));
    if (!ok) { toast.error("Error reordering lines"); return false; }
    return true;
  };

  // Batch reorder lines within a section after drag-and-drop
  const reorderSectionLines = async (scriptId: string, section: string, orderedLines: ScriptLine[]) => {
    // Get ALL lines to rebuild line_numbers
    const { data: allLines } = await supabase
      .from("script_lines")
      .select("line_number, section, line_type, text, rich_text")
      .eq("script_id", scriptId)
      .order("line_number", { ascending: true });
    if (!allLines) return false;

    // Rebuild: keep non-target sections in place, replace target section with new order
    const otherLines = allLines.filter((l) => l.section !== section);
    const sectionOrder = { hook: 0, body: 1, cta: 2 } as Record<string, number>;
    const targetOrder = sectionOrder[section] ?? 1;

    // Find insertion point for the reordered section
    const rebuilt: { line_type: string; section: string; text: string; rich_text?: string }[] = [];
    let sectionInserted = false;
    for (const l of otherLines) {
      const lOrder = sectionOrder[l.section] ?? 1;
      if (!sectionInserted && lOrder > targetOrder) {
        rebuilt.push(...orderedLines.map((ol) => ({ line_type: ol.line_type, section: ol.section, text: ol.text, rich_text: ol.rich_text })));
        sectionInserted = true;
      }
      rebuilt.push({ line_type: l.line_type, section: l.section, text: l.text, rich_text: l.rich_text ?? undefined });
    }
    if (!sectionInserted) {
      rebuilt.push(...orderedLines.map((ol) => ({ line_type: ol.line_type, section: ol.section, text: ol.text, rich_text: ol.rich_text })));
    }

    return replaceAllLines(scriptId, rebuilt);
  };

  const moveScriptLine = async (scriptId: string, lineNumber: number, direction: "up" | "down") => {
    const { data: allLines } = await supabase
      .from("script_lines")
      .select("line_number, section, line_type, text")
      .eq("script_id", scriptId)
      .order("line_number", { ascending: true });
    if (!allLines) return false;

    const currentIndex = allLines.findIndex((l) => l.line_number === lineNumber);
    if (currentIndex === -1) return false;

    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= allLines.length) return false;

    // Swap positions
    const reordered = [...allLines];
    [reordered[currentIndex], reordered[swapIndex]] = [reordered[swapIndex], reordered[currentIndex]];

    const ok = await replaceAllLines(scriptId, reordered);
    return ok;
  };

  const bulkToggleGrabado = async (scriptIds: string[], grabado: boolean) => {
    const { error } = await supabase.from("scripts").update({ grabado }).in("id", scriptIds);
    if (error) { toast.error("Error updating scripts"); return false; }
    setScripts((prev) => prev.map((s) => scriptIds.includes(s.id) ? { ...s, grabado } : s));
    toast.success(`${scriptIds.length} script${scriptIds.length !== 1 ? "s" : ""} marked as ${grabado ? "recorded" : "not recorded"}`);
    return true;
  };

  const bulkDelete = async (scriptIds: string[]) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("scripts").update({ deleted_at: now }).in("id", scriptIds);
    if (error) { toast.error("Error deleting scripts"); return false; }
    setScripts((prev) => prev.filter((s) => !scriptIds.includes(s.id)));
    toast.success(`${scriptIds.length} script${scriptIds.length !== 1 ? "s" : ""} moved to trash`);
    return true;
  };

  return {
    scripts,
    trashedScripts,
    loading,
    fetchScriptsByClient,
    fetchTrashedScripts,
    directSave,
    categorizeAndSave,
    getScriptLines,
    deleteScript,
    restoreScript,
    permanentlyDeleteScript,
    updateScript,
    updateGoogleDriveLink,
    toggleGrabado,
    bulkToggleGrabado,
    bulkDelete,
    updateScriptLine,
    deleteScriptLine,
    updateScriptLineType,
    addScriptLine,
    moveScriptLine,
    reorderSectionLines,
    reorderAllLines,
    updateReviewStatus,
  };

  async function updateReviewStatus(scriptId: string, status: 'approved' | 'needs_revision' | null, notes?: string | null) {
    const { error } = await supabase
      .from('scripts')
      .update({ review_status: status, revision_notes: status === 'needs_revision' ? (notes ?? null) : null })
      .eq('id', scriptId);
    if (error) throw error;
  }
}
