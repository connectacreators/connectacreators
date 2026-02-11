import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type ScriptLine = {
  line_type: "filming" | "actor" | "editor";
  text: string;
};

export type Script = {
  id: string;
  client_id: string;
  title: string;
  raw_content: string;
  inspiration_url: string | null;
  created_at: string;
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
    inspirationUrl?: string
  ): Promise<ScriptLine[] | null> => {
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

      const { lines } = (await res.json()) as { lines: ScriptLine[] };

      // Save script
      const { data: script, error: scriptErr } = await supabase
        .from("scripts")
        .insert({ client_id: clientId, title, raw_content: rawContent, inspiration_url: inspirationUrl || null })
        .select()
        .single();
      if (scriptErr) throw scriptErr;

      // Save lines
      const lineRows = lines.map((l, i) => ({
        script_id: script.id,
        line_number: i + 1,
        line_type: l.line_type,
        text: l.text,
      }));
      const { error: linesErr } = await supabase
        .from("script_lines")
        .insert(lineRows);
      if (linesErr) throw linesErr;

      toast.success("Script guardado y categorizado");
      setScripts((prev) => [script, ...prev]);
      return lines;
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
      .select("line_type, text")
      .eq("script_id", scriptId)
      .order("line_number");
    if (error) {
      console.error(error);
      return [];
    }
    return (data || []) as ScriptLine[];
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
    inspirationUrl?: string
  ): Promise<ScriptLine[] | null> => {
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

      const { lines } = (await res.json()) as { lines: ScriptLine[] };

      // Update script
      const { error: scriptErr } = await supabase
        .from("scripts")
        .update({ title, raw_content: rawContent, inspiration_url: inspirationUrl || null })
        .eq("id", scriptId);
      if (scriptErr) throw scriptErr;

      // Delete old lines and insert new
      await supabase.from("script_lines").delete().eq("script_id", scriptId);
      const lineRows = lines.map((l, i) => ({
        script_id: scriptId,
        line_number: i + 1,
        line_type: l.line_type,
        text: l.text,
      }));
      const { error: linesErr } = await supabase.from("script_lines").insert(lineRows);
      if (linesErr) throw linesErr;

      toast.success("Script actualizado");
      setScripts((prev) =>
        prev.map((s) =>
          s.id === scriptId ? { ...s, title, raw_content: rawContent, inspiration_url: inspirationUrl || null } : s
        )
      );
      return lines;
    } catch (e) {
      console.error(e);
      toast.error("Error al actualizar script");
      return null;
    } finally {
      setLoading(false);
    }
  };

  return { scripts, loading, fetchScriptsByClient, categorizeAndSave, getScriptLines, deleteScript, updateScript };
}
