import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// vault_folders + saved_videos.folder_id were added to prod after the Supabase
// TS types were generated, so the generated client doesn't know them. Cast
// through a loosely-typed handle for these calls (runtime schema is correct).
const db = supabase as any;

export interface VaultFolder {
  id: string;
  client_id: string;
  name: string;
  sort_order: number | null;
  created_at: string;
}

// Per-client folders for saved vault videos. Mirrors the script_folders model.
// Pass clientId = null to disable (e.g. master "All Clients" view where folders
// have no single owner).
export function useVaultFolders(clientId: string | null | undefined) {
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchFolders = useCallback(async () => {
    if (!clientId) { setFolders([]); return; }
    setLoading(true);
    const { data } = await db
      .from("vault_folders")
      .select("id, client_id, name, sort_order, created_at")
      .eq("client_id", clientId)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });
    setFolders((data as VaultFolder[]) ?? []);
    setLoading(false);
  }, [clientId]);

  useEffect(() => { void fetchFolders(); }, [fetchFolders]);

  const createFolder = useCallback(async (name: string): Promise<string | null> => {
    if (!clientId || !name.trim()) return null;
    const { data, error } = await db
      .from("vault_folders")
      .insert({ client_id: clientId, name: name.trim() })
      .select("id, client_id, name, sort_order, created_at")
      .single();
    if (error) { toast.error(`Couldn't create folder: ${error.message}`); return null; }
    setFolders((prev) => [...prev, data as VaultFolder]);
    return (data as VaultFolder).id;
  }, [clientId]);

  const renameFolder = useCallback(async (id: string, name: string) => {
    const clean = name.trim();
    if (!clean) return;
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name: clean } : f)));
    const { error } = await db.from("vault_folders").update({ name: clean }).eq("id", id);
    if (error) { toast.error("Couldn't rename folder"); void fetchFolders(); }
  }, [fetchFolders]);

  const deleteFolder = useCallback(async (id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    // folder_id on saved_videos is ON DELETE SET NULL — the videos un-file,
    // they are never deleted.
    const { error } = await db.from("vault_folders").delete().eq("id", id);
    if (error) { toast.error("Couldn't delete folder"); void fetchFolders(); }
  }, [fetchFolders]);

  return { folders, loading, fetchFolders, createFolder, renameFolder, deleteFolder };
}

// Move one or more saved_videos rows into a folder (or null to unfile).
export async function moveSavedToFolder(savedIds: string[], folderId: string | null): Promise<boolean> {
  if (savedIds.length === 0) return true;
  const { error } = await db.from("saved_videos").update({ folder_id: folderId }).in("id", savedIds);
  if (error) { toast.error("Couldn't move video"); return false; }
  return true;
}
