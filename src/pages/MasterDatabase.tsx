import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import { Loader2, ArrowLeft, Target, Clapperboard, Database, Pencil, Trash2, Plus } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import AnimatedDots from "@/components/ui/AnimatedDots";
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

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function MasterDatabase() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  // Master data
  const [allLeads, setAllLeads] = useState<(Lead & { client_name?: string })[]>([]);
  const [allVideos, setAllVideos] = useState<(VideoEdit & { client_name?: string; script_title?: string })[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [loading_data, setLoadingData] = useState(false);

  // Filters
  const [selectedClientFilter, setSelectedClientFilter] = useState("");

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
    status: "new",
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
    status: "pending",
  });

  // Inline row states
  const [newLeadRow, setNewLeadRow] = useState({
    client_id: "",
    name: "",
    email: "",
    phone: "",
    source: "",
  });

  const [newVideoRow, setNewVideoRow] = useState({
    client_id: "",
    file_url: "",
    script_id: "",
    status: "pending",
  });

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
      }));
      setAllVideos(videosWithInfo);
    } catch (error) {
      console.error("Error loading master data:", error);
      toast.error("Failed to load data");
    } finally {
      setLoadingData(false);
    }
  };

  const filteredLeads = selectedClientFilter
    ? allLeads.filter((lead) => lead.client_id === selectedClientFilter)
    : allLeads;

  const filteredVideos = selectedClientFilter
    ? allVideos.filter((video) => video.client_id === selectedClientFilter)
    : allVideos;

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
      status: "new",
      follow_up_step: 0,
      last_contacted_at: "",
      next_follow_up_at: "",
      booked: false,
      stopped: false,
      replied: false,
    });
  };

  const handleSaveVideo = async () => {
    if (!videoForm.client_id || !videoForm.file_url.trim()) {
      toast.error("Client and file URL are required");
      return;
    }

    try {
      if (editingVideoId) {
        await videoService.updateVideo(editingVideoId, {
          script_id: videoForm.script_id || null,
          file_url: videoForm.file_url.trim(),
          status: videoForm.status,
        });
        toast.success("Video updated");
      } else {
        await videoService.createVideoEdit({
          client_id: videoForm.client_id,
          script_id: videoForm.script_id || null,
          file_url: videoForm.file_url.trim(),
          status: videoForm.status,
        });
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
      file_url: video.file_url,
      status: video.status,
    });
    setEditingVideoId(video.id);
    setShowAddVideoDialog(true);
  };

  const resetVideoForm = () => {
    setVideoForm({
      client_id: "",
      script_id: "",
      file_url: "",
      status: "pending",
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
        phone: newLeadRow.phone || null,
        email: newLeadRow.email || null,
        source: newLeadRow.source || null,
        status: "new",
      });
      toast.success("Lead created");
      setNewLeadRow({ client_id: "", name: "", email: "", phone: "", source: "" });
      await loadAllData();
    } catch (error) {
      console.error("Error saving lead:", error);
      toast.error("Failed to save lead");
    } finally {
      setSavingNewLead(false);
    }
  };

  const handleSaveNewVideo = async () => {
    if (!newVideoRow.client_id || !newVideoRow.file_url.trim()) {
      toast.error("Client and file URL are required");
      return;
    }

    setSavingNewVideo(true);
    try {
      await videoService.createVideoEdit({
        client_id: newVideoRow.client_id,
        script_id: newVideoRow.script_id || null,
        file_url: newVideoRow.file_url.trim(),
        status: newVideoRow.status,
      });
      toast.success("Video created");
      setNewVideoRow({ client_id: "", file_url: "", script_id: "", status: "pending" });
      await loadAllData();
    } catch (error) {
      console.error("Error saving video:", error);
      toast.error("Failed to save video");
    } finally {
      setSavingNewVideo(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/dashboard" />

      <main className="flex-1 flex flex-col min-h-screen">
        <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

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
              className="mb-6 p-4 rounded-lg border border-border/30 bg-background/50"
              initial="hidden"
              animate="visible"
              custom={2}
              variants={fadeUp}
            >
              <Label className="text-sm mb-2 block">Filter by Client</Label>
              <Select value={selectedClientFilter} onValueChange={(value) => setSelectedClientFilter(value === "__all__" ? "" : value)}>
                <SelectTrigger className="w-full sm:w-64">
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
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">Leads Database</h2>
                    <Button size="sm" onClick={() => { resetLeadForm(); setEditingLeadId(null); setShowAddLeadDialog(true); }}>
                      <Plus className="w-4 h-4 mr-1" /> Add Lead
                    </Button>
                  </div>

                  {loading_data ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading leads...
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border/30">
                      <table className="w-full text-xs">
                        <thead className="bg-background/50 border-b border-border/30">
                          <tr>
                            <th className="text-left p-3 font-semibold">Client</th>
                            <th className="text-left p-3 font-semibold">Name</th>
                            <th className="text-left p-3 font-semibold">Email</th>
                            <th className="text-left p-3 font-semibold">Phone</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Source</th>
                            <th className="text-left p-3 font-semibold">Created</th>
                            <th className="text-center p-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredLeads.length === 0 && (
                            <tr className="border-b border-border/20 bg-background/30">
                              <td colSpan={8} className="p-6 text-center text-muted-foreground">
                                <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                                <p>No leads found. Add your first lead below.</p>
                              </td>
                            </tr>
                          )}
                          {filteredLeads.map((lead, idx) => (
                            <tr key={lead.id} className={`border-b border-border/20 ${idx % 2 === 0 ? "bg-background/30" : ""} hover:bg-background/50 transition`}>
                              <td className="p-3 font-medium text-primary">{lead.client_name}</td>
                              <td className="p-3">{lead.name}</td>
                              <td className="p-3 text-muted-foreground truncate">{lead.email || "-"}</td>
                              <td className="p-3 text-muted-foreground">{lead.phone || "-"}</td>
                              <td className="p-3"><span className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-medium">{lead.status}</span></td>
                              <td className="p-3 text-muted-foreground">{lead.source || "-"}</td>
                              <td className="p-3 text-muted-foreground">{new Date(lead.created_at).toLocaleDateString()}</td>
                              <td className="p-3 text-center space-x-2">
                                <button onClick={() => handleEditLead(lead)} className="text-primary hover:text-primary/70 transition inline-block">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteLead(lead.id)} className="text-destructive hover:text-destructive/70 transition inline-block">
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
                              <span className="px-2 py-1 rounded bg-muted/30 text-muted-foreground text-xs font-medium">new</span>
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
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{filteredLeads.length}</div>
                      <div className="text-muted-foreground">Total Leads</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{filteredLeads.filter(l => !l.stopped).length}</div>
                      <div className="text-muted-foreground">Active</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{filteredLeads.filter(l => l.booked).length}</div>
                      <div className="text-muted-foreground">Booked</div>
                    </div>
                  </div>
                </TabsContent>

                {/* Videos Tab */}
                <TabsContent value="videos" className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold">Videos Database</h2>
                    <Button size="sm" onClick={() => { resetVideoForm(); setEditingVideoId(null); setShowAddVideoDialog(true); }}>
                      <Plus className="w-4 h-4 mr-1" /> Add Video
                    </Button>
                  </div>

                  {loading_data ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      Loading videos...
                    </div>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-border/30">
                      <table className="w-full text-xs">
                        <thead className="bg-background/50 border-b border-border/30">
                          <tr>
                            <th className="text-left p-3 font-semibold">Client</th>
                            <th className="text-left p-3 font-semibold">File URL</th>
                            <th className="text-left p-3 font-semibold">Script</th>
                            <th className="text-left p-3 font-semibold">Status</th>
                            <th className="text-left p-3 font-semibold">Created</th>
                            <th className="text-center p-3 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredVideos.length === 0 && (
                            <tr className="border-b border-border/20 bg-background/30">
                              <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                <Clapperboard className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                                <p>No videos found. Add your first video below.</p>
                              </td>
                            </tr>
                          )}
                          {filteredVideos.map((video, idx) => (
                            <tr key={video.id} className={`border-b border-border/20 ${idx % 2 === 0 ? "bg-background/30" : ""} hover:bg-background/50 transition`}>
                              <td className="p-3 font-medium text-primary">{video.client_name}</td>
                              <td className="p-3 truncate max-w-xs">{video.file_url}</td>
                              <td className="p-3 text-muted-foreground">{video.script_title}</td>
                              <td className="p-3"><span className="px-2 py-1 rounded bg-primary/20 text-primary text-xs font-medium">{video.status}</span></td>
                              <td className="p-3 text-muted-foreground">{new Date(video.created_at).toLocaleDateString()}</td>
                              <td className="p-3 text-center space-x-2">
                                <button onClick={() => handleEditVideo(video)} className="text-primary hover:text-primary/70 transition inline-block">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteVideo(video.id)} className="text-destructive hover:text-destructive/70 transition inline-block">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
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
                              <input
                                type="text"
                                placeholder="https://example.com/video.mp4"
                                value={newVideoRow.file_url}
                                onChange={(e) => setNewVideoRow({ ...newVideoRow, file_url: e.target.value })}
                                className="w-full px-2 py-1 text-xs rounded bg-background border border-border/40 text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                            </td>
                            <td className="p-3">
                              <Select value={newVideoRow.script_id} onValueChange={(value) => setNewVideoRow({ ...newVideoRow, script_id: value === "__none__" ? "" : value })}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select script" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__none__">No script</SelectItem>
                                  {scripts.map((script) => (
                                    <SelectItem key={script.id} value={script.id}>
                                      {script.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3">
                              <Select value={newVideoRow.status} onValueChange={(value) => setNewVideoRow({ ...newVideoRow, status: value })}>
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="pending">Pending</SelectItem>
                                  <SelectItem value="in_progress">In Progress</SelectItem>
                                  <SelectItem value="completed">Completed</SelectItem>
                                  <SelectItem value="rejected">Rejected</SelectItem>
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="p-3 text-muted-foreground text-xs">today</td>
                            <td className="p-3 text-center">
                              <button
                                onClick={handleSaveNewVideo}
                                disabled={savingNewVideo || !newVideoRow.client_id || !newVideoRow.file_url.trim()}
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
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{filteredVideos.length}</div>
                      <div className="text-muted-foreground">Total Videos</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{filteredVideos.filter(v => v.status === "in_progress").length}</div>
                      <div className="text-muted-foreground">In Progress</div>
                    </div>
                    <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                      <div className="font-semibold text-foreground">{filteredVideos.filter(v => v.status === "completed").length}</div>
                      <div className="text-muted-foreground">Completed</div>
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
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="contacted">Contacted</SelectItem>
                  <SelectItem value="interested">Interested</SelectItem>
                  <SelectItem value="qualified">Qualified</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="not_interested">Not Interested</SelectItem>
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingVideoId ? "Edit Video" : "Add New Video"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={videoForm.client_id} onValueChange={(value) => setVideoForm({ ...videoForm, client_id: value })}>
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
              <Label>File URL *</Label>
              <Input placeholder="https://example.com/video.mp4" value={videoForm.file_url} onChange={(e) => setVideoForm({ ...videoForm, file_url: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Script (Optional)</Label>
              <Select value={videoForm.script_id} onValueChange={(value) => setVideoForm({ ...videoForm, script_id: value === "__none__" ? "" : value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a script" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No script</SelectItem>
                  {scripts.map((script) => (
                    <SelectItem key={script.id} value={script.id}>
                      {script.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={videoForm.status} onValueChange={(value) => setVideoForm({ ...videoForm, status: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
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
    </div>
  );
}
