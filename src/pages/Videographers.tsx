import { useState, useEffect, useCallback } from "react";
import PageTransition from "@/components/PageTransition";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ScriptsLogin from "@/components/ScriptsLogin";
import { Loader2, Search, Video, Plus, Trash2, Clapperboard, Star, UserPlus, Settings, KeyRound, ShieldOff, ShieldCheck, LogOut, Copy, CheckCircle2, XCircle } from "lucide-react";
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

  // Manage modal state
  const [manageMemberId, setManageMemberId] = useState<string | null>(null);
  const [manageLoading, setManageLoading] = useState(false);
  const [manageActionLoading, setManageActionLoading] = useState<string | null>(null);
  const [manageUserData, setManageUserData] = useState<{
    id: string;
    email: string;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
    banned_until: string | null;
    user_metadata: Record<string, any>;
    created_at: string;
  } | null>(null);
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);

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

  // ─── Manage Modal Helpers ───

  const openManageModal = async (userId: string) => {
    setManageMemberId(userId);
    setManageLoading(true);
    setManageUserData(null);
    setLastTempPassword(null);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || "https://hxojqrilwhhrvloiwmfo.supabase.co"}/functions/v1/create-videographer?user_id=${userId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4b2pxcmlsd2hocnZsb2l3bWZvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE2NDI2ODIsImV4cCI6MjA4NzIxODY4Mn0.rE0InfGUiq-Xl7DSJVWoaem_zQ_LnIzhDFzzLQ5k54k",
          },
        }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setManageUserData(data);
    } catch (e: any) {
      toast.error(e.message || "Failed to load user details");
      setManageMemberId(null);
    } finally {
      setManageLoading(false);
    }
  };

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
    const arr = new Uint8Array(12);
    crypto.getRandomValues(arr);
    return Array.from(arr, (b) => chars[b % chars.length]).join("");
  };

  const handleResetPassword = async () => {
    if (!manageMemberId) return;
    setManageActionLoading("reset_password");
    const tempPw = generatePassword();
    try {
      const { data, error } = await supabase.functions.invoke("create-videographer", {
        body: { _action: "manage", action: "reset_password", user_id: manageMemberId, password: tempPw },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await navigator.clipboard.writeText(tempPw).catch(() => {});
      setLastTempPassword(tempPw);
      toast.success("Password reset & copied to clipboard");
    } catch (e: any) {
      toast.error(e.message || "Failed to reset password");
    } finally {
      setManageActionLoading(null);
    }
  };

  const handleToggleBan = async () => {
    if (!manageMemberId || !manageUserData) return;
    const isBanned = manageUserData.banned_until && new Date(manageUserData.banned_until) > new Date();
    setManageActionLoading("toggle_ban");
    try {
      const { data, error } = await supabase.functions.invoke("create-videographer", {
        body: { _action: "manage", action: "toggle_ban", user_id: manageMemberId, ban: !isBanned },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(isBanned ? "Account enabled" : "Account disabled");
      openManageModal(manageMemberId);
    } catch (e: any) {
      toast.error(e.message || "Failed to update account status");
    } finally {
      setManageActionLoading(null);
    }
  };

  const handleForceLogout = async () => {
    if (!manageMemberId) return;
    setManageActionLoading("force_logout");
    try {
      const { data, error } = await supabase.functions.invoke("create-videographer", {
        body: { _action: "manage", action: "force_logout", user_id: manageMemberId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("All sessions revoked");
    } catch (e: any) {
      toast.error(e.message || "Failed to force logout");
    } finally {
      setManageActionLoading(null);
    }
  };

  const manageMember = manageMemberId ? members.find((m) => m.user_id === manageMemberId) : null;
  const isBanned = manageUserData?.banned_until ? new Date(manageUserData.banned_until) > new Date() : false;

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
      <PageTransition className="flex-1 flex flex-col min-h-screen">

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
                      onClick={() => openManageModal(member.user_id)}
                      title="Manage credentials"
                    >
                      <Settings className="w-4 h-4" />
                    </Button>

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
      </PageTransition>

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

      {/* Manage Credentials Modal */}
      <Dialog open={!!manageMemberId} onOpenChange={(open) => { if (!open) { setManageMemberId(null); setManageUserData(null); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              {language === "en" ? "Manage Member" : "Gestionar Miembro"}
            </DialogTitle>
          </DialogHeader>

          {manageLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : manageUserData && manageMember ? (
            <div className="space-y-5 py-2">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                  {(() => { const Icon = ROLE_ICONS[manageMember.role]; return <Icon className="w-5 h-5 text-muted-foreground" />; })()}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm">{manageMember.display_name || "Team Member"}</h3>
                  <p className="text-xs text-muted-foreground truncate">{manageUserData.email}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[10px] font-medium ${ROLE_COLORS[manageMember.role]}`}>
                      {ROLE_LABELS[manageMember.role]}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Created {new Date(manageUserData.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Account Status */}
              <div className="space-y-2 p-3 rounded-lg bg-muted/50 border border-border">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {language === "en" ? "Account Status" : "Estado de la Cuenta"}
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Last Login:</span>
                  </div>
                  <div className="font-medium">
                    {manageUserData.last_sign_in_at
                      ? new Date(manageUserData.last_sign_in_at).toLocaleString()
                      : "Never"}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Email Verified:</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {manageUserData.email_confirmed_at ? (
                      <><CheckCircle2 className="w-3 h-3 text-green-500" /> <span className="text-green-600 font-medium">Yes</span></>
                    ) : (
                      <><XCircle className="w-3 h-3 text-red-400" /> <span className="text-red-400 font-medium">No</span></>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground">Account:</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {isBanned ? (
                      <><ShieldOff className="w-3 h-3 text-red-400" /> <span className="text-red-400 font-medium">Disabled</span></>
                    ) : (
                      <><ShieldCheck className="w-3 h-3 text-green-500" /> <span className="text-green-600 font-medium">Enabled</span></>
                    )}
                  </div>

                  {manageUserData.user_metadata?.force_password_change && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Password:</span>
                      </div>
                      <div className="text-amber-500 font-medium flex items-center gap-1">
                        <KeyRound className="w-3 h-3" /> Must change
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Temp Password Display */}
              {lastTempPassword && (
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 space-y-1.5">
                  <h4 className="text-xs font-semibold text-green-600">
                    {language === "en" ? "Temporary Password" : "Contraseña Temporal"}
                  </h4>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono bg-background/80 px-2 py-1 rounded border border-border select-all">
                      {lastTempPassword}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 shrink-0"
                      onClick={() => { navigator.clipboard.writeText(lastTempPassword); toast.success("Copied"); }}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {language === "en"
                      ? "User must change this on next login. Share it securely."
                      : "El usuario debe cambiarla en su próximo inicio de sesión."}
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {language === "en" ? "Actions" : "Acciones"}
                </h4>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={handleResetPassword}
                  disabled={manageActionLoading === "reset_password"}
                >
                  {manageActionLoading === "reset_password" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <KeyRound className="w-4 h-4" />
                  )}
                  {language === "en" ? "Reset Password" : "Restablecer Contraseña"}
                </Button>
                <p className="text-[10px] text-muted-foreground ml-6">
                  {language === "en"
                    ? "Generates a temp password, copies to clipboard. Use Force Logout below if user is currently active."
                    : "Genera contraseña temporal, copia al portapapeles. Usa Forzar Cierre si el usuario está activo."}
                </p>

                <Button
                  variant="outline"
                  size="sm"
                  className={`w-full justify-start gap-2 ${isBanned ? "border-green-500/30 text-green-600 hover:bg-green-500/10" : "border-red-500/30 text-red-500 hover:bg-red-500/10"}`}
                  onClick={handleToggleBan}
                  disabled={manageActionLoading === "toggle_ban"}
                >
                  {manageActionLoading === "toggle_ban" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isBanned ? (
                    <ShieldCheck className="w-4 h-4" />
                  ) : (
                    <ShieldOff className="w-4 h-4" />
                  )}
                  {isBanned
                    ? (language === "en" ? "Enable Account" : "Habilitar Cuenta")
                    : (language === "en" ? "Disable Account" : "Deshabilitar Cuenta")}
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                  onClick={handleForceLogout}
                  disabled={manageActionLoading === "force_logout"}
                >
                  {manageActionLoading === "force_logout" ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogOut className="w-4 h-4" />
                  )}
                  {language === "en" ? "Force Logout" : "Forzar Cierre de Sesión"}
                </Button>
              </div>
            </div>
          ) : null}
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
