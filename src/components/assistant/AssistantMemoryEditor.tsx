// src/components/assistant/AssistantMemoryEditor.tsx
// Settings → "What <companion> remembers" — list/edit/delete assistant memories.
//
// Reads from `assistant_memories` (RLS scopes to auth.uid()). Two scopes:
//   - scope='user', client_id=null  — facts about the user (global)
//   - scope='client', client_id=...  — facts about a specific client
//
// RLS scopes every query to `auth.uid() = user_id`, so unqualified queries
// safely return only the caller's rows.

import { useEffect, useMemo, useState } from "react";
import { Brain, Loader2, Pencil, Trash2, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type MemoryRow = {
  id: string;
  user_id: string;
  scope: "user" | "client";
  client_id: string | null;
  key: string;
  value: string;
  source_thread_id: string | null;
  created_at: string;
  updated_at: string;
};

type ClientLite = { id: string; name: string };

export function AssistantMemoryEditor() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [memories, setMemories] = useState<MemoryRow[]>([]);
  const [clients, setClients] = useState<ClientLite[]>([]);

  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const [memRes, clientRes] = await Promise.all([
          supabase
            .from("assistant_memories")
            .select("id, user_id, scope, client_id, key, value, source_thread_id, created_at, updated_at")
            .eq("user_id", user.id)
            .order("scope", { ascending: true })
            .order("updated_at", { ascending: false }),
          supabase
            .from("clients")
            .select("id, name")
            .eq("user_id", user.id),
        ]);
        if (cancelled) return;
        if (memRes.error) throw memRes.error;
        setMemories((memRes.data ?? []) as MemoryRow[]);
        setClients(((clientRes.data ?? []) as any[]).map((c) => ({ id: c.id, name: c.name })));
      } catch (e: any) {
        if (!cancelled) toast.error(e.message || "Failed to load memories");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const groups = useMemo(() => {
    const userScope: MemoryRow[] = [];
    const byClient = new Map<string, MemoryRow[]>();
    for (const m of memories) {
      if (m.scope === "user" || !m.client_id) {
        userScope.push(m);
      } else {
        const list = byClient.get(m.client_id) ?? [];
        list.push(m);
        byClient.set(m.client_id, list);
      }
    }
    const clientNames = new Map(clients.map((c) => [c.id, c.name] as const));
    const clientGroups = Array.from(byClient.entries())
      .map(([clientId, rows]) => ({
        clientId,
        clientName: clientNames.get(clientId) ?? "Unknown client",
        rows,
      }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));
    return { userScope, clientGroups };
  }, [memories, clients]);

  const startEdit = (m: MemoryRow) => {
    setEditing({ id: m.id, value: m.value });
    setConfirmDeleteId(null);
  };

  const cancelEdit = () => setEditing(null);

  const saveEdit = async () => {
    if (!editing) return;
    const next = editing.value.trim();
    if (!next) {
      toast.error("Memory value can't be empty");
      return;
    }
    setSavingId(editing.id);
    try {
      const { error } = await supabase
        .from("assistant_memories")
        .update({ value: next, updated_at: new Date().toISOString() })
        .eq("id", editing.id);
      if (error) throw error;
      setMemories((prev) =>
        prev.map((m) => (m.id === editing.id ? { ...m, value: next, updated_at: new Date().toISOString() } : m))
      );
      setEditing(null);
      toast.success("Memory updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update memory");
    } finally {
      setSavingId(null);
    }
  };

  const requestDelete = (id: string) => {
    setConfirmDeleteId(id);
    setEditing(null);
  };

  const cancelDelete = () => setConfirmDeleteId(null);

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase
        .from("assistant_memories")
        .delete()
        .eq("id", id);
      if (error) throw error;
      setMemories((prev) => prev.filter((m) => m.id !== id));
      setConfirmDeleteId(null);
      toast.success("Memory forgotten");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete memory");
    } finally {
      setDeletingId(null);
    }
  };

  if (!user) return null;

  return (
    <div className="glass-card rounded-xl p-6 space-y-4 mt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">What your assistant remembers</h2>
        </div>
        {!loading && (
          <span className="text-xs text-muted-foreground">
            {memories.length} {memories.length === 1 ? "memory" : "memories"}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Facts your AI assistant has saved to make future answers more personal. You can edit or remove anything you don't want it to remember.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : memories.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing remembered yet. As you chat, the assistant will save important facts here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.userScope.length > 0 && (
            <MemoryGroup
              title="About you"
              subtitle="Used in every conversation, no matter which client you're working on."
              rows={groups.userScope}
              editing={editing}
              savingId={savingId}
              confirmDeleteId={confirmDeleteId}
              deletingId={deletingId}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onChangeEditValue={(v) => setEditing((e) => (e ? { ...e, value: v } : e))}
              onSaveEdit={saveEdit}
              onRequestDelete={requestDelete}
              onCancelDelete={cancelDelete}
              onConfirmDelete={confirmDelete}
            />
          )}

          {groups.clientGroups.map((g) => (
            <MemoryGroup
              key={g.clientId}
              title={`About ${g.clientName}`}
              subtitle={`Used only when you're working on ${g.clientName}.`}
              rows={g.rows}
              editing={editing}
              savingId={savingId}
              confirmDeleteId={confirmDeleteId}
              deletingId={deletingId}
              onStartEdit={startEdit}
              onCancelEdit={cancelEdit}
              onChangeEditValue={(v) => setEditing((e) => (e ? { ...e, value: v } : e))}
              onSaveEdit={saveEdit}
              onRequestDelete={requestDelete}
              onCancelDelete={cancelDelete}
              onConfirmDelete={confirmDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

type GroupProps = {
  title: string;
  subtitle: string;
  rows: MemoryRow[];
  editing: { id: string; value: string } | null;
  savingId: string | null;
  confirmDeleteId: string | null;
  deletingId: string | null;
  onStartEdit: (m: MemoryRow) => void;
  onCancelEdit: () => void;
  onChangeEditValue: (v: string) => void;
  onSaveEdit: () => void;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
};

function MemoryGroup({
  title,
  subtitle,
  rows,
  editing,
  savingId,
  confirmDeleteId,
  deletingId,
  onStartEdit,
  onCancelEdit,
  onChangeEditValue,
  onSaveEdit,
  onRequestDelete,
  onCancelDelete,
  onConfirmDelete,
}: GroupProps) {
  return (
    <div>
      <div className="mb-2">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
        {rows.map((m) => {
          const isEditing = editing?.id === m.id;
          const isConfirming = confirmDeleteId === m.id;
          const isSaving = savingId === m.id;
          const isDeleting = deletingId === m.id;

          return (
            <li key={m.id} className="px-4 py-3 bg-card/30 hover:bg-card/50 transition-colors">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                {humanizeKey(m.key)}
              </div>
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <textarea
                    value={editing.value}
                    onChange={(e) => onChangeEditValue(e.target.value)}
                    rows={3}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={onSaveEdit} disabled={isSaving} className="gap-1">
                      {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={onCancelEdit} disabled={isSaving}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-foreground flex-1 whitespace-pre-wrap break-words">{m.value}</p>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {isConfirming ? (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onConfirmDelete(m.id)}
                          disabled={isDeleting}
                          className="h-7 px-2 gap-1 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        >
                          {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={onCancelDelete}
                          disabled={isDeleting}
                          className="h-7 w-7 p-0"
                          aria-label="Cancel delete"
                        >
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onStartEdit(m)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          aria-label="Edit memory"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onRequestDelete(m.id)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
                          aria-label="Delete memory"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function humanizeKey(key: string): string {
  // "preferred_language" → "Preferred language"
  return key
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}
