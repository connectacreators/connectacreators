import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, ArrowLeft, Target, Clapperboard, Database, Pencil, Trash2, Plus, Sync, ExternalLink, Filter } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { leadService, type Lead } from "@/services/leadService";
import { videoService, type VideoEdit } from "@/services/videoService";
import { scriptService, type Script } from "@/services/scriptService";
import { clientService, type Client } from "@/services/clientService";
import TableHeaderComponent from "@/components/tables/TableHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { exportToCSV } from "@/utils/csvExport";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

const STATUS_OPTIONS = ["New Lead", "Follow-up 1", "Follow-up 2", "Follow-up 3", "Booked", "Canceled"];
const VIDEO_STATUS_OPTIONS = ["Not started", "In progress", "Done"];
const POST_STATUS_OPTIONS = ["Unpublished", "Need Revision", "Scheduled", "Done"];

const formatPhoneNumber = (phone: string): string => {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  return phone;
};

export default function ClientDatabase() {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, loading, isAdmin, isUser, isVideographer } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();

  const [clientName, setClientName] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [videos, setVideos] = useState<VideoEdit[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading_data, setLoadingData] = useState(false);

  // Edit dialogs
  const [showAddLeadDialog, setShowAddLeadDialog] = useState(false);
  const [showAddVideoDialog, setShowAddVideoDialog] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);

  const [leadForm, setLeadForm] = useState({
    name: "",
    phone: "",
    email: "",
    source: "",
    status: "New Lead",
    notes: "",
    follow_up_step: 0,
    last_contacted_at: "",
    next_follow_up_at: "",
    booked: false,
    stopped: false,
    replied: false,
  });

  const [videoForm, setVideoForm] = useState({
    reel_title: "",
    status: "Not started",
    assignee: "",
    script_url: "",
    revisions: "",
    footage: "",
    file_submission: "",
    post_status: "Unpublished",
    schedule_date: "",
    caption: "",
    script_id: "",
    file_url: "",
  });

  // Inline row states
  const [newLeadRow, setNewLeadRow] = useState({
    name: "",
    email: "",
    phone: "",
    source: "",
    status: "New Lead",
  });

  const [newVideoRow, setNewVideoRow] = useState({
    reel_title: "",
    status: "Not started",
    assignee: "",
    footage: "",
    file_submission: "",
    post_status: "Unpublished",
    schedule_date: "",
    caption: "",
  });

  const [editQueueFilter, setEditQueueFilter] = useState(false);

  const [savingNewLead, setSavingNewLead] = useState(false);
  const [savingNewVideo, setSavingNewVideo] = useState(false);
  const [syncingScripts, setSyncingScripts] = useState(false);
  const [searchLeads, setSearchLeads] = useState("");
  const [searchVideos, setSearchVideos] = useState("");

  const filteredLeads = useMemo(() => {
    if (!searchLeads.trim()) return leads;
    const query = searchLeads.toLowerCase();
    return leads.filter(
      (lead) =>
        lead.name.toLowerCase().includes(query) ||
        lead.email?.toLowerCase().includes(query) ||
        lead.phone?.toLowerCase().includes(query)
    );
  }, [leads, searchLeads]);

  // Merge video_edits + orphaned scripts (scripts not already linked to a video_edit)
  const mergedVideoRows = useMemo(() => {
    const linkedScriptIds = new Set(videos.map((v) => v.script_id).filter(Boolean));
    const orphanedScripts = scripts.filter((s) => !linkedScriptIds.has(s.id));
    return {
      videoEdits: videos,
      orphanedScripts,
    };
  }, [videos, scripts]);

  const filteredVideos = useMemo(() => {
    let result = mergedVideoRows.videoEdits;
    if (editQueueFilter) {
      result = result.filter((v) => v.file_submission && v.file_submission.trim().length > 0);
    }
    if (searchVideos.trim()) {
      const query = searchVideos.toLowerCase();
      result = result.filter(
        (v) =>
          (v.reel_title || "").toLowerCase().includes(query) ||
          (v.assignee || "").toLowerCase().includes(query)
      );
    }
    const filteredScripts = editQueueFilter ? [] : mergedVideoRows.orphanedScripts.filter((s) => {
      if (!searchVideos.trim()) return true;
      const q = searchVideos.toLowerCase();
      return (s.idea_ganadora || s.title || "").toLowerCase().includes(q);
    });
    return { videoEdits: result, orphanedScripts: filteredScripts };
  }, [mergedVideoRows, searchVideos, editQueueFilter]);

  const handleExportLeads = () => {
    const exportData = filteredLeads.map((lead) => ({
      Name: lead.name,
      Email: lead.email || "-",
      Phone: lead.phone || "-",
      Status: lead.status,
      Source: lead.source || "-",
      Created: new Date(lead.created_at).toLocaleDateString(),
    }));
    exportToCSV(exportData, {
      filename: `leads-${clientName}-${new Date().toISOString().split("T")[0]}.csv`,
    });
  };

  const handleExportVideos = () => {
    const exportData = filteredVideos.videoEdits.map((video) => ({
      "Reel Title": video.reel_title || "-",
      Status: video.status,
      "Post Status": video.post_status || "-",
      Assignee: video.assignee || "-",
      "Script URL": video.script_url || "-",
      Revisions: video.revisions || "-",
      Footage: video.footage || "-",
      "File Submission": video.file_submission || "-",
      "Schedule Date": video.schedule_date ? new Date(video.schedule_date).toLocaleDateString() : "-",
      Caption: video.caption || "-",
      Created: new Date(video.created_at).toLocaleDateString(),
    }));
    exportToCSV(exportData, {
      filename: `videos-${clientName}-${new Date().toISOString().split("T")[0]}.csv`,
    });
  };

  const canViewClient = isAdmin || isVideographer || isUser;

  useEffect(() => {
    if (!loading && user && !canViewClient) {
      navigate("/dashboard");
    }
  }, [loading, user, canViewClient, navigate]);

  useEffect(() => {
    if (!clientId) return;
    loadAllData();
  }, [clientId]);

  const loadAllData = async () => {
    setLoadingData(true);
    try {
      const client = await clientService.getClientById(clientId!);
      if (client) setClientName(client.name);

      const [leadsData, videosData, scriptsData] = await Promise.all([
        leadService.getLeadsByClient(clientId!),
        videoService.getVideosByClient(clientId!),
        scriptService.getScriptsByClient(clientId!),
      ]);

      setLeads(leadsData);
      setScripts(scriptsData);
      setVideos(videosData);
    } catch (error) {
      console.error("Error loading data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoadingData(false);
    }
  };

  const syncScriptsToVideos = async () => {
    setSyncingScripts(true);
    try {
      console.log("=== SYNC START ===");
      console.log("Total scripts loaded:", scripts.length);

      const scriptsWithLinks = scripts.filter(s => {
        const hasLink = s.google_drive_link && s.google_drive_link.trim().length > 0;
        console.log(`Script: ${s.title}, Has Link: ${hasLink}, Link: "${s.google_drive_link}"`);
        return hasLink;
      });

      console.log("Scripts with Google Drive links:", scriptsWithLinks.length);
      console.log("Scripts with links:", scriptsWithLinks.map(s => ({ id: s.id, title: s.title, link: s.google_drive_link })));

      let synced = 0;
      let skipped = 0;
      let errors = 0;

      for (const script of scriptsWithLinks) {
        console.log(`Processing script: ${script.title} (${script.id})`);

        // Check if video already exists for this script
        const existingVideo = videos.find(v => v.script_id === script.id);
        if (existingVideo) {
          console.log(`  ✓ Video already exists for this script (${existingVideo.id})`);
          skipped++;
          continue;
        }

        try {
          console.log(`  → Creating video for script: ${script.title}`);
          await videoService.createVideoEdit({
            client_id: clientId!,
            script_id: script.id,
            file_url: script.google_drive_link,
            status: "pending"
          });
          console.log(`  ✓ Video created successfully`);
          synced++;
        } catch (err) {
          console.error(`  ✗ Error creating video: ${err}`);
          errors++;
        }
      }

      console.log("=== SYNC COMPLETE ===");
      console.log(`Results: Synced=${synced}, Skipped=${skipped}, Errors=${errors}`);

      // Reload data to show new videos
      await loadAllData();

      toast.success(`Synced ${synced} scripts to videos${skipped > 0 ? ` (${skipped} already had videos)` : ""}`);
    } catch (error) {
      console.error("Error syncing scripts:", error);
      toast.error("Failed to sync scripts");
    } finally {
      setSyncingScripts(false);
    }
  };

  const handleUpdateLeadStatus = async (leadId: string, newStatus: string) => {
    try {
      await leadService.updateLead(leadId, { status: newStatus });
      toast.success("Status updated");
      await loadAllData();
    } catch (error) {
      console.error("Error updating status:", error);
      toast.error("Failed to update status");
    }
  };

  const handleSaveLead = async () => {
    if (!clientId || !leadForm.name.trim()) {
      toast.error("Lead name is required");
      return;
    }

    try {
      if (editingLeadId) {
        await leadService.updateLead(editingLeadId, {
          name: leadForm.name.trim(),
          phone: leadForm.phone || null,
          email: leadForm.email || null,
          source: leadForm.source || null,
          status: leadForm.status,
          notes: leadForm.notes.trim() || null,
          follow_up_step: leadForm.follow_up_step,
          last_contacted_at: leadForm.last_contacted_at || null,
          next_follow_up_at: leadForm.next_follow_up_at || null,
          booked: leadForm.booked,
          stopped: leadForm.stopped,
          replied: leadForm.replied,
        });
        toast.success("Lead updated");
      } else {
        await leadService.createLead({
          client_id: clientId,
          name: leadForm.name.trim(),
          phone: leadForm.phone || null,
          email: leadForm.email || null,
          source: leadForm.source || null,
          status: leadForm.status,
          notes: leadForm.notes.trim() || null,
        });
        toast.success("Lead created");
      }
      setShowAddLeadDialog(false);
      setEditingLeadId(null);
      resetLeadForm();
      await loadAllData();
    } catch (error) {
      console.error("Error saving lead:", error);
      toast.error("Failed to save lead");
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm("Are you sure you want to delete this lead?")) return;
    try {
      await leadService.deleteLead(leadId);
      toast.success("Lead deleted");
      await loadAllData();
    } catch (error) {
      console.error("Error deleting lead:", error);
      toast.error("Failed to delete lead");
    }
  };

  const handleEditLead = (lead: Lead) => {
    setLeadForm({
      name: lead.name,
      phone: lead.phone || "",
      email: lead.email || "",
      source: lead.source || "",
      status: lead.status,
      notes: lead.notes || "",
      follow_up_step: lead.follow_up_step,
      last_contacted_at: lead.last_contacted_at ? lead.last_contacted_at.split("T")[0] : "",
      next_follow_up_at: lead.next_follow_up_at ? lead.next_follow_up_at.split("T")[0] : "",
      booked: lead.booked,
      stopped: lead.stopped,
      replied: lead.replied,
    });
    setEditingLeadId(lead.id);
    setShowAddLeadDialog(true);
  };

  const resetLeadForm = () => {
    setLeadForm({
      name: "",
      phone: "",
      email: "",
      source: "",
      status: "New Lead",
      notes: "",
      follow_up_step: 0,
      last_contacted_at: "",
      next_follow_up_at: "",
      booked: false,
      stopped: false,
      replied: false,
    });
  };

  const handleSaveVideo = async () => {
    if (!clientId || !videoForm.reel_title.trim()) {
      toast.error("Reel title is required");
      return;
    }

    const payload = {
      reel_title: videoForm.reel_title.trim(),
      status: videoForm.status,
      assignee: videoForm.assignee.trim() || null,
      script_url: videoForm.script_url.trim() || null,
      revisions: videoForm.revisions.trim() || null,
      footage: videoForm.footage.trim() || null,
      file_submission: videoForm.file_submission.trim() || null,
      post_status: videoForm.post_status,
      schedule_date: videoForm.schedule_date ? new Date(videoForm.schedule_date).toISOString() : null,
      caption: videoForm.caption.trim() || null,
      file_url: videoForm.footage.trim() || videoForm.file_url.trim() || "",
    };

    try {
      if (editingVideoId) {
        await videoService.updateVideo(editingVideoId, payload);
        toast.success("Video updated");
      } else {
        await videoService.createVideoEdit({ ...payload, client_id: clientId });
        toast.success("Video created");
      }
      setShowAddVideoDialog(false);
      setEditingVideoId(null);
      resetVideoForm();
      await loadAllData();
    } catch (error) {
      console.error("Error saving video:", error);
      toast.error("Failed to save video");
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm("Are you sure you want to delete this video?")) return;
    try {
      await videoService.deleteVideo(videoId);
      toast.success("Video deleted");
      await loadAllData();
    } catch (error) {
      console.error("Error deleting video:", error);
      toast.error("Failed to delete video");
    }
  };

  const handleEditVideo = (video: VideoEdit) => {
    setVideoForm({
      reel_title: video.reel_title || "",
      status: video.status || "Not started",
      assignee: video.assignee || "",
      script_url: video.script_url || "",
      revisions: video.revisions || "",
      footage: video.footage || "",
      file_submission: video.file_submission || "",
      post_status: video.post_status || "Unpublished",
      schedule_date: video.schedule_date ? video.schedule_date.split("T")[0] : "",
      caption: video.caption || "",
      script_id: video.script_id || "",
      file_url: video.file_url || "",
    });
    setEditingVideoId(video.id);
    setShowAddVideoDialog(true);
  };

  const resetVideoForm = () => {
    setVideoForm({
      reel_title: "",
      status: "Not started",
      assignee: "",
      script_url: "",
      revisions: "",
      footage: "",
      file_submission: "",
      post_status: "Unpublished",
      schedule_date: "",
      caption: "",
      script_id: "",
      file_url: "",
    });
  };

  const handleSaveNewLead = async () => {
    if (!clientId || !newLeadRow.name.trim()) {
      toast.error("Lead name is required");
      return;
    }

    setSavingNewLead(true);
    try {
      await leadService.createLead({
        client_id: clientId,
        name: newLeadRow.name.trim(),
        phone: newLeadRow.phone ? formatPhoneNumber(newLeadRow.phone) : null,
        email: newLeadRow.email || null,
        source: newLeadRow.source || null,
        status: newLeadRow.status,
      });
      toast.success("Lead created");
      setNewLeadRow({ name: "", email: "", phone: "", source: "", status: "new" });
      await loadAllData();
    } catch (error) {
      console.error("Error saving lead:", error);
      toast.error("Failed to save lead");
    } finally {
      setSavingNewLead(false);
    }
  };

  const handleSaveNewVideo = async () => {
    if (!clientId || !newVideoRow.reel_title.trim()) {
      toast.error("Reel title is required");
      return;
    }

    setSavingNewVideo(true);
    try {
      await videoService.createVideoEdit({
        client_id: clientId,
        reel_title: newVideoRow.reel_title.trim(),
        status: newVideoRow.status,
        assignee: newVideoRow.assignee.trim() || null,
        footage: newVideoRow.footage.trim() || null,
        file_submission: newVideoRow.file_submission.trim() || null,
        post_status: newVideoRow.post_status,
        schedule_date: newVideoRow.schedule_date ? new Date(newVideoRow.schedule_date).toISOString() : null,
        caption: newVideoRow.caption.trim() || null,
        file_url: newVideoRow.footage.trim() || "",
      });
      toast.success("Video created");
      setNewVideoRow({ reel_title: "", status: "Not started", assignee: "", footage: "", file_submission: "", post_status: "Unpublished", schedule_date: "", caption: "" });
      await loadAllData();
    } catch (error) {
      console.error("Error saving video:", error);
      toast.error("Failed to save video");
    } finally {
      setSavingNewVideo(false);
    }
  };

  const handleInlineVideoUpdate = async (videoId: string, field: string, value: string | null) => {
    try {
      const updates: Record<string, unknown> = { [field]: value };
      if (field === "schedule_date" && value) {
        updates[field] = new Date(value).toISOString();
      }
      await videoService.updateVideo(videoId, updates);
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, ...updates } as VideoEdit : v))
      );
    } catch (error) {
      console.error("Error updating video:", error);
      toast.error("Failed to update");
    }
  };

  if (loading) {
    return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
    );
  }

  return (
    <>

      <main className="flex-1 flex flex-col min-h-screen">

        <div className="flex-1 px-6 py-8">
          <div className="max-w-7xl mx-auto">
            <motion.button
              onClick={() => navigate(`/clients/${clientId}`)}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
              initial="hidden"
              animate="visible"
              custom={0}
              variants={fadeUp}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to client
            </motion.button>

            <motion.div
              className="flex items-center justify-between mb-8"
              initial="hidden"
              animate="visible"
              custom={1}
              variants={fadeUp}
            >
              <div className="flex items-center gap-3">
                <Database className="w-6 h-6 text-cyan-400" />
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground">{clientName} - Database</h1>
                  <p className="text-xs text-muted-foreground mt-1">Manage leads and videos</p>
                </div>
              </div>
            </motion.div>

            {/* Tabs */}
            <motion.div
              initial="hidden"
              animate="visible"
              custom={2}
              variants={fadeUp}
            >
              <Tabs defaultValue="leads" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="leads" className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Leads ({leads.length})
                  </TabsTrigger>
                  <TabsTrigger value="videos" className="flex items-center gap-2">
                    <Clapperboard className="w-4 h-4" />
                    Videos ({videos.length + mergedVideoRows.orphanedScripts.length})
                  </TabsTrigger>
                </TabsList>

                {/* Leads Tab */}
                <TabsContent value="leads" className="space-y-4">
                  <TableHeaderComponent
                    title={language === "en" ? "Leads Database" : "Base de Datos de Clientes"}
                    count={filteredLeads.length}
                    searchPlaceholder={language === "en" ? "Search by name, email, phone..." : "Buscar por nombre, email, teléfono..."}
                    onSearchChange={setSearchLeads}
                    onExport={handleExportLeads}
                    showColumnToggle={false}
                    additionalActions={
                      <Button size="sm" onClick={() => { resetLeadForm(); setEditingLeadId(null); setShowAddLeadDialog(true); }}>
                        <Plus className="w-4 h-4 mr-1" /> {language === "en" ? "Add Lead" : "Agregar Cliente"}
                      </Button>
                    }
                  />

                  {loading_data ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading leads...
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border/40 bg-card/20 backdrop-blur-sm">
                      <table className="w-full text-xs">
                        <thead className="bg-background/50 border-b border-border/40">
                          <tr>
                            <th className="text-left p-3 font-semibold">Name</th>
                            <th className="text-left p-3 font-semibold">Email</th>
                            <th className="text-left p-3 font-semibold">Phone</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Source</th>
                            <th className="text-left p-3 font-semibold">Notes</th>
                            <th className="text-left p-3 font-semibold">Created</th>
                            <th className="text-left p-3 font-semibold">Booking Date</th>
                            <th className="text-left p-3 font-semibold">Booking Time</th>
                            <th className="text-center p-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLeads.length === 0 && (
                            <tr className="border-b border-border/20 bg-background/30">
                              <td colSpan={10} className="p-6 text-center text-muted-foreground">
                                <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                                <p>{searchLeads.trim() ? "No leads match your search" : "No leads found. Add your first lead below."}</p>
                              </td>
                            </tr>
                          )}
                          {filteredLeads.map((lead, idx) => (
                            <tr key={lead.id} className={`border-b border-border/20 ${idx % 2 === 0 ? "bg-background/30" : ""} hover:bg-background/50 transition`}>
                              <td className="p-3 font-medium">{lead.name}</td>
                              <td className="p-3 text-muted-foreground truncate">{lead.email || "-"}</td>
                              <td className="p-3 text-muted-foreground">{lead.phone || "-"}</td>
                              <td className="p-3">
                                <Select value={lead.status} onValueChange={(value) => handleUpdateLeadStatus(lead.id, value)}>
                                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 w-auto min-w-[110px] focus:ring-0 shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="text-xs">
                                    {STATUS_OPTIONS.map((option) => (
                                      <SelectItem key={option} value={option}>{option}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="p-3 text-muted-foreground">{lead.source || "-"}</td>
                              <td className="p-3 text-muted-foreground text-xs max-w-[160px]">
                                {lead.notes ? (
                                  <span className="block truncate" title={lead.notes}>{lead.notes}</span>
                                ) : (
                                  <button onClick={() => handleEditLead(lead)} className="text-muted-foreground/40 hover:text-primary text-xs italic transition">add note</button>
                                )}
                              </td>
                              <td className="p-3 text-muted-foreground text-xs">{new Date(lead.created_at).toLocaleDateString()}</td>
                              <td className="p-3 text-muted-foreground text-xs">
                                {(lead as any).booking_date ? new Date((lead as any).booking_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                              </td>
                              <td className="p-3 text-muted-foreground text-xs">
                                {(lead as any).booking_time ? (() => { const [h, m] = (lead as any).booking_time.split(":").map(Number); const p = h >= 12 ? "PM" : "AM"; return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${p}`; })() : "—"}
                              </td>
                              <td className="p-3 text-center space-x-2">
                                <button onClick={() => handleEditLead(lead)} className="text-primary hover:text-primary/70 transition inline-block p-1 hover:bg-primary/10 rounded">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteLead(lead.id)} className="text-destructive hover:text-destructive/70 transition inline-block p-1 hover:bg-destructive/10 rounded">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {/* Inline row for adding new lead */}
                          <tr className="border-b border-border/20 bg-background/20 hover:bg-background/30 transition">
                            <td className="p-3">
                              <input
                                type="text"
                                placeholder="Lead name"
                                value={newLeadRow.name}
                                onChange={(e) => setNewLeadRow({ ...newLeadRow, name: e.target.value })}
                                className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="email"
                                placeholder="email@example.com"
                                value={newLeadRow.email}
                                onChange={(e) => setNewLeadRow({ ...newLeadRow, email: e.target.value })}
                                className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </td>
                            <td className="p-3">
                              <input
                                type="tel"
                                placeholder="+1 (555) 000-0000"
                                value={newLeadRow.phone}
                                onChange={(e) => setNewLeadRow({ ...newLeadRow, phone: e.target.value })}
                                className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </td>
                            <td className="p-3">
                              <Select value={newLeadRow.status} onValueChange={(value) => setNewLeadRow({ ...newLeadRow, status: value })}>
                                <SelectTrigger className="w-full h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="text-xs">
                                  {STATUS_OPTIONS.map((option) => (
                                    <SelectItem key={option} value={option}>{option}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3">
                              <input
                                type="text"
                                placeholder="Facebook, Referral..."
                                value={newLeadRow.source}
                                onChange={(e) => setNewLeadRow({ ...newLeadRow, source: e.target.value })}
                                className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </td>
                            <td className="p-3 text-muted-foreground text-xs italic">edit after save</td>
                            <td className="p-3 text-muted-foreground text-xs">today</td>
                            <td className="p-3 text-center">
                              <button
                                onClick={handleSaveNewLead}
                                disabled={savingNewLead || !newLeadRow.name.trim()}
                                className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {savingNewLead ? "Saving..." : "Save"}
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{leads.length}</div>
                      <div className="text-muted-foreground">Total Leads</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{leads.filter(l => !l.stopped).length}</div>
                      <div className="text-muted-foreground">Active</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{leads.filter(l => l.booked).length}</div>
                      <div className="text-muted-foreground">Booked</div>
                    </div>
                  </div>
                </TabsContent>

                {/* Videos Tab */}
                <TabsContent value="videos" className="space-y-4">
                  <TableHeaderComponent
                    title={language === "en" ? "Videos Database" : "Base de Datos de Videos"}
                    count={filteredVideos.videoEdits.length + filteredVideos.orphanedScripts.length}
                    searchPlaceholder={language === "en" ? "Search by title, assignee..." : "Buscar por título, asignado..."}
                    onSearchChange={setSearchVideos}
                    onExport={handleExportVideos}
                    showColumnToggle={false}
                    additionalActions={
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={editQueueFilter ? "default" : "outline"}
                          onClick={() => setEditQueueFilter(!editQueueFilter)}
                          className="flex items-center gap-1"
                        >
                          <Filter className="w-4 h-4" />
                          <span className="hidden sm:inline">Editing Queue</span>
                        </Button>
                        <Button size="sm" onClick={() => { resetVideoForm(); setEditingVideoId(null); setShowAddVideoDialog(true); }}>
                          <Plus className="w-4 h-4 mr-1" /> {language === "en" ? "Add Video" : "Agregar Video"}
                        </Button>
                      </div>
                    }
                  />

                  {loading_data ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading videos...
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border/40 bg-card/20 backdrop-blur-sm">
                      <table className="w-full text-xs">
                        <thead className="bg-background/50 border-b border-border/40">
                          <tr>
                            <th className="text-left p-2 font-semibold min-w-[140px]">Title</th>
                            <th className="text-left p-2 font-semibold min-w-[100px]">Status</th>
                            <th className="text-left p-2 font-semibold min-w-[110px]">Post Status</th>
                            <th className="text-left p-2 font-semibold min-w-[100px]">Assignee</th>
                            <th className="text-left p-2 font-semibold min-w-[120px]">Revisions</th>
                            <th className="text-left p-2 font-semibold min-w-[120px]">Footage</th>
                            <th className="text-left p-2 font-semibold min-w-[120px]">File Submission</th>
                            <th className="text-left p-2 font-semibold min-w-[60px]">Script</th>
                            <th className="text-left p-2 font-semibold min-w-[110px]">Schedule</th>
                            <th className="text-left p-2 font-semibold min-w-[160px]">Caption</th>
                            <th className="text-center p-2 font-semibold min-w-[60px]">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredVideos.videoEdits.length === 0 && filteredVideos.orphanedScripts.length === 0 && (
                            <tr className="border-b border-border/20 bg-background/30">
                              <td colSpan={11} className="p-6 text-center text-muted-foreground">
                                <Clapperboard className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                                <p>{searchVideos.trim() || editQueueFilter ? "No videos match your filters" : "No videos found. Add your first video below."}</p>
                              </td>
                            </tr>
                          )}

                          {/* video_edits rows */}
                          {filteredVideos.videoEdits.map((video, idx) => (
                            <tr key={video.id} className={`border-b border-border/20 ${idx % 2 === 0 ? "bg-background/30" : ""} hover:bg-background/50 transition`}>
                              {/* Title */}
                              <td className="p-2">
                                <input
                                  type="text"
                                  defaultValue={video.reel_title || ""}
                                  onBlur={(e) => { if (e.target.value !== (video.reel_title || "")) handleInlineVideoUpdate(video.id, "reel_title", e.target.value || null); }}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none"
                                />
                              </td>
                              {/* Status */}
                              <td className="p-2">
                                <Select defaultValue={video.status || "Not started"} onValueChange={(v) => handleInlineVideoUpdate(video.id, "status", v)}>
                                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 w-auto min-w-[90px] focus:ring-0 shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="text-xs">
                                    {VIDEO_STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </td>
                              {/* Post Status */}
                              <td className="p-2">
                                <Select defaultValue={video.post_status || "Unpublished"} onValueChange={(v) => handleInlineVideoUpdate(video.id, "post_status", v)}>
                                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 w-auto min-w-[95px] focus:ring-0 shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="text-xs">
                                    {POST_STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              </td>
                              {/* Assignee */}
                              <td className="p-2">
                                <input
                                  type="text"
                                  defaultValue={video.assignee || ""}
                                  onBlur={(e) => { if (e.target.value !== (video.assignee || "")) handleInlineVideoUpdate(video.id, "assignee", e.target.value || null); }}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none"
                                  placeholder="—"
                                />
                              </td>
                              {/* Revisions */}
                              <td className="p-2">
                                <input
                                  type="text"
                                  defaultValue={video.revisions || ""}
                                  onBlur={(e) => { if (e.target.value !== (video.revisions || "")) handleInlineVideoUpdate(video.id, "revisions", e.target.value || null); }}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none"
                                  placeholder="—"
                                />
                              </td>
                              {/* Footage */}
                              <td className="p-2">
                                <input
                                  type="text"
                                  defaultValue={video.footage || ""}
                                  onBlur={(e) => { if (e.target.value !== (video.footage || "")) handleInlineVideoUpdate(video.id, "footage", e.target.value || null); }}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none truncate"
                                  placeholder="Drive URL"
                                />
                              </td>
                              {/* File Submission */}
                              <td className="p-2">
                                <input
                                  type="text"
                                  defaultValue={video.file_submission || ""}
                                  onBlur={(e) => { if (e.target.value !== (video.file_submission || "")) handleInlineVideoUpdate(video.id, "file_submission", e.target.value || null); }}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none truncate"
                                  placeholder="Drive URL"
                                />
                              </td>
                              {/* Script */}
                              <td className="p-2">
                                {video.script_url ? (
                                  <a href={video.script_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/70 inline-flex items-center gap-0.5">
                                    <ExternalLink className="w-3 h-3" /> View
                                  </a>
                                ) : <span className="text-muted-foreground/40">—</span>}
                              </td>
                              {/* Schedule */}
                              <td className="p-2">
                                <input
                                  type="date"
                                  defaultValue={video.schedule_date ? video.schedule_date.split("T")[0] : ""}
                                  onChange={(e) => handleInlineVideoUpdate(video.id, "schedule_date", e.target.value || null)}
                                  className="px-1.5 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none"
                                />
                              </td>
                              {/* Caption */}
                              <td className="p-2">
                                <input
                                  type="text"
                                  defaultValue={video.caption || ""}
                                  onBlur={(e) => { if (e.target.value !== (video.caption || "")) handleInlineVideoUpdate(video.id, "caption", e.target.value || null); }}
                                  className="w-full px-1.5 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none"
                                  placeholder="—"
                                />
                              </td>
                              {/* Actions */}
                              <td className="p-2 text-center space-x-1">
                                <button onClick={() => handleEditVideo(video)} className="text-primary hover:text-primary/70 transition inline-block p-1 hover:bg-primary/10 rounded">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                                <button onClick={() => handleDeleteVideo(video.id)} className="text-destructive hover:text-destructive/70 transition inline-block p-1 hover:bg-destructive/10 rounded">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}

                          {/* Vault scripts — shown as regular rows */}
                          {filteredVideos.orphanedScripts.map((script) => (
                            <tr key={`script-${script.id}`} className="border-b border-border/20 bg-background/30 hover:bg-background/50 transition">
                              {/* Title */}
                              <td className="p-2 font-medium text-foreground">
                                <span className="truncate">{script.idea_ganadora || script.title || "Untitled"}</span>
                              </td>
                              {/* Status — review_status read-only */}
                              <td className="p-2">
                                <span className="text-xs text-muted-foreground">{script.review_status || "—"}</span>
                              </td>
                              {/* Post Status */}
                              <td className="p-2"><span className="text-muted-foreground/40">—</span></td>
                              {/* Assignee */}
                              <td className="p-2"><span className="text-muted-foreground/40">—</span></td>
                              {/* Revisions */}
                              <td className="p-2"><span className="text-muted-foreground/40">—</span></td>
                              {/* Footage */}
                              <td className="p-2"><span className="text-muted-foreground/40">—</span></td>
                              {/* File Submission */}
                              <td className="p-2"><span className="text-muted-foreground/40">—</span></td>
                              {/* Script */}
                              <td className="p-2">
                                <a
                                  href={`/s/${script.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-primary hover:text-primary/70 inline-flex items-center gap-0.5"
                                >
                                  <ExternalLink className="w-3 h-3" /> View
                                </a>
                              </td>
                              {/* Schedule */}
                              <td className="p-2"><span className="text-muted-foreground/40">—</span></td>
                              {/* Caption */}
                              <td className="p-2">
                                {script.caption ? (
                                  <span className="text-xs text-muted-foreground line-clamp-1">{script.caption}</span>
                                ) : (
                                  <span className="text-muted-foreground/40">—</span>
                                )}
                              </td>
                              {/* Actions */}
                              <td className="p-2 text-center">
                                <span className="text-xs text-muted-foreground/30">—</span>
                              </td>
                            </tr>
                          ))}

                          {/* Inline row for adding new video */}
                          <tr className="border-b border-border/20 bg-background/20 hover:bg-background/30 transition">
                            <td className="p-2">
                              <input type="text" placeholder="Reel title" value={newVideoRow.reel_title} onChange={(e) => setNewVideoRow({ ...newVideoRow, reel_title: e.target.value })} className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="p-2">
                              <Select value={newVideoRow.status} onValueChange={(v) => setNewVideoRow({ ...newVideoRow, status: v })}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="text-xs">{VIDEO_STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                              </Select>
                            </td>
                            <td className="p-2">
                              <Select value={newVideoRow.post_status} onValueChange={(v) => setNewVideoRow({ ...newVideoRow, post_status: v })}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="text-xs">{POST_STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                              </Select>
                            </td>
                            <td className="p-2">
                              <input type="text" placeholder="Assignee" value={newVideoRow.assignee} onChange={(e) => setNewVideoRow({ ...newVideoRow, assignee: e.target.value })} className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="p-2"></td>
                            <td className="p-2">
                              <input type="text" placeholder="Drive URL" value={newVideoRow.footage} onChange={(e) => setNewVideoRow({ ...newVideoRow, footage: e.target.value })} className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="p-2">
                              <input type="text" placeholder="Drive URL" value={newVideoRow.file_submission} onChange={(e) => setNewVideoRow({ ...newVideoRow, file_submission: e.target.value })} className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="p-2 text-muted-foreground/30 text-xs">—</td>
                            <td className="p-2">
                              <input type="date" value={newVideoRow.schedule_date} onChange={(e) => setNewVideoRow({ ...newVideoRow, schedule_date: e.target.value })} className="px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="p-2">
                              <input type="text" placeholder="Caption..." value={newVideoRow.caption} onChange={(e) => setNewVideoRow({ ...newVideoRow, caption: e.target.value })} className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="p-2 text-center">
                              <button onClick={handleSaveNewVideo} disabled={savingNewVideo || !newVideoRow.reel_title.trim()} className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed">
                                {savingNewVideo ? "..." : "Save"}
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="grid grid-cols-4 gap-3 text-xs">
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{videos.length + mergedVideoRows.orphanedScripts.length}</div>
                      <div className="text-muted-foreground">Total</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{mergedVideoRows.orphanedScripts.length}</div>
                      <div className="text-muted-foreground">Scripts (Vault)</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{videos.filter(v => v.status === "In progress").length}</div>
                      <div className="text-muted-foreground">In Progress</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{videos.filter(v => v.status === "Done").length}</div>
                      <div className="text-muted-foreground">Done</div>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Add/Edit Lead Dialog */}
      <Dialog open={showAddLeadDialog} onOpenChange={setShowAddLeadDialog}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingLeadId ? "Edit Lead" : "Add New Lead"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input placeholder="Lead name" value={leadForm.name} onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" placeholder="email@example.com" value={leadForm.email} onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input placeholder="+1 (555) 000-0000" value={leadForm.phone} onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Input placeholder="Facebook, Referral, etc." value={leadForm.source} onChange={(e) => setLeadForm({ ...leadForm, source: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={leadForm.status} onValueChange={(value) => setLeadForm({ ...leadForm, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                placeholder="Add notes about this lead..."
                value={leadForm.notes}
                onChange={(e) => setLeadForm({ ...leadForm, notes: e.target.value })}
                rows={3}
                className="resize-none text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label>Follow Up Step</Label>
              <Input type="number" min="0" max="10" value={leadForm.follow_up_step} onChange={(e) => setLeadForm({ ...leadForm, follow_up_step: parseInt(e.target.value) || 0 })} />
            </div>
            <div className="space-y-2">
              <Label>Last Contacted</Label>
              <Input type="date" value={leadForm.last_contacted_at} onChange={(e) => setLeadForm({ ...leadForm, last_contacted_at: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Next Follow Up</Label>
              <Input type="date" value={leadForm.next_follow_up_at} onChange={(e) => setLeadForm({ ...leadForm, next_follow_up_at: e.target.value })} />
            </div>
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="booked" checked={leadForm.booked} onChange={(e) => setLeadForm({ ...leadForm, booked: e.target.checked })} className="rounded" />
                <Label htmlFor="booked" className="cursor-pointer mb-0">Booked</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="replied" checked={leadForm.replied} onChange={(e) => setLeadForm({ ...leadForm, replied: e.target.checked })} className="rounded" />
                <Label htmlFor="replied" className="cursor-pointer mb-0">Replied</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="stopped" checked={leadForm.stopped} onChange={(e) => setLeadForm({ ...leadForm, stopped: e.target.checked })} className="rounded" />
                <Label htmlFor="stopped" className="cursor-pointer mb-0">Stopped/Archived</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddLeadDialog(false); setEditingLeadId(null); resetLeadForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveLead}>
              {editingLeadId ? "Update Lead" : "Create Lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Video Dialog */}
      <Dialog open={showAddVideoDialog} onOpenChange={setShowAddVideoDialog}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVideoId ? "Edit Video" : "Add New Video"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reel Title *</Label>
              <Input placeholder="Video title" value={videoForm.reel_title} onChange={(e) => setVideoForm({ ...videoForm, reel_title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={videoForm.status} onValueChange={(v) => setVideoForm({ ...videoForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIDEO_STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Assignee</Label>
                <Input placeholder="Editor name" value={videoForm.assignee} onChange={(e) => setVideoForm({ ...videoForm, assignee: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Script URL</Label>
              <Input placeholder="Auto-filled from script" value={videoForm.script_url} onChange={(e) => setVideoForm({ ...videoForm, script_url: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Revisions</Label>
              <Input placeholder="Revision notes" value={videoForm.revisions} onChange={(e) => setVideoForm({ ...videoForm, revisions: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Footage (Google Drive)</Label>
              <Input placeholder="https://drive.google.com/..." value={videoForm.footage} onChange={(e) => setVideoForm({ ...videoForm, footage: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>File Submission (Google Drive)</Label>
              <Input placeholder="https://drive.google.com/..." value={videoForm.file_submission} onChange={(e) => setVideoForm({ ...videoForm, file_submission: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Post Status</Label>
                <Select value={videoForm.post_status} onValueChange={(v) => setVideoForm({ ...videoForm, post_status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POST_STATUS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Schedule Date</Label>
                <Input type="date" value={videoForm.schedule_date} onChange={(e) => setVideoForm({ ...videoForm, schedule_date: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Caption</Label>
              <Textarea placeholder="Post caption..." value={videoForm.caption} onChange={(e) => setVideoForm({ ...videoForm, caption: e.target.value })} rows={3} className="resize-none text-sm" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowAddVideoDialog(false); setEditingVideoId(null); resetVideoForm(); }}>
              Cancel
            </Button>
            <Button onClick={handleSaveVideo}>
              {editingVideoId ? "Update Video" : "Create Video"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
