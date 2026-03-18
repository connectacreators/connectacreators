import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Loader2, Search, Video, Plus, Trash2, Clapperboard, Star, UserPlus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { toast } from "sonner";

type MemberRole = "videographer" | "editor" | "connecta_plus";

type TeamMember = {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: MemberRole;
};

const ROLE_LABELS: Record<MemberRole, string> = {
  videographer: "Videographer",
  editor: "Editor",
  connecta_plus: "Connecta+",
};

const ROLE_COLORS: Record<MemberRole, string> = {
  videographer: "badge-cyan",
  editor: "badge-neutral",
  connecta_plus: "badge-amber",
};

const ROLE_ICONS: Record<MemberRole, React.ElementType> = {
  videographer: Video,
  editor: Clapperboard,
  connecta_plus: Star,
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function Videographers() {
  const { user, loading, isAdmin, signInWithEmail, signUpWithEmail } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newRole, setNewRole] = useState<MemberRole>("videographer");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [assignmentsMap, setAssignmentsMap] = useState<Record<string, { id: string; name: string }[]>>({});
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const [assignDialogMemberId, setAssignDialogMemberId] = useState<string | null>(null);
  const [pendingClientIds, setPendingClientIds] = useState<Set<string>>(new Set());
  const [savingAssignments, setSavingAssignments] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!user || !isAdmin) return;
    setLoadingList(true);

    // Get all team members (videographer, editor, connecta_plus)
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .in("role", ["videographer", "editor", "connecta_plus"]);

    if (roles && roles.length > 0) {
      const userIds = roles.map((r) => r.user_id);
      const roleMap = Object.fromEntries(roles.map((r) => [r.user_id, r.role as MemberRole]));

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .in("user_id", userIds);

      setMembers(
        (profiles || []).map((p) => ({
          user_id: p.user_id,
          display_name: p.display_name,
          email: p.email,
          role: roleMap[p.user_id] || "videographer",
        }))
      );

      // Load client assignments for all members
      if (userIds.length > 0) {
        const { data: assignments } = await supabase
          .from("videographer_clients")
          .select("videographer_user_id, client_id, clients(id, name)")
          .in("videographer_user_id", userIds);

        const map: Record<string, { id: string; name: string }[]> = {};
        (assignments || []).forEach((a: any) => {
          if (!map[a.videographer_user_id]) map[a.videographer_user_id] = [];
          if (a.clients) map[a.videographer_user_id].push({ id: a.clients.id, name: a.clients.name });
        });
        setAssignmentsMap(map);
      }
    } else {
      setMembers([]);
    }

    setLoadingList(false);
  }, [user, isAdmin]);

  useEffect(() => {
    if (!loading && user && isAdmin) {
      fetchMembers();
    } else if (!loading && user && !isAdmin) {
      navigate("/dashboard");
    }
  }, [loading, user, isAdmin, fetchMembers, navigate]);

  useEffect(() => {
    if (!user || !isAdmin) return;
    supabase
      .from("clients")
      .select("id, name")
      .order("name")
      .then(({ data }) => { if (data) setAllClients(data); });
  }, [user, isAdmin]);

  const handleSaveAssignments = async () => {
    if (!assignDialogMemberId) return;
    setSavingAssignments(true);
    try {
      // Delete all existing assignments for this member
      await supabase
        .from("videographer_clients")
        .delete()
        .eq("videographer_user_id", assignDialogMemberId);

      // Insert the new set
      if (pendingClientIds.size > 0) {
        const inserts = Array.from(pendingClientIds).map((clientId) => ({
          videographer_user_id: assignDialogMemberId,
          client_id: clientId,
        }));
        const { error } = await supabase.from("videographer_clients").insert(inserts);
        if (error) throw error;
      }

      // Update local state
      const newAssigned = allClients.filter((c) => pendingClientIds.has(c.id));
      setAssignmentsMap((prev) => ({ ...prev, [assignDialogMemberId]: newAssigned }));
      setAssignDialogMemberId(null);
      toast.success("Client assignments saved");
    } catch (e: any) {
      toast.error("Failed to save assignments");
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleCreate = async () => {
    if (!newEmail.trim() || !newPassword.trim() || !newFullName.trim()) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-videographer", {
        body: {
          email: newEmail.trim(),
          password: newPassword.trim(),
          full_name: newFullName.trim(),
          username: newFullName.trim().toLowerCase().replace(/\s+/g, "_"),
          role: newRole,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const roleLabel = ROLE_LABELS[newRole];
      toast.success(`${roleLabel} created successfully`);
      setNewEmail("");
      setNewPassword("");
      setNewFullName("");
      setNewRole("videographer");
      setShowCreateDialog(false);
      fetchMembers();
    } catch (e: any) {
      toast.error(e.message || "Error creating team member");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId: string) => {
    setDeletingId(userId);
    try {
      const { data, error } = await supabase.functions.invoke("create-videographer", {
        body: { user_id: userId },
        method: "DELETE",
      } as any);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Team member removed");
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    } catch (e: any) {
      toast.error(e.message || "Error removing team member");
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  if (!user) {
    return (
      <ScriptsLogin
        onSignIn={() => {}}
        signInWithEmail={signInWithEmail}
        signUpWithEmail={signUpWithEmail}
      />
    );
  }

  const filtered = members.filter(
    (m) =>
      (m.display_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (m.email || "").toLowerCase().includes(search.toLowerCase())
  );

  const memberToDelete = confirmDeleteId ? members.find((m) => m.user_id === confirmDeleteId) : null;

  return (

    <>
      <main className="flex-1 flex flex-col min-h-screen">

        <div className="flex-1 px-6 py-8 max-w-3xl mx-auto w-full">
          <motion.h1
            className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground mb-8 tracking-tight text-center"
            initial="hidden"
            animate="visible"
            custom={0}
            variants={fadeUp}
          >
            {language === "en" ? "Team Members" : "Miembros del Equipo"}
          </motion.h1>

          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={language === "en" ? "Search team members..." : "Buscar miembros del equipo..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button size="sm" onClick={() => setShowCreateDialog(true)} className="shrink-0">
              <Plus className="w-4 h-4 mr-1" />
              {language === "en" ? "Add Member" : "Agregar"}
            </Button>
          </div>

          {loadingList ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-20 text-sm">
              {language === "en" ? "No team members found" : "No se encontraron miembros del equipo"}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((member, i) => {
                const RoleIcon = ROLE_ICONS[member.role];
                return (
                  <motion.div
                    key={member.user_id}
                    className="w-full glass-card rounded-xl p-5 hover:border-primary/20 transition-colors flex items-center gap-3"
                    initial="hidden"
                    animate="visible"
                    custom={i + 1}
                    variants={fadeUp}
                  >
                    <button
                      onClick={() => navigate(`/videographers/${member.user_id}`)}
                      className="flex items-center gap-3 flex-1 text-left"
                    >
                      <div className="w-9 h-9 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                        <RoleIcon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="text-sm font-bold text-foreground">
                            {member.display_name || member.email || "Team Member"}
                          </h2>
                          <span className={`text-xs font-medium ${ROLE_COLORS[member.role]}`}>
                            {ROLE_LABELS[member.role]}
                          </span>
                        </div>
                        {member.email && (
                          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                        )}
                        {/* Assigned client chips */}
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(assignmentsMap[member.user_id] || []).slice(0, 3).map((c) => (
                            <span key={c.id} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                              {c.name}
                            </span>
                          ))}
                          {(assignmentsMap[member.user_id] || []).length > 3 && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border">
                              +{(assignmentsMap[member.user_id] || []).length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setAssignDialogMemberId(member.user_id);
                        setPendingClientIds(new Set((assignmentsMap[member.user_id] || []).map((c) => c.id)));
                      }}
                      title="Assign clients"
                    >
                      <UserPlus className="w-4 h-4" />
                    </Button>

                    <button
                      onClick={() => setConfirmDeleteId(member.user_id)}
                      disabled={deletingId === member.user_id}
                      className="shrink-0 p-2 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Remove team member"
                    >
                      {deletingId === member.user_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* Create Team Member Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Add Team Member" : "Agregar Miembro"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>{language === "en" ? "Member Type" : "Tipo de Miembro"}</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as MemberRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="videographer">
                    <div className="flex flex-col">
                      <span className="font-medium">Videographer</span>
                      <span className="text-xs text-muted-foreground">Access to clients & editing queue</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="editor">
                    <div className="flex flex-col">
                      <span className="font-medium">Editor</span>
                      <span className="text-xs text-muted-foreground">Access to assigned editing queues only</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="connecta_plus">
                    <div className="flex flex-col">
                      <span className="font-medium">Connecta+</span>
                      <span className="text-xs text-muted-foreground">Admin-managed client, no subscription needed</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{language === "en" ? "Full Name" : "Nombre Completo"}</Label>
              <Input
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder={language === "en" ? "Full name" : "Nombre completo"}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>{language === "en" ? "Password" : "Contraseña"}</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={language === "en" ? "Password" : "Contraseña"}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              {language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating || !newEmail.trim() || !newPassword.trim() || !newFullName.trim()}
            >
              {creating && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {language === "en" ? "Create" : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign Clients Dialog */}
      <Dialog open={!!assignDialogMemberId} onOpenChange={(open) => { if (!open) setAssignDialogMemberId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Assign Clients</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2 max-h-64 overflow-y-auto py-2">
            {allClients.map((client) => (
              <label key={client.id} className="flex items-center gap-2 cursor-pointer text-sm py-1 px-2 rounded hover:bg-muted">
                <input
                  type="checkbox"
                  checked={pendingClientIds.has(client.id)}
                  onChange={(e) => {
                    setPendingClientIds((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(client.id);
                      else next.delete(client.id);
                      return next;
                    });
                  }}
                  className="rounded"
                />
                {client.name}
              </label>
            ))}
            {allClients.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No clients found</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogMemberId(null)}>Cancel</Button>
            <Button onClick={handleSaveAssignments} disabled={savingAssignments}>
              {savingAssignments ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Remove Team Member?" : "¿Eliminar Miembro?"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {language === "en"
              ? `This will permanently delete the account for ${memberToDelete?.display_name || memberToDelete?.email || "this member"}. This cannot be undone.`
              : `Esto eliminará permanentemente la cuenta de ${memberToDelete?.display_name || memberToDelete?.email || "este miembro"}. Esta acción no se puede deshacer.`}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)}>
              {language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && handleDelete(confirmDeleteId)}
              disabled={!!deletingId}
            >
              {deletingId && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {language === "en" ? "Remove" : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
