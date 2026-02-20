import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  ArrowLeft,
  Plus,
  Trash2,
  Users,
  ClipboardList,
  UserPlus,
  X,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { motion } from "framer-motion";
import { toast } from "sonner";
import AnimatedDots from "@/components/ui/AnimatedDots";

type Task = {
  id: string;
  title: string;
  description: string | null;
  is_completed: boolean;
  due_date: string | null;
};

type AssignedClient = {
  id: string;
  assignment_id: string;
  name: string;
  email: string | null;
};

type AllClient = {
  id: string;
  name: string;
  email: string | null;
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

export default function VideographerDetail() {
  const { videographerId } = useParams<{ videographerId: string }>();
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  const [videographerName, setVideographerName] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assignedClients, setAssignedClients] = useState<AssignedClient[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // New task form
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);

  // Assign client dialog
  const [assignOpen, setAssignOpen] = useState(false);
  const [allClients, setAllClients] = useState<AllClient[]>([]);
  const [assignSearch, setAssignSearch] = useState("");
  const [assigning, setAssigning] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user || !isAdmin || !videographerId) return;
    setLoadingData(true);

    // Fetch videographer profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name, email")
      .eq("user_id", videographerId)
      .maybeSingle();
    setVideographerName(profile?.display_name || profile?.email || "Videographer");

    // Fetch tasks
    const { data: taskData } = await supabase
      .from("videographer_tasks")
      .select("id, title, description, is_completed, due_date")
      .eq("videographer_user_id", videographerId)
      .order("is_completed")
      .order("created_at", { ascending: false });
    setTasks(taskData || []);

    // Fetch assigned clients
    const { data: assignments } = await supabase
      .from("videographer_clients")
      .select("id, client_id")
      .eq("videographer_user_id", videographerId);

    if (assignments && assignments.length > 0) {
      const clientIds = assignments.map((a) => a.client_id);
      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, email")
        .in("id", clientIds)
        .order("name");
      setAssignedClients(
        (clients || []).map((c) => ({
          ...c,
          assignment_id: assignments.find((a) => a.client_id === c.id)!.id,
        }))
      );
    } else {
      setAssignedClients([]);
    }

    setLoadingData(false);
  }, [user, isAdmin, videographerId]);

  useEffect(() => {
    if (!loading && user && isAdmin) {
      fetchData();
    } else if (!loading && user && !isAdmin) {
      navigate("/dashboard");
    }
  }, [loading, user, isAdmin, fetchData, navigate]);

  const handleAddTask = async () => {
    if (!newTaskTitle.trim() || !videographerId) return;
    setAddingTask(true);
    const { error } = await supabase.from("videographer_tasks").insert({
      videographer_user_id: videographerId,
      title: newTaskTitle.trim(),
    });
    if (error) {
      toast.error("Error adding task");
    } else {
      setNewTaskTitle("");
      await fetchData();
    }
    setAddingTask(false);
  };

  const handleToggleTask = async (taskId: string, completed: boolean) => {
    await supabase
      .from("videographer_tasks")
      .update({ is_completed: completed })
      .eq("id", taskId);
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, is_completed: completed } : t))
    );
  };

  const handleDeleteTask = async (taskId: string) => {
    await supabase.from("videographer_tasks").delete().eq("id", taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
  };

  const openAssignDialog = async () => {
    // Fetch all clients for assignment
    const { data } = await supabase
      .from("clients")
      .select("id, name, email")
      .order("name");
    setAllClients(data || []);
    setAssignSearch("");
    setAssignOpen(true);
  };

  const handleAssignClient = async (clientId: string) => {
    if (!videographerId) return;
    setAssigning(true);
    const { error } = await supabase.from("videographer_clients").insert({
      videographer_user_id: videographerId,
      client_id: clientId,
    });
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Client already assigned" : "Error assigning client");
    } else {
      toast.success("Client assigned");
      await fetchData();
    }
    setAssigning(false);
    setAssignOpen(false);
  };

  const handleUnassignClient = async (assignmentId: string) => {
    await supabase.from("videographer_clients").delete().eq("id", assignmentId);
    toast.success("Client unassigned");
    await fetchData();
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const assignedIds = new Set(assignedClients.map((c) => c.id));
  const filteredClients = allClients.filter(
    (c) =>
      !assignedIds.has(c.id) &&
      (c.name.toLowerCase().includes(assignSearch.toLowerCase()) ||
        (c.email || "").toLowerCase().includes(assignSearch.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/videographers" />

      <main className="flex-1 flex flex-col min-h-screen">
        <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="flex-1 px-4 sm:px-8 py-8 max-w-3xl mx-auto w-full">
          <motion.button
            onClick={() => navigate("/videographers")}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
            initial="hidden"
            animate="visible"
            custom={0}
            variants={fadeUp}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {language === "en" ? "Back to videographers" : "Volver a videógrafos"}
          </motion.button>

          <motion.h1
            className="text-xl sm:text-2xl font-bold text-foreground mb-8 tracking-tight"
            initial="hidden"
            animate="visible"
            custom={1}
            variants={fadeUp}
          >
            {videographerName}
          </motion.h1>

          {/* Tasks Section */}
          <motion.section
            className="mb-10"
            initial="hidden"
            animate="visible"
            custom={2}
            variants={fadeUp}
          >
            <div className="flex items-center gap-2 mb-4">
              <ClipboardList className="w-4 h-4 text-primary" />
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                {language === "en" ? "Tasks" : "Tareas"}
              </h2>
            </div>

            {/* Add task inline */}
            <div className="flex gap-2 mb-4">
              <Input
                placeholder={language === "en" ? "New task..." : "Nueva tarea..."}
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                className="flex-1"
              />
              <Button size="sm" onClick={handleAddTask} disabled={addingTask || !newTaskTitle.trim()}>
                {addingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>

            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {language === "en" ? "No tasks yet" : "Sin tareas aún"}
              </p>
            ) : (
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/30 ${
                      task.is_completed ? "opacity-50" : ""
                    }`}
                  >
                    <Checkbox
                      checked={task.is_completed}
                      onCheckedChange={(checked) => handleToggleTask(task.id, checked === true)}
                    />
                    <span
                      className={`flex-1 text-sm ${
                        task.is_completed ? "line-through text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {task.title}
                    </span>
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.section>

          {/* Assigned Clients Section */}
          <motion.section
            initial="hidden"
            animate="visible"
            custom={3}
            variants={fadeUp}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                  {language === "en" ? "Assigned Clients" : "Clientes Asignados"}
                </h2>
              </div>
              <Button variant="outline" size="sm" onClick={openAssignDialog} className="gap-1.5">
                <UserPlus className="w-3.5 h-3.5" />
                {language === "en" ? "Assign" : "Asignar"}
              </Button>
            </div>

            {assignedClients.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                {language === "en" ? "No clients assigned" : "Sin clientes asignados"}
              </p>
            ) : (
              <div className="space-y-2">
                {assignedClients.map((client) => (
                  <div
                    key={client.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/30"
                  >
                    <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                      <Users className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{client.name}</p>
                      {client.email && (
                        <p className="text-xs text-muted-foreground truncate">{client.email}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleUnassignClient(client.assignment_id)}
                      className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        </div>
      </main>

      {/* Assign Client Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Assign Client" : "Asignar Cliente"}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder={language === "en" ? "Search clients..." : "Buscar clientes..."}
            value={assignSearch}
            onChange={(e) => setAssignSearch(e.target.value)}
            className="mb-3"
          />
          <div className="max-h-64 overflow-y-auto space-y-1">
            {filteredClients.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                {language === "en" ? "No clients available" : "No hay clientes disponibles"}
              </p>
            ) : (
              filteredClients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => handleAssignClient(client.id)}
                  disabled={assigning}
                  className="w-full text-left p-3 rounded-lg hover:bg-accent/10 transition-colors flex items-center gap-3"
                >
                  <div className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                    <Users className="w-3 h-3 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{client.name}</p>
                    {client.email && <p className="text-xs text-muted-foreground">{client.email}</p>}
                  </div>
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
