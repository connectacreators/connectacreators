import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowLeft, Target, Clapperboard, Database, Pencil, Trash2, Plus, CalendarDays, ExternalLink, Filter } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import UploadButton from '@/components/UploadButton';
import VideoReviewModal from '@/components/VideoReviewModal';
import { revisionCommentService } from '@/services/revisionCommentService';

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

export default function MasterDatabase() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();

  // Master data
  const [allLeads, setAllLeads] = useState<(Lead & { client_name?: string })[]>([]);
  const [allVideos, setAllVideos] = useState<(VideoEdit & { client_name?: string; script_title?: string; source?: 'script' | 'db' })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading_data, setLoadingData] = useState(false);

  // Filters
  const [selectedClientFilter, setSelectedClientFilter] = useState("");
  const [searchLeads, setSearchLeads] = useState("");
  const [searchVideos, setSearchVideos] = useState("");
  const [leadDateFilter, setLeadDateFilter] = useState<"all" | "today" | "week" | "month" | "custom">("all");
  const [leadDateFrom, setLeadDateFrom] = useState("");
  const [leadDateTo, setLeadDateTo] = useState("");

  // Edit dialogs
  const [showAddLeadDialog, setShowAddLeadDialog] = useState(false);
  const [showAddVideoDialog, setShowAddVideoDialog] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);

  const [leadForm, setLeadForm] = useState({
    client_id: "",
    name: "",
    phone: "",
    email: "",
    source: "",
    status: "New Lead",
    follow_up_step: 0,
    last_contacted_at: "",
    next_follow_up_at: "",
    booked: false,
    stopped: false,
    replied: false,
  });

  const [videoForm, setVideoForm] = useState({
    client_id: "",
    script_id: "",
    file_url: "",
    status: "Not started",
    reel_title: "",
    assignee: "",
    script_url: "",
    revisions: "",
    footage: "",
    file_submission: "",
    post_status: "Unpublished",
    schedule_date: "",
  });

  // Inline row states
  const [newLeadRow, setNewLeadRow] = useState({
    client_id: "",
    name: "",
    email: "",
    phone: "",
    source: "",
    status: "New Lead",
  });

  const [newVideoRow, setNewVideoRow] = useState({
    client_id: "",
    reel_title: "",
    status: "Not started",
    assignee: "",
    footage: "",
    file_submission: "",
    post_status: "Unpublished",
  });

  const [editQueueFilter, setEditQueueFilter] = useState(false);

  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewVideo, setReviewVideo] = useState<(VideoEdit & { client_name?: string }) | null>(null);
  const [unresolvedCounts, setUnresolvedCounts] = useState<Record<string, number>>({});

  const [savingNewLead, setSavingNewLead] = useState(false);
  const [savingNewVideo, setSavingNewVideo] = useState(false);

  // Check admin access
  useEffect(() => {
    if (!loading && user && !isAdmin) {
      navigate("/dashboard");
    }
  }, [loading, user, isAdmin, navigate]);

  // Load all data on mount
  useEffect(() => {
    if (!isAdmin || !user) return;
    loadAllData();
  }, [isAdmin, user]);

  const loadAllData = async () => {
    setLoadingData(true);
    try {
      // Load all clients
      const clientsData = await clientService.getAllClients();
      setClients(clientsData);

      // Load all leads with client info
      const leadsData = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (leadsData.error) throw leadsData.error;

      const leadsWithClientNames = (leadsData.data || []).map((lead: any) => ({
        ...lead,
        client_name: clientsData.find((c: Client) => c.id === lead.client_id)?.name || "Unknown",
      }));
      setAllLeads(leadsWithClientNames);

      // Load all videos with client and script info
      const videosData = await supabase
        .from("video_edits")
        .select("*")
        .order("created_at", { ascending: false });

      if (videosData.error) throw videosData.error;

      // Get all scripts
      const scriptsData = await supabase
        .from("scripts")
        .select("*");

      if (scriptsData.error) throw scriptsData.error;
      setScripts(scriptsData.data || []);

      const videosWithInfo = (videosData.data || []).map((video: any) => ({
        ...video,
        client_name: clientsData.find((c: Client) => c.id === video.client_id)?.name || "Unknown",
        script_title: (scriptsData.data || []).find((s: any) => s.id === video.script_id)?.title || "-",
        source: 'db' as const,
      }));

      // Add scripts that are not already referenced by a video_edit
      const referencedScriptIds = new Set((videosData.data || []).map((v: any) => v.script_id).filter(Boolean));
      const scriptOnlyItems = (scriptsData.data || [])
        .filter((s: any) => !referencedScriptIds.has(s.id) && !s.deleted_at)
        .map((s: any) => ({
          id: s.id,
          client_id: s.client_id,
          reel_title: s.idea_ganadora || s.title || "Untitled",
          status: s.review_status || "Not started",
          script_url: `${window.location.origin}/s/${s.id}`,
          caption: s.caption || null,
          assignee: null,
          revisions: null,
          footage: null,
          file_submission: null,
          post_status: null,
          schedule_date: null,
          created_at: s.created_at,
          script_id: null,
          file_url: "",
          client_name: clientsData.find((c: Client) => c.id === s.client_id)?.name || "Unknown",
          script_title: "-",
          source: 'script' as const,
        }));

      setAllVideos([...videosWithInfo, ...scriptOnlyItems]);
    } catch (error) {
      console.error("Error loading master data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!allVideos.length) return;
    const loadCounts = async () => {
      const counts: Record<string, number> = {};
      await Promise.all(
        allVideos.map(async (v) => {
          try {
            counts[v.id] = await revisionCommentService.getUnresolvedCount(v.id);
          } catch { counts[v.id] = 0; }
        })
      );
      setUnresolvedCounts(counts);
    };
    loadCounts();
  }, [allVideos]);

  const matchesLeadDate = (dateStr: string): boolean => {
    if (leadDateFilter === "all") return true;
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const now = new Date();
    if (leadDateFilter === "today") return d.toDateString() === now.toDateString();
    if (leadDateFilter === "week") { const ago = new Date(now); ago.setDate(now.getDate() - 7); return d >= ago; }
    if (leadDateFilter === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    if (leadDateFilter === "custom") {
      if (leadDateFrom && d < new Date(leadDateFrom)) return false;
      if (leadDateTo && d > new Date(leadDateTo + "T23:59:59")) return false;
      return true;
    }
    return true;
  };

  const filteredLeads = useMemo(() => {
    let results = selectedClientFilter
      ? allLeads.filter((lead) => lead.client_id === selectedClientFilter)
      : allLeads;

    if (searchLeads.trim()) {
      const query = searchLeads.toLowerCase();
      results = results.filter(
        (lead) =>
          lead.name.toLowerCase().includes(query) ||
          lead.email?.toLowerCase().includes(query) ||
          lead.phone?.toLowerCase().includes(query) ||
          lead.client_name?.toLowerCase().includes(query)
      );
    }
    results = results.filter((lead) => matchesLeadDate(lead.created_at));
    return results;
  }, [allLeads, selectedClientFilter, searchLeads, leadDateFilter, leadDateFrom, leadDateTo]);

  const filteredVideos = useMemo(() => {
    let results = selectedClientFilter
      ? allVideos.filter((video) => video.client_id === selectedClientFilter)
      : allVideos;

    if (searchVideos.trim()) {
      const query = searchVideos.toLowerCase();
      results = results.filter(
        (video) =>
          (video.reel_title || "").toLowerCase().includes(query) ||
          (video.assignee || "").toLowerCase().includes(query) ||
          video.client_name?.toLowerCase().includes(query)
      );
    }
    if (editQueueFilter) {
      results = results.filter((video) => video.file_submission && video.file_submission.trim() !== "");
    }
    return results;
  }, [allVideos, selectedClientFilter, searchVideos, editQueueFilter]);

  const handleExportLeads = () => {
    const exportData = filteredLeads.map((lead) => ({
      Client: lead.client_name || "Unknown",
      Name: lead.name,
      Email: lead.email || "-",
      Phone: lead.phone || "-",
      Status: lead.status,
      Source: lead.source || "-",
      Created: new Date(lead.created_at).toLocaleDateString(),
    }));
    exportToCSV(exportData, {
      filename: `leads-export-${new Date().toISOString().split("T")[0]}.csv`,
    });
  };

  const handleExportVideos = () => {
    const exportData = filteredVideos.map((video) => ({
      Client: video.client_name || "Unknown",
      "Reel Title": video.reel_title || "-",
      Status: video.status,
      Assignee: video.assignee || "-",
      Script: video.script_url || "-",
      Revisions: video.revisions || "-",
      Footage: video.footage || "-",
      "File Submission": video.file_submission || "-",
      "Post Status": video.post_status || "-",
      "Schedule Date": video.schedule_date ? new Date(video.schedule_date).toLocaleDateString() : "-",
      Created: new Date(video.created_at).toLocaleDateString(),
    }));
    exportToCSV(exportData, {
      filename: `videos-export-${new Date().toISOString().split("T")[0]}.csv`,
    });
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
    if (!leadForm.client_id || !leadForm.name.trim()) {
      toast.error("Client and lead name are required");
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
          client_id: leadForm.client_id,
          name: leadForm.name.trim(),
          phone: leadForm.phone || null,
          email: leadForm.email || null,
          source: leadForm.source || null,
          status: leadForm.status,
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

  const handleEditLead = (lead: Lead & { client_name?: string }) => {
    setLeadForm({
      client_id: lead.client_id,
      name: lead.name,
      phone: lead.phone || "",
      email: lead.email || "",
      source: lead.source || "",
      status: lead.status,
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
      client_id: "",
      name: "",
      phone: "",
      email: "",
      source: "",
      status: "New Lead",
      follow_up_step: 0,
      last_contacted_at: "",
      next_follow_up_at: "",
      booked: false,
      stopped: false,
      replied: false,
    });
  };

  const handleSaveVideo = async () => {
    if (!videoForm.client_id || !videoForm.reel_title.trim()) {
      toast.error("Client and reel title are required");
      return;
    }

    try {
      const payload = {
        script_id: videoForm.script_id || null,
        file_url: videoForm.file_url || "",
        status: videoForm.status,
        reel_title: videoForm.reel_title.trim(),
        assignee: videoForm.assignee || null,
        script_url: videoForm.script_url || null,
        revisions: videoForm.revisions || null,
        footage: videoForm.footage || null,
        file_submission: videoForm.file_submission || null,
        post_status: videoForm.post_status || "Unpublished",
        schedule_date: videoForm.schedule_date || null,
      };
      if (editingVideoId) {
        await videoService.updateVideo(editingVideoId, payload);
        toast.success("Video updated");
      } else {
        await videoService.createVideoEdit({ client_id: videoForm.client_id, ...payload });
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

  const handleEditVideo = (video: VideoEdit & { client_name?: string; script_title?: string }) => {
    setVideoForm({
      client_id: video.client_id,
      script_id: video.script_id || "",
      file_url: video.file_url || "",
      status: video.status,
      reel_title: video.reel_title || "",
      assignee: video.assignee || "",
      script_url: video.script_url || "",
      revisions: video.revisions || "",
      footage: video.footage || "",
      file_submission: video.file_submission || "",
      post_status: video.post_status || "Unpublished",
      schedule_date: video.schedule_date ? video.schedule_date.split("T")[0] : "",
    });
    setEditingVideoId(video.id);
    setShowAddVideoDialog(true);
  };

  const resetVideoForm = () => {
    setVideoForm({
      client_id: "",
      script_id: "",
      file_url: "",
      status: "Not started",
      reel_title: "",
      assignee: "",
      script_url: "",
      revisions: "",
      footage: "",
      file_submission: "",
      post_status: "Unpublished",
      schedule_date: "",
    });
  };

  const handleSaveNewLead = async () => {
    if (!newLeadRow.client_id || !newLeadRow.name.trim()) {
      toast.error("Client and lead name are required");
      return;
    }

    setSavingNewLead(true);
    try {
      await leadService.createLead({
        client_id: newLeadRow.client_id,
        name: newLeadRow.name.trim(),
        phone: newLeadRow.phone ? formatPhoneNumber(newLeadRow.phone) : null,
        email: newLeadRow.email || null,
        source: newLeadRow.source || null,
        status: newLeadRow.status,
      });
      toast.success("Lead created");
      setNewLeadRow({ client_id: "", name: "", email: "", phone: "", source: "", status: "new" });
      await loadAllData();
    } catch (error) {
      console.error("Error saving lead:", error);
      toast.error("Failed to save lead");
    } finally {
      setSavingNewLead(false);
    }
  };

  const handleSaveNewVideo = async () => {
    if (!newVideoRow.client_id || !newVideoRow.reel_title.trim()) {
      toast.error("Client and reel title are required");
      return;
    }

    setSavingNewVideo(true);
    try {
      await videoService.createVideoEdit({
        client_id: newVideoRow.client_id,
        reel_title: newVideoRow.reel_title.trim(),
        status: newVideoRow.status,
        assignee: newVideoRow.assignee || null,
        footage: newVideoRow.footage || null,
        file_submission: newVideoRow.file_submission || null,
        post_status: newVideoRow.post_status || "Unpublished",
        file_url: "",
      });
      toast.success("Video created");
      setNewVideoRow({ client_id: "", reel_title: "", status: "Not started", assignee: "", footage: "", file_submission: "", post_status: "Unpublished" });
      await loadAllData();
    } catch (error) {
      console.error("Error saving video:", error);
      toast.error("Failed to save video");
    } finally {
      setSavingNewVideo(false);
    }
  };

  const handleInlineVideoUpdate = async (videoId: string, field: string, value: string) => {
    const item = allVideos.find((v) => v.id === videoId);
    try {
      if (item?.source === 'script') {
        const scriptFieldMap: Record<string, string> = {
          reel_title: 'idea_ganadora',
          status: 'review_status',
          caption: 'caption',
        };
        const scriptField = scriptFieldMap[field];
        if (!scriptField) return; // read-only for script rows
        await supabase.from("scripts").update({ [scriptField]: value || null }).eq("id", videoId);
      } else {
        await videoService.updateVideo(videoId, { [field]: value || null });
      }
      setAllVideos((prev) => prev.map((v) => v.id === videoId ? { ...v, [field]: value } : v));
    } catch (error) {
      console.error("Error updating video inline:", error);
      toast.error("Failed to update");
    }
  };

  const handleDeleteScript = async (scriptId: string) => {
    if (!confirm("Are you sure you want to delete this script?")) return;
    try {
      await supabase.from("scripts").update({ deleted_at: new Date().toISOString() }).eq("id", scriptId);
      toast.success("Script deleted");
      setAllVideos((prev) => prev.filter((v) => v.id !== scriptId));
    } catch (error) {
      console.error("Error deleting script:", error);
      toast.error("Failed to delete script");
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
              onClick={() => navigate("/dashboard")}
              className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
              initial="hidden"
              animate="visible"
              custom={0}
              variants={fadeUp}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to dashboard
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
                <h1 className="text-2xl md:text-3xl font-bold text-foreground">Master Database</h1>
              </div>
              <span className="text-xs text-muted-foreground bg-background/50 px-3 py-1 rounded-full">
                Admin Only
              </span>
            </motion.div>

            {/* Filter Section */}
            <motion.div
              className="mb-6 p-4 rounded-lg border border-border/30 bg-background/50 glass-card"
              initial="hidden"
              animate="visible"
              custom={2}
              variants={fadeUp}
            >
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <Label className="text-sm mb-2 block">Filter by Client</Label>
                  <Select value={selectedClientFilter} onValueChange={(value) => setSelectedClientFilter(value === "__all__" ? "" : value)}>
                    <SelectTrigger className="w-full sm:w-56">
                      <SelectValue placeholder="All Clients" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All Clients</SelectItem>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-sm mb-2 block">Date Range (Leads)</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Select value={leadDateFilter} onValueChange={(v) => setLeadDateFilter(v as typeof leadDateFilter)}>
                      <SelectTrigger className="w-40">
                        <CalendarDays className="w-4 h-4 mr-1.5 flex-shrink-0" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All time</SelectItem>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">Last 7 days</SelectItem>
                        <SelectItem value="month">This month</SelectItem>
                        <SelectItem value="custom">Custom range</SelectItem>
                      </SelectContent>
                    </Select>
                    {leadDateFilter === "custom" && (
                      <>
                        <Input
                          type="date"
                          value={leadDateFrom}
                          onChange={(e) => setLeadDateFrom(e.target.value)}
                          className="w-36 text-xs"
                          placeholder="From"
                        />
                        <Input
                          type="date"
                          value={leadDateTo}
                          onChange={(e) => setLeadDateTo(e.target.value)}
                          className="w-36 text-xs"
                          placeholder="To"
                        />
                      </>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Tabs */}
            <motion.div
              initial="hidden"
              animate="visible"
              custom={3}
              variants={fadeUp}
            >
              <Tabs defaultValue="leads" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="leads" className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    All Leads ({filteredLeads.length})
                  </TabsTrigger>
                  <TabsTrigger value="videos" className="flex items-center gap-2">
                    <Clapperboard className="w-4 h-4" />
                    All Videos ({filteredVideos.length})
                  </TabsTrigger>
                </TabsList>

                {/* Leads Tab */}
                <TabsContent value="leads" className="space-y-4">
                  <TableHeaderComponent
                    title={language === "en" ? "All Leads" : "Todos los Clientes"}
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
                    <div className="overflow-x-auto rounded-lg border border-border/40 bg-card/20 backdrop-blur-sm glass-card">
                      <table className="w-full text-xs">
                        <thead className="bg-background/50 border-b border-border/40">
                          <tr>
                            <th className="text-left p-3 font-semibold">Client</th>
                            <th className="text-left p-3 font-semibold">Name</th>
                            <th className="text-left p-3 font-semibold">Email</th>
                            <th className="text-left p-3 font-semibold">Phone</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Source</th>
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
                              <td className="p-3 font-medium text-primary">{lead.client_name}</td>
                              <td className="p-3">{lead.name}</td>
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
                              <Select value={newLeadRow.client_id} onValueChange={(value) => setNewLeadRow({ ...newLeadRow, client_id: value })}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select client" />
                                </SelectTrigger>
                                <SelectContent>
                                  {clients.map((client) => (
                                    <SelectItem key={client.id} value={client.id}>
                                      {client.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
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
                            <td className="p-3 text-muted-foreground text-xs">today</td>
                            <td className="p-3 text-center">
                              <button
                                onClick={handleSaveNewLead}
                                disabled={savingNewLead || !newLeadRow.client_id || !newLeadRow.name.trim()}
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
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30 glass-card">
                      <div className="font-semibold text-foreground">{filteredLeads.length}</div>
                      <div className="text-muted-foreground">Total Leads</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30 glass-card">
                      <div className="font-semibold text-foreground">{filteredLeads.filter(l => !l.stopped).length}</div>
                      <div className="text-muted-foreground">Active</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30 glass-card">
                      <div className="font-semibold text-foreground">{filteredLeads.filter(l => l.booked).length}</div>
                      <div className="text-muted-foreground">Booked</div>
                    </div>
                  </div>
                </TabsContent>

                {/* Videos Tab */}
                <TabsContent value="videos" className="space-y-4">
                  <TableHeaderComponent
                    title={language === "en" ? "All Videos" : "Todos los Videos"}
                    count={filteredVideos.length}
                    searchPlaceholder={language === "en" ? "Search by title, assignee, client..." : "Buscar por título, asignado, cliente..."}
                    onSearchChange={setSearchVideos}
                    onExport={handleExportVideos}
                    showColumnToggle={false}
                    additionalActions={
                      <div className="flex gap-2">
                        <Button size="sm" variant={editQueueFilter ? "default" : "outline"} onClick={() => setEditQueueFilter(!editQueueFilter)}>
                          <Filter className="w-4 h-4 mr-1" /> Editing Queue
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
                    <div className="overflow-x-auto rounded-lg border border-border/40 bg-card/20 backdrop-blur-sm glass-card">
                      <table className="w-full text-xs">
                        <thead className="bg-background/50 border-b border-border/40">
                          <tr>
                            <th className="text-left p-3 font-semibold">Client</th>
                            <th className="text-left p-3 font-semibold">Reel Title</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Assignee</th>
                            <th className="text-left p-3 font-semibold">Script</th>
                            <th className="text-left p-3 font-semibold">Revisions</th>
                            <th className="text-left p-3 font-semibold">Reviews</th>
                            <th className="text-left p-3 font-semibold">Footage</th>
                            <th className="text-left p-3 font-semibold">File Submission</th>
                            <th className="text-left p-3 font-semibold">Post Status</th>
                            <th className="text-left p-3 font-semibold">Schedule</th>
                            <th className="text-left p-3 font-semibold">Caption</th>
                            <th className="text-center p-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredVideos.length === 0 && (
                            <tr className="border-b border-border/20 bg-background/30">
                              <td colSpan={13} className="p-6 text-center text-muted-foreground">
                                <Clapperboard className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                                <p>{searchVideos.trim() ? "No videos match your search" : "No videos found. Add your first video below."}</p>
                              </td>
                            </tr>
                          )}
                          {filteredVideos.map((video, idx) => {
                            const isScript = video.source === 'script';
                            return (
                            <tr key={video.id} className={`border-b border-border/20 ${idx % 2 === 0 ? "bg-background/30" : ""} hover:bg-background/50 transition`}>
                              <td className="p-3 font-medium text-primary">{video.client_name}</td>
                              <td className="p-3">
                                <input
                                  type="text"
                                  defaultValue={video.reel_title || ""}
                                  onBlur={(e) => { if (e.target.value !== (video.reel_title || "")) handleInlineVideoUpdate(video.id, "reel_title", e.target.value); }}
                                  className="w-full px-2 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                />
                              </td>
                              <td className="p-3">
                                <Select value={video.status || "Not started"} onValueChange={(value) => handleInlineVideoUpdate(video.id, "status", value)}>
                                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 w-auto min-w-[100px] focus:ring-0 shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="text-xs">
                                    {VIDEO_STATUS_OPTIONS.map((opt) => (
                                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="p-3">
                                {isScript ? <span className="text-muted-foreground">-</span> : (
                                  <input
                                    type="text"
                                    defaultValue={video.assignee || ""}
                                    onBlur={(e) => { if (e.target.value !== (video.assignee || "")) handleInlineVideoUpdate(video.id, "assignee", e.target.value); }}
                                    className="w-full px-2 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                )}
                              </td>
                              <td className="p-3">
                                {video.script_url ? (
                                  <a href={video.script_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1">
                                    <ExternalLink className="w-3 h-3" /> View
                                  </a>
                                ) : <span className="text-muted-foreground">-</span>}
                              </td>
                              <td className="p-3">
                                {isScript ? <span className="text-muted-foreground">-</span> : (
                                  <input
                                    type="text"
                                    defaultValue={video.revisions || ""}
                                    onBlur={(e) => { if (e.target.value !== (video.revisions || "")) handleInlineVideoUpdate(video.id, "revisions", e.target.value); }}
                                    className="w-full px-2 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                )}
                              </td>
                              {/* Reviews */}
                              <td className="p-3">
                                <div className="flex items-center gap-2">
                                  {unresolvedCounts[video.id] > 0 ? (
                                    <span className="text-xs bg-destructive text-destructive-foreground px-1.5 py-0.5 rounded-full">
                                      {unresolvedCounts[video.id]} open
                                    </span>
                                  ) : unresolvedCounts[video.id] === 0 && Object.keys(unresolvedCounts).length > 0 ? (
                                    <span className="text-xs bg-green-500/20 text-green-500 px-1.5 py-0.5 rounded-full">
                                      All resolved
                                    </span>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">—</span>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs px-2"
                                    onClick={() => { setReviewVideo(video); setReviewModalOpen(true); }}
                                  >
                                    Review ▶
                                  </Button>
                                </div>
                              </td>
                              <td className="p-3">
                                {isScript ? <span className="text-muted-foreground">-</span> : (
                                  <>
                                    {!video.footage && !video.file_submission && video.source !== 'script' && (
                                      <UploadButton
                                        videoEditId={video.id}
                                        clientId={video.client_id}
                                        onUploadComplete={() => loadAllData()}
                                      />
                                    )}
                                    <input
                                      type="text"
                                      defaultValue={video.footage || ""}
                                      onBlur={(e) => { if (e.target.value !== (video.footage || "")) handleInlineVideoUpdate(video.id, "footage", e.target.value); }}
                                      className="w-full px-2 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                      placeholder="Google Drive URL"
                                    />
                                  </>
                                )}
                              </td>
                              <td className="p-3">
                                {isScript ? <span className="text-muted-foreground">-</span> : (
                                  <input
                                    type="text"
                                    defaultValue={video.file_submission || ""}
                                    onBlur={(e) => { if (e.target.value !== (video.file_submission || "")) handleInlineVideoUpdate(video.id, "file_submission", e.target.value); }}
                                    className="w-full px-2 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                    placeholder="Google Drive URL"
                                  />
                                )}
                              </td>
                              <td className="p-3">
                                {isScript ? <span className="text-muted-foreground">-</span> : (
                                  <Select value={video.post_status || "Unpublished"} onValueChange={(value) => handleInlineVideoUpdate(video.id, "post_status", value)}>
                                    <SelectTrigger className="h-7 text-xs border-0 bg-transparent p-0 w-auto min-w-[100px] focus:ring-0 shadow-none">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className="text-xs">
                                      {POST_STATUS_OPTIONS.map((opt) => (
                                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                )}
                              </td>
                              <td className="p-3">
                                {isScript ? <span className="text-muted-foreground">-</span> : (
                                  <input
                                    type="date"
                                    defaultValue={video.schedule_date ? video.schedule_date.split("T")[0] : ""}
                                    onBlur={(e) => handleInlineVideoUpdate(video.id, "schedule_date", e.target.value)}
                                    className="w-full px-2 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                                  />
                                )}
                              </td>
                              <td className="p-3">
                                <textarea
                                  defaultValue={video.caption || ""}
                                  onBlur={(e) => { if (e.target.value !== (video.caption || "")) handleInlineVideoUpdate(video.id, "caption", e.target.value); }}
                                  rows={2}
                                  placeholder="Caption..."
                                  className="w-full px-2 py-1 text-xs rounded bg-transparent border border-transparent hover:border-border/40 focus:border-primary focus:bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none min-w-[160px]"
                                />
                              </td>
                              <td className="p-3 text-center space-x-2">
                                {!isScript && (
                                  <button onClick={() => handleEditVideo(video)} className="text-primary hover:text-primary/70 transition inline-block p-1 hover:bg-primary/10 rounded">
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => isScript ? handleDeleteScript(video.id) : handleDeleteVideo(video.id)}
                                  className="text-destructive hover:text-destructive/70 transition inline-block p-1 hover:bg-destructive/10 rounded"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                            );
                          })}
                          {/* Inline row for adding new video */}
                          <tr className="border-b border-border/20 bg-background/20 hover:bg-background/30 transition">
                            <td className="p-3">
                              <Select value={newVideoRow.client_id} onValueChange={(value) => setNewVideoRow({ ...newVideoRow, client_id: value })}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select client" />
                                </SelectTrigger>
                                <SelectContent>
                                  {clients.map((client) => (
                                    <SelectItem key={client.id} value={client.id}>
                                      {client.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3">
                              <input type="text" placeholder="Reel title" value={newVideoRow.reel_title} onChange={(e) => setNewVideoRow({ ...newVideoRow, reel_title: e.target.value })} className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="p-3">
                              <Select value={newVideoRow.status} onValueChange={(value) => setNewVideoRow({ ...newVideoRow, status: value })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="text-xs">
                                  {VIDEO_STATUS_OPTIONS.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3">
                              <input type="text" placeholder="Assignee" value={newVideoRow.assignee} onChange={(e) => setNewVideoRow({ ...newVideoRow, assignee: e.target.value })} className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">-</td>
                            <td className="p-3 text-muted-foreground text-xs">-</td>
                            <td className="p-3 text-muted-foreground text-xs">-</td>
                            <td className="p-3">
                              <input type="text" placeholder="Footage URL" value={newVideoRow.footage} onChange={(e) => setNewVideoRow({ ...newVideoRow, footage: e.target.value })} className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="p-3">
                              <input type="text" placeholder="File submission URL" value={newVideoRow.file_submission} onChange={(e) => setNewVideoRow({ ...newVideoRow, file_submission: e.target.value })} className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary" />
                            </td>
                            <td className="p-3">
                              <Select value={newVideoRow.post_status} onValueChange={(value) => setNewVideoRow({ ...newVideoRow, post_status: value })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent className="text-xs">
                                  {POST_STATUS_OPTIONS.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">-</td>
                            <td className="p-3 text-muted-foreground text-xs">-</td>
                            <td className="p-3 text-center">
                              <button
                                onClick={handleSaveNewVideo}
                                disabled={savingNewVideo || !newVideoRow.client_id || !newVideoRow.reel_title.trim()}
                                className="px-2 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {savingNewVideo ? "Saving..." : "Save"}
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30 glass-card">
                      <div className="font-semibold text-foreground">{filteredVideos.length}</div>
                      <div className="text-muted-foreground">Total Videos</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30 glass-card">
                      <div className="font-semibold text-foreground">{filteredVideos.filter(v => v.status === "In progress").length}</div>
                      <div className="text-muted-foreground">In Progress</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30 glass-card">
                      <div className="font-semibold text-foreground">{filteredVideos.filter(v => v.status === "Done").length}</div>
                      <div className="text-muted-foreground">Completed</div>
                    </div>
                  </div>

                  {reviewVideo && (
                    <VideoReviewModal
                      open={reviewModalOpen}
                      onClose={() => { setReviewModalOpen(false); setReviewVideo(null); }}
                      videoEditId={reviewVideo.id}
                      title={reviewVideo.reel_title || 'Video'}
                      uploadSource={reviewVideo.upload_source || null}
                      storagePath={reviewVideo.storage_path || null}
                      fileSubmissionUrl={reviewVideo.file_submission}
                      onCommentsChanged={() => {
                        revisionCommentService.getUnresolvedCount(reviewVideo.id)
                          .then(count => setUnresolvedCounts(prev => ({ ...prev, [reviewVideo.id]: count })));
                      }}
                    />
                  )}
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
              <Label>Client *</Label>
              <Select value={leadForm.client_id} onValueChange={(value) => setLeadForm({ ...leadForm, client_id: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
              <Label>Client *</Label>
              <Select value={videoForm.client_id} onValueChange={(value) => setVideoForm({ ...videoForm, client_id: value })}>
                <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (<SelectItem key={client.id} value={client.id}>{client.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Reel Title *</Label>
              <Input placeholder="Video title" value={videoForm.reel_title} onChange={(e) => setVideoForm({ ...videoForm, reel_title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={videoForm.status} onValueChange={(value) => setVideoForm({ ...videoForm, status: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VIDEO_STATUS_OPTIONS.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Post Status</Label>
                <Select value={videoForm.post_status} onValueChange={(value) => setVideoForm({ ...videoForm, post_status: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {POST_STATUS_OPTIONS.map((opt) => (<SelectItem key={opt} value={opt}>{opt}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Schedule Date</Label>
                <Input type="date" value={videoForm.schedule_date} onChange={(e) => setVideoForm({ ...videoForm, schedule_date: e.target.value })} />
              </div>
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
