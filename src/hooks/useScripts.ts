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
};

export type ScriptMetadata = {
  idea_ganadora: string | null;
  target: string | null;
  formato: string | null;
  google_drive_link: string | null;
};

export function useScripts() {
  const [loading, setLoading] = useState(false);
  const [scripts, setScripts] = useState<Script[]>([]);

  const fetchScriptsByClient = async (clientId: string) => {
    const { data, error } = await supabase
      .from("scripts")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    if (error) {
      console.error(error);
      return;
    }
    setScripts(data || []);
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
      // Call AI to categorize
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/categorize-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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

      // Save script with metadata
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

      // Save lines
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

  const deleteScript = async (scriptId: string) => {
    const { error } = await supabase.from("scripts").delete().eq("id", scriptId);
    if (error) {
      toast.error("Error al eliminar script");
      console.error(error);
      return false;
    }
    setScripts((prev) => prev.filter((s) => s.id !== scriptId));
    toast.success("Script eliminado");
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
      // Re-categorize with AI
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/categorize-script`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
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

      // Update script
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

      // Delete old lines and insert new
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
    setScripts((prev) =>
      prev.map((s) => (s.id === scriptId ? { ...s, google_drive_link: link || null } : s))
    );
    toast.success("Link guardado");
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

  return {
    scripts,
    loading,
    fetchScriptsByClient,
    categorizeAndSave,
    getScriptLines,
    deleteScript,
    updateScript,
    updateGoogleDriveLink,
    toggleGrabado,
    updateScriptLine,
    deleteScriptLine,
    updateScriptLineType,
  };
}
