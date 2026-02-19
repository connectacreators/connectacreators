import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ScriptLine = {
  line_type: "filming" | "actor" | "editor";
  section: "hook" | "body" | "cta";
  text: string;
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
};

export type ScriptMetadata = {
  idea_ganadora: string | null;
  target: string | null;
  formato: string | null;
  google_drive_link: string | null;
};

// Fire-and-forget Notion sync helper
const syncToNotion = async (params: {
  script_id: string;
  client_id: string;
  title: string;
  google_drive_link?: string | null;
  action: "create" | "update";
}) => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-notion-script`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify(params),
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Notion sync error:", err);
    }
  } catch (e) {
    console.error("Notion sync failed:", e);
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
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setScripts(data || []);
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
        toast.error(err.error || "Error al categorizar");
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

      toast.success("Script guardado y categorizado");
      setScripts((prev) => [script, ...prev]);

      syncToNotion({
        script_id: script.id,
        client_id: clientId,
        title: result.idea_ganadora || title,
        google_drive_link: googleDriveLink || null,
        action: "create",
      });

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
      toast.error("Error al procesar script");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const getScriptLines = async (scriptId: string): Promise<ScriptLine[]> => {
    const { data, error } = await supabase
      .from("script_lines")
      .select("line_type, text, section")
      .eq("script_id", scriptId)
      .order("line_number");
    if (error) {
      console.error(error);
      return [];
    }
    return (data || []).map((d: any) => ({
      line_type: d.line_type,
      section: d.section || "body",
      text: d.text,
    })) as ScriptLine[];
  };

  // Soft delete — moves to trash
  const deleteScript = async (scriptId: string) => {
    const { error } = await supabase
      .from("scripts")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", scriptId);
    if (error) {
      toast.error("Error al mover a papelera");
      console.error(error);
      return false;
    }
    setScripts((prev) => prev.filter((s) => s.id !== scriptId));
    toast.success("Script movido a la papelera");
    return true;
  };

  // Restore from trash
  const restoreScript = async (scriptId: string) => {
    const { error } = await supabase
      .from("scripts")
      .update({ deleted_at: null })
      .eq("id", scriptId);
    if (error) {
      toast.error("Error al restaurar script");
      console.error(error);
      return false;
    }
    const restored = trashedScripts.find((s) => s.id === scriptId);
    setTrashedScripts((prev) => prev.filter((s) => s.id !== scriptId));
    if (restored) {
      setScripts((prev) => [{ ...restored, deleted_at: null }, ...prev]);
    }
    toast.success("Script restaurado");
    return true;
  };

  // Permanently delete
  const permanentlyDeleteScript = async (scriptId: string) => {
    const { error } = await supabase.from("scripts").delete().eq("id", scriptId);
    if (error) {
      toast.error("Error al eliminar permanentemente");
      console.error(error);
      return false;
    }
    setTrashedScripts((prev) => prev.filter((s) => s.id !== scriptId));
    toast.success("Script eliminado permanentemente");
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
      const { data: { session: updateSession } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/categorize-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${updateSession?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({ rawScript: rawContent }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Error al categorizar");
        return null;
      }

      const result = await res.json() as { lines: ScriptLine[]; idea_ganadora: string; target: string; formato: string };

      const { error: scriptErr } = await supabase
        .from("scripts")
        .update({
          title: result.idea_ganadora || title,
          raw_content: rawContent,
          inspiration_url: inspirationUrl || null,
          idea_ganadora: result.idea_ganadora || null,
          target: result.target || null,
          formato: result.formato || formato || null,
          google_drive_link: googleDriveLink || null,
        })
        .eq("id", scriptId);
      if (scriptErr) throw scriptErr;

      await supabase.from("script_lines").delete().eq("script_id", scriptId);
      const lineRows = result.lines.map((l, i) => ({
        script_id: scriptId,
        line_number: i + 1,
        line_type: l.line_type,
        section: l.section || "body",
        text: l.text,
      }));
      const { error: linesErr } = await supabase.from("script_lines").insert(lineRows);
      if (linesErr) throw linesErr;

      toast.success("Script actualizado");

      const currentScript = scripts.find(s => s.id === scriptId);

      setScripts((prev) =>
        prev.map((s) =>
          s.id === scriptId
            ? {
                ...s,
                title,
                raw_content: rawContent,
                inspiration_url: inspirationUrl || null,
                idea_ganadora: result.idea_ganadora || null,
                target: result.target || null,
                formato: result.formato || formato || null,
                google_drive_link: googleDriveLink || null,
              }
            : s
        )
      );

      if (currentScript) {
        syncToNotion({
          script_id: scriptId,
          client_id: currentScript.client_id,
          title: result.idea_ganadora || title,
          google_drive_link: googleDriveLink || null,
          action: "update",
        });
      }

      return {
        lines: result.lines,
        metadata: {
          idea_ganadora: result.idea_ganadora || null,
          target: result.target || null,
          formato: formato || null,
          google_drive_link: googleDriveLink || null,
        },
      };
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar script");
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateGoogleDriveLink = async (scriptId: string, link: string) => {
    const { error } = await supabase
      .from("scripts")
      .update({ google_drive_link: link || null })
      .eq("id", scriptId);
    if (error) {
      toast.error("Error al guardar link");
      return false;
    }
    
    const currentScript = scripts.find(s => s.id === scriptId);
    
    setScripts((prev) =>
      prev.map((s) => (s.id === scriptId ? { ...s, google_drive_link: link || null } : s))
    );
    toast.success("Link guardado");

    if (currentScript) {
      syncToNotion({
        script_id: scriptId,
        client_id: currentScript.client_id,
        title: currentScript.idea_ganadora || currentScript.title,
        google_drive_link: link || null,
        action: "update",
      });
    }

    return true;
  };

  const toggleGrabado = async (scriptId: string, grabado: boolean) => {
    const { error } = await supabase
      .from("scripts")
      .update({ grabado })
      .eq("id", scriptId);
    if (error) {
      toast.error("Error al actualizar estado");
      return false;
    }
    setScripts((prev) =>
      prev.map((s) => (s.id === scriptId ? { ...s, grabado } : s))
    );
    return true;
  };

  const updateScriptLine = async (scriptId: string, lineNumber: number, newText: string) => {
    const { error } = await supabase
      .from("script_lines")
      .update({ text: newText })
      .eq("script_id", scriptId)
      .eq("line_number", lineNumber);
    if (error) {
      toast.error("Error al actualizar línea");
      return false;
    }
    return true;
  };

  const deleteScriptLine = async (scriptId: string, lineNumber: number) => {
    const { error } = await supabase
      .from("script_lines")
      .delete()
      .eq("script_id", scriptId)
      .eq("line_number", lineNumber);
    if (error) {
      toast.error("Error al eliminar línea");
      return false;
    }
    // Renumber all remaining lines to close gaps
    const { data: remaining } = await supabase
      .from("script_lines")
      .select("line_number")
      .eq("script_id", scriptId)
      .order("line_number", { ascending: true });
    if (remaining) {
      for (let i = 0; i < remaining.length; i++) {
        const expected = i + 1;
        if (remaining[i].line_number !== expected) {
          await supabase
            .from("script_lines")
            .update({ line_number: expected })
            .eq("script_id", scriptId)
            .eq("line_number", remaining[i].line_number);
        }
      }
    }
    return true;
  };

  const updateScriptLineType = async (scriptId: string, lineNumber: number, newType: string) => {
    const { error } = await supabase
      .from("script_lines")
      .update({ line_type: newType })
      .eq("script_id", scriptId)
      .eq("line_number", lineNumber);
    if (error) {
      toast.error("Error al cambiar tipo de línea");
      return false;
    }
    return true;
  };

  const addScriptLine = async (scriptId: string, section: string, lineType: string, text: string) => {
    const { data: allLines } = await supabase
      .from("script_lines")
      .select("line_number, section")
      .eq("script_id", scriptId)
      .order("line_number", { ascending: true });

    const lines = allLines || [];
    const sectionOrder = { hook: 0, body: 1, cta: 2 } as Record<string, number>;
    const targetOrder = sectionOrder[section] ?? 1;

    let insertAfter = 0;
    for (const l of lines) {
      const lOrder = sectionOrder[l.section] ?? 1;
      if (lOrder <= targetOrder) {
        insertAfter = l.line_number;
      }
    }

    const insertAt = insertAfter + 1;

    const toShift = lines.filter((l) => l.line_number >= insertAt);
    for (const l of toShift.reverse()) {
      await supabase
        .from("script_lines")
        .update({ line_number: l.line_number + 1 })
        .eq("script_id", scriptId)
        .eq("line_number", l.line_number);
    }

    const { error } = await supabase.from("script_lines").insert({
      script_id: scriptId,
      line_number: insertAt,
      line_type: lineType,
      section,
      text,
    });
    if (error) {
      toast.error("Error al agregar línea");
      return null;
    }
    return insertAt;
  };

  // Batch reorder lines within a section after drag-and-drop
  const reorderSectionLines = async (scriptId: string, section: string, orderedLines: ScriptLine[]) => {
    // Get ALL lines to rebuild line_numbers
    const { data: allLines } = await supabase
      .from("script_lines")
      .select("line_number, section, line_type, text")
      .eq("script_id", scriptId)
      .order("line_number", { ascending: true });
    if (!allLines) return false;

    // Rebuild: keep non-target sections in place, replace target section with new order
    const otherLines = allLines.filter((l) => l.section !== section);
    const sectionOrder = { hook: 0, body: 1, cta: 2 } as Record<string, number>;
    const targetOrder = sectionOrder[section] ?? 1;

    // Find insertion point for the reordered section
    const rebuilt: { line_type: string; section: string; text: string }[] = [];
    let sectionInserted = false;
    for (const l of otherLines) {
      const lOrder = sectionOrder[l.section] ?? 1;
      if (!sectionInserted && lOrder > targetOrder) {
        rebuilt.push(...orderedLines.map((ol) => ({ line_type: ol.line_type, section: ol.section, text: ol.text })));
        sectionInserted = true;
      }
      rebuilt.push({ line_type: l.line_type, section: l.section, text: l.text });
    }
    if (!sectionInserted) {
      rebuilt.push(...orderedLines.map((ol) => ({ line_type: ol.line_type, section: ol.section, text: ol.text })));
    }

    // Delete all and re-insert in correct order
    await supabase.from("script_lines").delete().eq("script_id", scriptId);
    const rows = rebuilt.map((l, i) => ({
      script_id: scriptId,
      line_number: i + 1,
      line_type: l.line_type,
      section: l.section,
      text: l.text,
    }));
    const { error } = await supabase.from("script_lines").insert(rows);
    if (error) {
      toast.error("Error al reordenar");
      return false;
    }
    return true;
  };

  const moveScriptLine = async (scriptId: string, lineNumber: number, direction: "up" | "down") => {
    const { data: allLines } = await supabase
      .from("script_lines")
      .select("line_number, section")
      .eq("script_id", scriptId)
      .order("line_number", { ascending: true });
    if (!allLines) return false;

    const currentIndex = allLines.findIndex((l) => l.line_number === lineNumber);
    if (currentIndex === -1) return false;

    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (swapIndex < 0 || swapIndex >= allLines.length) return false;

    if (allLines[currentIndex].section !== allLines[swapIndex].section) return false;

    const otherLineNumber = allLines[swapIndex].line_number;

    const tempNum = 999999;
    await supabase.from("script_lines").update({ line_number: tempNum }).eq("script_id", scriptId).eq("line_number", lineNumber);
    await supabase.from("script_lines").update({ line_number: lineNumber }).eq("script_id", scriptId).eq("line_number", otherLineNumber);
    await supabase.from("script_lines").update({ line_number: otherLineNumber }).eq("script_id", scriptId).eq("line_number", tempNum);

    return true;
  };

  // Bulk sync all unsynced scripts to Notion
  const bulkSyncToNotion = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/bulk-sync-notion-scripts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token ?? import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.error("Bulk sync error:", err);
        toast.error("Error al sincronizar scripts");
        return false;
      }
      const result = await res.json();
      toast.success(`${result.synced || 0} scripts sincronizados con Notion`);
      return true;
    } catch (e) {
      console.error("Bulk sync failed:", e);
      toast.error("Error al sincronizar");
      return false;
    }
  };

  return {
    scripts,
    trashedScripts,
    loading,
    fetchScriptsByClient,
    fetchTrashedScripts,
    categorizeAndSave,
    getScriptLines,
    deleteScript,
    restoreScript,
    permanentlyDeleteScript,
    updateScript,
    updateGoogleDriveLink,
    toggleGrabado,
    updateScriptLine,
    deleteScriptLine,
    updateScriptLineType,
    addScriptLine,
    moveScriptLine,
    reorderSectionLines,
    bulkSyncToNotion,
  };
}
