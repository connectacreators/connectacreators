// Data + mutations for the in-page revision-review Action Surface on /ai.
// Mirrors EditingQueue.tsx's fetch/update patterns exactly (same table
// columns, same update-editing-status edge function for assignee, same
// lifecycleUpdate() dual-write) so this surface behaves identically to the
// real editing-queue page it stands in for — just without the navigation.
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  isLifecycleStatus,
  deriveFromLegacy,
  lifecycleUpdate,
  type LifecycleStatus,
} from "@/lib/lifecycleStatus";

export interface EditingReviewItem {
  id: string;
  clientId: string;
  clientName: string | null;
  title: string;
  lifecycleStatus: LifecycleStatus;
  assignee: string | null;
  assigneeUserId: string | null;
  uploadSource: string | null;
  storagePath: string | null;
  fileSubmissionUrl: string | null;
  footageUrl: string | null;
}

export interface TeamMember {
  user_id: string;
  display_name: string;
}

export function useEditingReviewItem(itemId: string, clientIdHint: string | null) {
  const { user } = useAuth();
  const [item, setItem] = useState<EditingReviewItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [clientAssignee, setClientAssignee] = useState<{ user_id: string; name: string } | null>(null);
  const [savingLifecycle, setSavingLifecycle] = useState(false);
  const [savingAssignee, setSavingAssignee] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchErr } = await supabase
      .from("video_edits")
      .select(
        "id, client_id, reel_title, status, post_status, lifecycle_status, assignee, assignee_user_id, upload_source, storage_path, file_submission, footage, script_id, scripts(title, idea_ganadora)",
      )
      .eq("id", itemId)
      .is("deleted_at", null)
      .maybeSingle();

    if (fetchErr || !data) {
      setError(fetchErr?.message || "Item not found.");
      setItem(null);
      setLoading(false);
      return;
    }

    const v = data as any;
    const title =
      v.scripts?.idea_ganadora ||
      v.scripts?.title ||
      (v.reel_title && v.reel_title !== "Sin titulo" && v.reel_title !== "Sin título" ? v.reel_title : null) ||
      "Untitled";

    let clientName: string | null = null;
    const { data: clientRow } = await supabase
      .from("clients")
      .select("name, user_id")
      .eq("id", v.client_id)
      .maybeSingle();
    if (clientRow) {
      clientName = clientRow.name;
      setClientAssignee(clientRow.user_id ? { user_id: clientRow.user_id, name: clientRow.name } : null);
    }

    setItem({
      id: v.id,
      clientId: v.client_id,
      clientName,
      title,
      lifecycleStatus: isLifecycleStatus(v.lifecycle_status) ? v.lifecycle_status : deriveFromLegacy(v.status, v.post_status),
      assignee: v.assignee || null,
      assigneeUserId: v.assignee_user_id || null,
      uploadSource: v.upload_source || null,
      storagePath: v.storage_path || null,
      fileSubmissionUrl: v.file_submission || null,
      footageUrl: v.footage || null,
    });
    setLoading(false);
  }, [itemId]);

  useEffect(() => {
    load();
  }, [load]);

  // Team members eligible as assignees — same admin/editor/videographer role
  // filter EditingQueue.tsx uses, so this surface offers the same roster.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: roleRows } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "editor", "videographer"]);
      const ids = Array.from(new Set([user.id, ...(roleRows || []).map((r: any) => r.user_id)]));
      if (!ids.length) {
        setTeamMembers([]);
        return;
      }
      const { data } = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
      setTeamMembers((data || []).filter((p: any) => p.display_name));
    })();
  }, [user]);

  const setLifecycle = useCallback(
    async (newLifecycle: LifecycleStatus) => {
      setSavingLifecycle(true);
      const { error: updErr } = await supabase.from("video_edits").update(lifecycleUpdate(newLifecycle)).eq("id", itemId);
      setSavingLifecycle(false);
      if (updErr) throw updErr;
      setItem((prev) => (prev ? { ...prev, lifecycleStatus: newLifecycle } : prev));
    },
    [itemId],
  );

  // Mirrors EditingQueue.tsx's own onStatusChanged handler: VideoReviewModal
  // writes the legacy `status` column directly when a comment is added or
  // resolved (it does not touch lifecycle_status), so this only updates
  // local display state from the derived value — no extra network write,
  // matching the source page exactly.
  const syncLifecycleFromLegacyStatus = useCallback((legacyStatus: string) => {
    setItem((prev) => (prev ? { ...prev, lifecycleStatus: deriveFromLegacy(legacyStatus, undefined) } : prev));
  }, []);

  const setAssignee = useCallback(
    async (userId: string | null) => {
      setSavingAssignee(true);
      const member = teamMembers.find((m) => m.user_id === userId);
      const asClient = userId && clientAssignee?.user_id === userId ? clientAssignee.name : null;
      const displayName = userId ? member?.display_name ?? asClient ?? "" : "";
      const res = await supabase.functions.invoke("update-editing-status", {
        body: { id: itemId, assignee: displayName || null, assignee_user_id: userId || null },
      });
      setSavingAssignee(false);
      if (res.error) throw res.error;
      setItem((prev) => (prev ? { ...prev, assignee: displayName || null, assigneeUserId: userId } : prev));
    },
    [itemId, teamMembers, clientAssignee],
  );

  return {
    item,
    loading,
    error,
    teamMembers,
    clientAssignee,
    savingLifecycle,
    savingAssignee,
    setLifecycle,
    syncLifecycleFromLegacyStatus,
    setAssignee,
    clientIdHint,
  };
}
