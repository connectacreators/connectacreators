import { useEffect, useState, useCallback } from "react";
import PageTransition from "@/components/PageTransition";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2, Plus, Edit2, Trash2, BookOpen, Save, User, Tag,
  Globe, Lock, Bold, Italic, List, ListOrdered, Heading2, Heading3,
  AlignLeft, AlignCenter, AlignRight, Link, Undo, Redo, ArrowLeft,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import Link2 from "@tiptap/extension-link";

interface Training {
  id: string;
  title: string;
  content: string;
  assigned_to_user_id: string | null;
  created_by: string | null;
  category: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  assignee_name?: string;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
}

const CATEGORIES = ["General", "Editing", "Scripts", "Client Management", "Marketing", "Other"];

// ── Rich Text Toolbar ──────────────────────────────────────────────────────────

function EditorToolbar({ editor }: { editor: any }) {
  if (!editor) return null;

  const btn = (active: boolean, onClick: () => void, icon: React.ReactNode, title?: string) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded transition-colors ${active ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-accent/10"}`}
    >
      {icon}
    </button>
  );

  const handleLink = () => {
    const prev = editor.getAttributes("link").href || "";
    const url = window.prompt("URL:", prev);
    if (url === null) return;
    if (url === "") { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().setLink({ href: url }).run();
  };

  return (
    <div className="flex items-center flex-wrap gap-0.5 px-2 py-1.5 border-b border-border/40 bg-card/50">
      {btn(false, () => editor.chain().focus().undo().run(), <Undo className="w-3.5 h-3.5" />, "Undo")}
      {btn(false, () => editor.chain().focus().redo().run(), <Redo className="w-3.5 h-3.5" />, "Redo")}
      <span className="w-px h-4 bg-border/50 mx-1" />
      {btn(editor.isActive("heading", { level: 2 }), () => editor.chain().focus().toggleHeading({ level: 2 }).run(), <Heading2 className="w-3.5 h-3.5" />, "Heading 2")}
      {btn(editor.isActive("heading", { level: 3 }), () => editor.chain().focus().toggleHeading({ level: 3 }).run(), <Heading3 className="w-3.5 h-3.5" />, "Heading 3")}
      <span className="w-px h-4 bg-border/50 mx-1" />
      {btn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold className="w-3.5 h-3.5" />, "Bold")}
      {btn(editor.isActive("italic"), () => editor.chain().focus().toggleItalic().run(), <Italic className="w-3.5 h-3.5" />, "Italic")}
      {btn(editor.isActive("link"), handleLink, <Link className="w-3.5 h-3.5" />, "Link")}
      <span className="w-px h-4 bg-border/50 mx-1" />
      {btn(editor.isActive("bulletList"), () => editor.chain().focus().toggleBulletList().run(), <List className="w-3.5 h-3.5" />, "Bullet list")}
      {btn(editor.isActive("orderedList"), () => editor.chain().focus().toggleOrderedList().run(), <ListOrdered className="w-3.5 h-3.5" />, "Numbered list")}
      <span className="w-px h-4 bg-border/50 mx-1" />
      {btn(editor.isActive({ textAlign: "left" }), () => editor.chain().focus().setTextAlign("left").run(), <AlignLeft className="w-3.5 h-3.5" />, "Align left")}
      {btn(editor.isActive({ textAlign: "center" }), () => editor.chain().focus().setTextAlign("center").run(), <AlignCenter className="w-3.5 h-3.5" />, "Align center")}
      {btn(editor.isActive({ textAlign: "right" }), () => editor.chain().focus().setTextAlign("right").run(), <AlignRight className="w-3.5 h-3.5" />, "Align right")}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Trainings() {
  const { user, loading, isAdmin, isVideographer, isEditor } = useAuth();
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [fetching, setFetching] = useState(true);

  // view: "list" | "editor"
  const [view, setView] = useState<"list" | "editor">("list");
  const [editing, setEditing] = useState<Training | null>(null); // null = new
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Form metadata
  const [form, setForm] = useState({
    title: "",
    category: "",
    assigned_to_user_id: "__all__",
    is_published: false,
  });

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link2.configure({ openOnClick: false }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class: "outline-none min-h-[400px] px-6 py-5 text-sm leading-7 text-foreground",
      },
    },
  });

  const fetchTrainings = useCallback(async () => {
    setFetching(true);
    try {
      let query = supabase
        .from("trainings")
        .select("*")
        .order("created_at", { ascending: false });

      // Non-admins only see published trainings assigned to them or to everyone
      if (!isAdmin) {
        query = query
          .eq("is_published", true)
          .or(`assigned_to_user_id.is.null,assigned_to_user_id.eq.${user?.id}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      if (data && data.length > 0) {
        const assigneeIds = [...new Set(data.map((t) => t.assigned_to_user_id).filter(Boolean))];
        let nameMap: Record<string, string> = {};
        if (assigneeIds.length > 0) {
          const { data: profiles } = await supabase
            .from("videographers")
            .select("user_id, name")
            .in("user_id", assigneeIds);
          (profiles || []).forEach((p: any) => { nameMap[p.user_id] = p.name; });
        }
        setTrainings(data.map((t) => ({
          ...t,
          assignee_name: t.assigned_to_user_id ? (nameMap[t.assigned_to_user_id] || "Team Member") : "All",
        })));
      } else {
        setTrainings(data || []);
      }
    } catch {
      toast.error("Failed to load trainings");
    } finally {
      setFetching(false);
    }
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    try {
      const { data } = await supabase.from("videographers").select("user_id, name, email, role").order("name");
      setTeamMembers((data || []).map((v: any) => ({
        id: v.user_id, name: v.name, email: v.email, role: v.role || "editor",
      })));
    } catch {}
  }, []);

  useEffect(() => {
    if (!user) return;
    fetchTrainings();
    if (isAdmin) fetchTeamMembers();
  }, [user, fetchTrainings, fetchTeamMembers, isAdmin]);

  const openNew = () => {
    setEditing(null);
    setForm({ title: "", category: "", assigned_to_user_id: "__all__", is_published: false });
    editor?.commands.setContent("");
    setView("editor");
  };

  const openEdit = (t: Training) => {
    setEditing(t);
    setForm({
      title: t.title,
      category: t.category || "",
      assigned_to_user_id: t.assigned_to_user_id || "__all__",
      is_published: t.is_published,
    });
    editor?.commands.setContent(t.content || "");
    setView("editor");
  };

  const openView = (t: Training) => {
    setEditing(t);
    setForm({
      title: t.title,
      category: t.category || "",
      assigned_to_user_id: t.assigned_to_user_id || "__all__",
      is_published: t.is_published,
    });
    editor?.commands.setContent(t.content || "");
    // For non-admins, still go to editor but it will be read-only
    setView("editor");
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        content: editor?.getHTML() || "",
        category: form.category,
        assigned_to_user_id: form.assigned_to_user_id === "__all__" ? null : form.assigned_to_user_id,
        is_published: form.is_published,
        created_by: user?.id,
      };
      if (editing) {
        const { error } = await supabase.from("trainings").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Training saved");
      } else {
        const { error } = await supabase.from("trainings").insert(payload);
        if (error) throw error;
        toast.success("Training created");
      }
      setView("list");
      fetchTrainings();
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Delete this training?")) return;
    setDeleting(id);
    try {
      const { error } = await supabase.from("trainings").delete().eq("id", id);
      if (error) throw error;
      setTrainings((prev) => prev.filter((t) => t.id !== id));
      toast.success("Training deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  if (isEditor) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No tienes acceso a esta página.
      </div>
    );
  }

  const isStaff = isAdmin || isVideographer;

  // ── Editor View ──────────────────────────────────────────────────────────────
  if (view === "editor") {
    const isReadOnly = !isAdmin;
    return (
    <>

        <main className="flex-1 flex flex-col min-h-screen">

          {/* Editor top bar */}
          <div className="border-b border-border/40 px-4 sm:px-6 py-3 flex items-center gap-3 bg-card/20">
            <button
              onClick={() => setView("list")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Trainings
            </button>
            <span className="text-muted-foreground/30">/</span>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Untitled Training"
              disabled={isReadOnly}
              className="border-none bg-transparent text-sm font-semibold text-foreground p-0 h-auto focus-visible:ring-0 w-64 placeholder:text-muted-foreground/50"
            />
            <div className="ml-auto flex items-center gap-2">
              {/* Metadata dropdowns */}
              {isAdmin && (
                <>
                  <Select value={form.category || "__none__"} onValueChange={(v) => setForm((f) => ({ ...f, category: v === "__none__" ? "" : v }))}>
                    <SelectTrigger className="h-7 text-xs border-border/40 bg-card/50 gap-1 pr-2 w-auto">
                      <Tag className="w-3 h-3 text-muted-foreground" />
                      <SelectValue placeholder="Category" />
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No category</SelectItem>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <Select value={form.assigned_to_user_id} onValueChange={(v) => setForm((f) => ({ ...f, assigned_to_user_id: v }))}>
                    <SelectTrigger className="h-7 text-xs border-border/40 bg-card/50 gap-1 pr-2 w-auto">
                      <User className="w-3 h-3 text-muted-foreground" />
                      <SelectValue placeholder="Assign to" />
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All team members</SelectItem>
                      {teamMembers.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-border/40 bg-card/50">
                    <Switch
                      checked={form.is_published}
                      onCheckedChange={(v) => setForm((f) => ({ ...f, is_published: v }))}
                      id="pub-switch"
                      className="scale-75"
                    />
                    <Label htmlFor="pub-switch" className="text-xs cursor-pointer text-muted-foreground">
                      {form.is_published ? "Published" : "Draft"}
                    </Label>
                  </div>

                  <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 h-7 text-xs btn-17-primary">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                    Save
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Toolbar + Editor */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto w-full">
              {isAdmin && <EditorToolbar editor={editor} />}
              <div
                className={`${isReadOnly ? "pointer-events-none" : ""}`}
                onClick={() => !isReadOnly && editor?.commands.focus()}
              >
                <EditorContent editor={editor} />
              </div>
              {!editor?.getText()?.trim() && !isReadOnly && (
                <p className="text-muted-foreground/40 text-sm px-6 -mt-4 pointer-events-none select-none">
                  Start writing your training content here...
                </p>
              )}
            </div>
          </div>
        </main>

        <style>{`
          .ProseMirror h2 { font-size: 1.3em; font-weight: 700; margin: 1.2em 0 0.4em; }
          .ProseMirror h3 { font-size: 1.1em; font-weight: 600; margin: 1em 0 0.3em; }
          .ProseMirror p { margin: 0.5em 0; }
          .ProseMirror ul { list-style: disc; padding-left: 1.4em; margin: 0.5em 0; }
          .ProseMirror ol { list-style: decimal; padding-left: 1.4em; margin: 0.5em 0; }
          .ProseMirror li { margin: 0.2em 0; }
          .ProseMirror strong { font-weight: 700; }
          .ProseMirror em { font-style: italic; }
          .ProseMirror a { color: hsl(43 74% 49%); text-decoration: underline; }
          .ProseMirror blockquote { border-left: 3px solid hsl(var(--border)); padding-left: 1em; color: hsl(var(--muted-foreground)); margin: 0.8em 0; }
          .ProseMirror code { background: hsl(var(--muted)); padding: 0.1em 0.35em; border-radius: 3px; font-family: monospace; font-size: 0.875em; }
          .ProseMirror pre { background: hsl(var(--muted)); padding: 0.75em 1em; border-radius: 6px; overflow-x: auto; }
          .ProseMirror pre code { background: none; padding: 0; }
        `}</style>
    </>
    );
  }

  // ── List View ────────────────────────────────────────────────────────────────
  return (

      <PageTransition className="flex-1 flex flex-col min-h-screen">

        <div className="flex-1 px-4 sm:px-8 py-8 max-w-5xl mx-auto w-full">
          <motion.div
            className="flex items-center justify-between mb-8"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <div>
              <h1 className="text-2xl font-bold text-foreground tracking-tight">Trainings & SOPs</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {isAdmin ? "Manage team training documents and SOPs" : "Your assigned training materials"}
              </p>
            </div>
            {isAdmin && (
              <Button onClick={openNew} className="gap-2 btn-17-primary text-sm" size="sm">
                <Plus className="w-4 h-4" />
                New Training
              </Button>
            )}
          </motion.div>

          {fetching ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : trainings.length === 0 ? (
            <div className="text-center py-24">
              <BookOpen className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">No trainings yet</p>
              {isAdmin && (
                <Button onClick={openNew} variant="outline" size="sm" className="mt-4 gap-2">
                  <Plus className="w-4 h-4" />
                  Create first training
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              {trainings.map((t, i) => (
                <motion.div
                  key={t.id}
                  className="rounded-xl border border-border/50 bg-card/30 p-4 flex items-start gap-4 hover:border-border/80 hover:bg-card/50 transition-all cursor-pointer group"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                  onClick={() => isAdmin ? openEdit(t) : openView(t)}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.25)" }}
                  >
                    <BookOpen className="w-4 h-4" style={{ color: "hsl(43 74% 49%)" }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors">{t.title}</h3>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {t.category && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Tag className="w-2.5 h-2.5" />{t.category}
                            </span>
                          )}
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <User className="w-2.5 h-2.5" />{t.assignee_name || "All"}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 h-4 ${t.is_published ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-muted/50 text-muted-foreground border-border/40"}`}
                          >
                            {t.is_published
                              ? <><Globe className="w-2 h-2 mr-1" />Published</>
                              : <><Lock className="w-2 h-2 mr-1" />Draft</>}
                          </Badge>
                        </div>
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1 text-xs h-7 px-2"
                            onClick={(e) => { e.stopPropagation(); openEdit(t); }}
                          >
                            <Edit2 className="w-3 h-3" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                            onClick={(e) => handleDelete(t.id, e)}
                            disabled={deleting === t.id}
                          >
                            {deleting === t.id
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Trash2 className="w-3 h-3" />}
                          </Button>
                        </div>
                      )}
                    </div>

                    <p
                      className="text-xs text-muted-foreground mt-1.5 line-clamp-1 leading-relaxed"
                      dangerouslySetInnerHTML={{ __html: t.content.replace(/<[^>]*>/g, " ").slice(0, 200) }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </PageTransition>
  );
}
