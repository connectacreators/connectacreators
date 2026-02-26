import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import DashboardSidebar from "@/components/DashboardSidebar";
import DashboardTopBar from "@/components/DashboardTopBar";
import { Loader2, ArrowLeft, Workflow, Plus, ChevronDown, Circle, Trash2, Play, Clock, Zap } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AnimatedDots from "@/components/ui/AnimatedDots";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import WorkflowStep from "@/components/workflow/WorkflowStep";
import AddStepModal, { ServiceOption } from "@/components/workflow/AddStepModal";
import StepConfigModal from "@/components/workflow/StepConfigModal";
import TestRunModal, { TestData, TestRunResult } from "@/components/workflow/TestRunModal";
import LiveRunDrawer from "@/components/workflow/LiveRunDrawer";
import WorkflowTemplates from "@/components/workflow/WorkflowTemplates";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.45, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
  }),
};

const OPERATOR_LABELS: Record<string, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  not_contains: "does not contain",
  is_empty: "is empty",
  is_not_empty: "is not empty",
};

export interface WorkflowStep {
  id: string;
  type: "trigger" | "action";
  service: string;
  action: string;
  label: string;
  config: Record<string, any>;
}

export interface Workflow {
  id: string;
  client_id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function ClientWorkflow() {
  const { clientId } = useParams<{ clientId: string }>();
  const { user, loading, isAdmin, isUser, isVideographer } = useAuth();
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 1024;
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);

  // Workflow state
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  const [workflowSaving, setWorkflowSaving] = useState(false);
  const [clientName, setClientName] = useState("");
  const [showNewWorkflowInput, setShowNewWorkflowInput] = useState(false);
  const [newWorkflowName, setNewWorkflowName] = useState("");

  // Modal states
  const [showAddStepModal, setShowAddStepModal] = useState(false);
  const [addStepAfter, setAddStepAfter] = useState<string | null>(null);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [showTestRunModal, setShowTestRunModal] = useState(false);
  const [testRunResults, setTestRunResults] = useState<TestRunResult | null>(null);
  const [isTestRunning, setIsTestRunning] = useState(false);
  const [showLiveDrawer, setShowLiveDrawer] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [executionHistory, setExecutionHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  // Step test results tracking (for data flow between steps)
  const [stepTestResults, setStepTestResults] = useState<Record<string, Record<string, any>>>({});

  // Step run statuses for sequential test runner (idle | running | passed | failed)
  const [stepRunStatuses, setStepRunStatuses] = useState<Record<string, 'idle' | 'running' | 'passed' | 'failed'>>({});

  // Get current workflow from array
  const workflow = workflows.find(w => w.id === selectedWorkflowId) || null;

  // Drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor, { distance: 8 }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Fetch client name
  useEffect(() => {
    if (!clientId) return;
    supabase
      .from("clients")
      .select("name")
      .eq("id", clientId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setClientName(data.name);
      });
  }, [clientId]);

  // Load workflow
  useEffect(() => {
    if (!clientId) return;
    loadWorkflow();
  }, [clientId]);

  const loadWorkflow = async () => {
    if (!clientId) return;
    setWorkflowLoading(true);
    try {
      const { data } = await supabase
        .from("client_workflows")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true });

      if (data && data.length > 0) {
        // Restore trigger_type and trigger_config into trigger step config
        const processedWorkflows = (data as Workflow[]).map(w => ({
          ...w,
          steps: (w.steps as WorkflowStep[]).map(step => {
            if (step.type === "trigger") {
              return {
                ...step,
                config: {
                  trigger_type: (w as any).trigger_type || 'new_lead',
                  ...((w as any).trigger_config || {}),
                  ...step.config,
                }
              };
            }
            return step;
          })
        }));
        setWorkflows(processedWorkflows);
        setSelectedWorkflowId(data[0].id);
      } else {
        // Create default workflow
        const newWorkflow: Workflow = {
          id: "",
          client_id: clientId,
          name: `${clientName} Workflow`,
          description: "",
          steps: [
            {
              id: "trigger_1",
              type: "trigger",
              service: "webhooks",
              action: "new_facebook_lead",
              label: "Trigger on new Facebook Lead",
              config: { trigger_type: 'new_lead' },
            },
          ],
          is_active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setWorkflows([newWorkflow]);
        setSelectedWorkflowId(newWorkflow.id || "temp");
      }
    } catch (error) {
      console.error("Error loading workflow:", error);
      toast.error(language === "en" ? "Failed to load workflow" : "Error al cargar el flujo");
    } finally {
      setWorkflowLoading(false);
    }
  };

  const handleAddStep = (service: ServiceOption, afterStepId: string | null = null) => {
    if (!workflow) return;

    const newStep: WorkflowStep = {
      id: `step_${Date.now()}`,
      type: "action",
      service: service.service,
      action: service.action,
      label: service.name,
      config: {},
    };

    let newSteps = [...workflow.steps];
    if (afterStepId) {
      const index = newSteps.findIndex((s) => s.id === afterStepId);
      if (index >= 0) {
        newSteps.splice(index + 1, 0, newStep);
      } else {
        newSteps.push(newStep);
      }
    } else {
      newSteps.push(newStep);
    }

    const updatedWorkflow = { ...workflow, steps: newSteps };
    setWorkflows(workflows.map(w => w.id === workflow.id ? updatedWorkflow : w));
    setEditingStepId(newStep.id);
    setShowConfigModal(true);
  };

  const handleDeleteStep = (stepId: string) => {
    if (!workflow || workflow.steps.length <= 1) {
      toast.error(language === "en" ? "Cannot delete trigger step" : "No se puede eliminar el paso activador");
      return;
    }
    const updatedWorkflow = {
      ...workflow,
      steps: workflow.steps.filter((s) => s.id !== stepId),
    };
    setWorkflows(workflows.map(w => w.id === workflow.id ? updatedWorkflow : w));
  };

  const handleDuplicateStep = (stepId: string) => {
    if (!workflow) return;
    const step = workflow.steps.find(s => s.id === stepId);
    if (!step || step.type === 'trigger') {
      toast.error(language === "en" ? "Cannot duplicate trigger step" : "No se puede duplicar el paso activador");
      return;
    }
    const cloned = { ...step, id: `step_${Date.now()}`, config: { ...step.config } };
    const idx = workflow.steps.findIndex(s => s.id === stepId);
    const newSteps = [...workflow.steps];
    newSteps.splice(idx + 1, 0, cloned);
    const updatedWorkflow = { ...workflow, steps: newSteps };
    setWorkflows(workflows.map(w => w.id === workflow.id ? updatedWorkflow : w));
    toast.success(language === "en" ? "Step duplicated" : "Paso duplicado");
  };

  const handleSelectTemplate = (templateSteps: Omit<WorkflowStep, 'id'>[]) => {
    if (!workflow) return;
    // Add IDs to template steps and merge with existing workflow
    const newSteps = templateSteps.map((step) => ({
      ...step,
      id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }));
    const updatedWorkflow = {
      ...workflow,
      steps: newSteps,
    };
    setWorkflows(workflows.map(w => w.id === workflow.id ? updatedWorkflow : w));
    toast.success(language === "en" ? "Template loaded. Configure each step as needed." : "Plantilla cargada. Configura cada paso según sea necesario.");
  };

  const handleEditStep = (stepId: string) => {
    setEditingStepId(stepId);
    setShowConfigModal(true);
  };

  const handleUpdateStepConfig = (config: Record<string, any>) => {
    if (!workflow || !editingStepId) return;

    const updatedSteps = workflow.steps.map((s) => {
      if (s.id === editingStepId) {
        const updatedStep = { ...s, config };

        // Auto-generate label for filter steps
        if (s.service === "filter") {
          const op = OPERATOR_LABELS[config.operator] ?? config.operator;
          const val = ["is_empty", "is_not_empty"].includes(config.operator) ? "" : ` "${config.value}"`;
          updatedStep.label = `Only continue if ${config.field} ${op}${val}`;
        }

        return updatedStep;
      }
      return s;
    });

    const updatedWorkflow = {
      ...workflow,
      steps: updatedSteps,
    };
    setWorkflows(workflows.map(w => w.id === workflow.id ? updatedWorkflow : w));
  };

  const handleTestComplete = (stepId: string, output: Record<string, any>) => {
    setStepTestResults(prev => ({ ...prev, [stepId]: output }));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!workflow || !over || active.id === over.id) return;

    const activeIndex = workflow.steps.findIndex((s) => s.id === active.id);
    const overIndex = workflow.steps.findIndex((s) => s.id === over.id);

    if (activeIndex === 0) {
      toast.error(language === "en" ? "Cannot move trigger step" : "No se puede mover el paso activador");
      return;
    }

    const updatedWorkflow = {
      ...workflow,
      steps: arrayMove(workflow.steps, activeIndex, overIndex),
    };
    setWorkflows(workflows.map(w => w.id === workflow.id ? updatedWorkflow : w));
  };

  const handleCreateNewWorkflow = async () => {
    if (!clientId || !newWorkflowName.trim()) {
      toast.error(language === "en" ? "Please enter a workflow name" : "Por favor ingresa un nombre");
      return;
    }

    setWorkflowSaving(true);
    try {
      const { data } = await supabase.from("client_workflows").insert([
        {
          client_id: clientId,
          name: newWorkflowName,
          description: "",
          steps: [
            {
              id: "trigger_1",
              type: "trigger",
              service: "webhooks",
              action: "new_facebook_lead",
              label: "Trigger on new Facebook Lead",
              config: {},
            },
          ],
          is_active: true,
        },
      ]).select();

      if (data && data.length > 0) {
        const newWorkflow = data[0] as Workflow;
        setWorkflows([...workflows, newWorkflow]);
        setSelectedWorkflowId(newWorkflow.id);
        setNewWorkflowName("");
        setShowNewWorkflowInput(false);
        toast.success(language === "en" ? "Workflow created" : "Flujo creado");
      }
    } catch (error) {
      console.error("Error creating workflow:", error);
      toast.error(language === "en" ? "Failed to create workflow" : "Error al crear flujo");
    } finally {
      setWorkflowSaving(false);
    }
  };

  const handleDeleteWorkflow = async (workflowId: string) => {
    if (workflows.length <= 1) {
      toast.error(language === "en" ? "Cannot delete the last workflow" : "No se puede eliminar el último flujo");
      return;
    }

    if (!window.confirm(language === "en" ? "Are you sure you want to delete this workflow?" : "¿Estás seguro de que deseas eliminar este flujo?")) {
      return;
    }

    setWorkflowSaving(true);
    try {
      await supabase
        .from("client_workflows")
        .delete()
        .eq("id", workflowId);

      const remaining = workflows.filter(w => w.id !== workflowId);
      setWorkflows(remaining);
      setSelectedWorkflowId(remaining[0]?.id || null);
      toast.success(language === "en" ? "Workflow deleted" : "Flujo eliminado");
    } catch (error) {
      console.error("Error deleting workflow:", error);
      toast.error(language === "en" ? "Failed to delete workflow" : "Error al eliminar flujo");
    } finally {
      setWorkflowSaving(false);
    }
  };

  const handleTestRun = async (testData: TestData) => {
    if (!workflow || !clientId) return;
    setIsTestRunning(true);
    setTestRunResults(null);

    try {
      // Call execute-workflow edge function with test data
      const { data, error } = await supabase.functions.invoke("execute-workflow", {
        body: {
          workflow_id: workflow.id,
          client_id: clientId,
          trigger_data: {
            full_name: testData.full_name,
            email: testData.email,
            phone: testData.phone,
            status: "new",
            source: "manual_test",
            created_at: new Date().toISOString(),
          },
          steps: workflow.steps,
        },
      });

      if (error) {
        console.error("Test run error:", error);
        setTestRunResults({
          status: "failed",
          error_message: error.message || "Execution failed",
        });
      } else if (data) {
        setTestRunResults({
          status: data.status === "success" ? "completed" : "failed",
          execution_id: data.execution_id,
          duration: data.duration,
          steps_executed: data.steps_results,
          error_message: data.error,
        });
      }
    } catch (err: any) {
      console.error("Test run exception:", err);
      setTestRunResults({
        status: "failed",
        error_message: err.message || "Unknown error occurred",
      });
    } finally {
      setIsTestRunning(false);
    }
  };

  const handleSequentialTestRun = async (testData?: TestData) => {
    if (!workflow) return;

    setStepRunStatuses({});
    setIsTestRunning(true);
    setShowLiveDrawer(true);

    // Build initial trigger data
    const triggerStep = workflow.steps.find(s => s.type === 'trigger');
    const savedTrigger = triggerStep ? stepTestResults[triggerStep.id] : null;
    const triggerData: Record<string, any> = testData
      ? {
          full_name: testData.full_name,
          name: testData.full_name,
          email: testData.email,
          phone: testData.phone,
          status: 'new',
          source: 'manual_test',
          created_at: new Date().toISOString(),
        }
      : savedTrigger || {
          full_name: 'Test Lead',
          name: 'Test Lead',
          email: 'test@example.com',
          phone: '+1 (555) 000-0000',
          status: 'Meta Ad (Not Booked)',
          source: 'Facebook Lead',
          created_at: new Date().toISOString(),
        };

    const newStepResults: Record<string, Record<string, any>> = { ...stepTestResults };
    const stepContext: Record<string, Record<string, any>> = {};

    for (const step of workflow.steps) {
      // Trigger step: mark as passed immediately
      if (step.type === 'trigger') {
        setStepRunStatuses(prev => ({ ...prev, [step.id]: 'running' }));
        await new Promise(r => setTimeout(r, 400)); // brief visual delay
        setStepRunStatuses(prev => ({ ...prev, [step.id]: 'passed' }));
        newStepResults[step.id] = triggerData;
        continue;
      }

      // Action step: test via edge function
      setStepRunStatuses(prev => ({ ...prev, [step.id]: 'running' }));

      try {
        const { data, error } = await supabase.functions.invoke('test-workflow-step', {
          body: {
            step: { id: step.id, service: step.service, action: step.action, config: step.config },
            trigger_data: triggerData,
            step_context: stepContext,
          }
        });

        if (error || !data || data.status === 'failed') {
          const errMsg = data?.error || error?.message || 'Unknown error';
          setStepRunStatuses(prev => ({ ...prev, [step.id]: 'failed' }));
          toast.error(`Step failed: ${step.label || step.service}`, { description: errMsg });
          setIsTestRunning(false);
          return; // stop on first failure
        }

        setStepRunStatuses(prev => ({ ...prev, [step.id]: 'passed' }));
        if (data.output) {
          stepContext[step.id] = data.output;
          newStepResults[step.id] = data.output;
        }
      } catch (err: any) {
        setStepRunStatuses(prev => ({ ...prev, [step.id]: 'failed' }));
        toast.error(`Step failed: ${step.label || step.service}`, { description: err.message });
        setIsTestRunning(false);
        return;
      }
    }

    // All passed
    setStepTestResults(newStepResults);
    toast.success('All steps passed!');
    setIsTestRunning(false);
  };

  const loadHistory = async () => {
    if (!workflow) return;
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from("workflow_executions")
        .select("*")
        .eq("workflow_id", workflow.id)
        .order("created_at", { ascending: false })
        .limit(20);

      setExecutionHistory(data || []);
    } catch (err) {
      console.error("Error loading history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleActive = async (active: boolean) => {
    if (!workflow || !clientId) return;

    const updated = { ...workflow, is_active: active };
    setWorkflows(workflows.map(w => w.id === workflow.id ? updated : w));

    setWorkflowSaving(true);
    try {
      await supabase
        .from("client_workflows")
        .update({
          is_active: active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workflow.id);

      toast.success(
        active
          ? (language === "en" ? "Workflow activated" : "Flujo activado")
          : (language === "en" ? "Workflow paused" : "Flujo pausado")
      );
    } catch (error) {
      console.error("Error toggling workflow:", error);
      setWorkflows(workflows.map(w => w.id === workflow.id ? workflow : w)); // revert on error
      toast.error(language === "en" ? "Failed to update workflow" : "Error al actualizar el flujo");
    } finally {
      setWorkflowSaving(false);
    }
  };

  const handleSaveWorkflow = async () => {
    if (!workflow || !clientId) return;
    setWorkflowSaving(true);

    try {
      // Extract trigger_type and trigger_config from trigger step
      const triggerStep = workflow.steps.find(s => s.type === "trigger");
      const triggerType = triggerStep?.config?.trigger_type || 'new_lead';
      const { trigger_type: _, ...triggerConfig } = triggerStep?.config || {};

      if (workflow.id) {
        // Update existing workflow
        await supabase
          .from("client_workflows")
          .update({
            name: workflow.name,
            description: workflow.description,
            steps: workflow.steps,
            is_active: workflow.is_active,
            trigger_type: triggerType,
            trigger_config: triggerConfig,
            updated_at: new Date().toISOString(),
          })
          .eq("id", workflow.id);
      } else {
        // Create new workflow
        const { data } = await supabase.from("client_workflows").insert([
          {
            client_id: clientId,
            name: workflow.name,
            description: workflow.description,
            steps: workflow.steps,
            is_active: workflow.is_active,
            trigger_type: triggerType,
            trigger_config: triggerConfig,
          },
        ]).select();

        if (data && data.length > 0) {
          const newWorkflow = { ...workflow, id: data[0].id };
          setWorkflows(workflows.map(w => w.id === workflow.id ? newWorkflow : w));
          setSelectedWorkflowId(data[0].id);
        }
      }

      toast.success(language === "en" ? "Workflow saved" : "Flujo guardado");
    } catch (error) {
      console.error("Error saving workflow:", error);
      toast.error(language === "en" ? "Failed to save workflow" : "Error al guardar el flujo");
    } finally {
      setWorkflowSaving(false);
    }
  };

  if (loading || workflowLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || (!isAdmin && !isUser && !isVideographer) || !workflow) {
    navigate("/dashboard");
    return null;
  }

  const editingStep = workflow.steps.find((s) => s.id === editingStepId);

  return (
    <div className="min-h-screen bg-background flex" style={{ fontFamily: "Arial, sans-serif" }}>
      <AnimatedDots />
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <DashboardSidebar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} currentPath="/workflow" />

      <main className="flex-1 flex flex-col min-h-screen">
        <DashboardTopBar sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

        <div className="flex-1 flex flex-col px-6 py-8">
          {/* Header */}
          <motion.button
            onClick={() => navigate(`/clients/${clientId}`)}
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6 w-fit"
            initial="hidden"
            animate="visible"
            custom={0}
            variants={fadeUp}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {language === "en" ? "Back to client" : "Volver al cliente"}
          </motion.button>

          {/* Workflow Selector */}
          <motion.div
            className="mb-6 flex items-center gap-2 flex-wrap"
            initial="hidden"
            animate="visible"
            custom={0.5}
            variants={fadeUp}
          >
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {workflows.map((w) => (
                <div key={w.id} className="relative group">
                  <button
                    onClick={() => setSelectedWorkflowId(w.id)}
                    className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                      selectedWorkflowId === w.id
                        ? "bg-blue-600 text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {w.name}
                  </button>
                  {workflows.length > 1 && (
                    <button
                      onClick={() => handleDeleteWorkflow(w.id)}
                      className="absolute -top-2 -right-2 rounded-full bg-red-500 text-white p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      title={language === "en" ? "Delete workflow" : "Eliminar flujo"}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowNewWorkflowInput(!showNewWorkflowInput)}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded text-xs font-medium text-muted-foreground hover:text-foreground bg-muted/50 hover:bg-muted transition-colors"
            >
              <Plus className="w-3 h-3" />
              {language === "en" ? "New" : "Nuevo"}
            </button>
            {showNewWorkflowInput && (
              <div className="flex gap-1">
                <Input
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  placeholder={language === "en" ? "Workflow name" : "Nombre del flujo"}
                  className="h-7 text-xs"
                  onKeyPress={(e) => {
                    if (e.key === "Enter") handleCreateNewWorkflow();
                  }}
                  disabled={workflowSaving}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={handleCreateNewWorkflow}
                  disabled={workflowSaving}
                  className="h-7 text-xs bg-blue-600 hover:bg-blue-700"
                >
                  {language === "en" ? "Create" : "Crear"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setShowNewWorkflowInput(false);
                    setNewWorkflowName("");
                  }}
                  disabled={workflowSaving}
                  className="h-7 text-xs"
                >
                  {language === "en" ? "Cancel" : "Cancelar"}
                </Button>
              </div>
            )}
          </motion.div>

          {/* Centered Content Wrapper */}
          <div className="w-full max-w-2xl mx-auto">
            <motion.div className="mb-8" initial="hidden" animate="visible" custom={1} variants={fadeUp}>
              <div className="flex items-center gap-3 mb-4">
                <Workflow className="w-8 h-8 text-blue-400" />
                <div>
                  <h1 className="text-3xl font-bold text-foreground">{clientName} - Workflow</h1>
                  <p className="text-sm text-muted-foreground">
                    {language === "en" ? "Zapier-style workflow automation" : "Automatización de flujo tipo Zapier"}
                  </p>
                </div>
              </div>

              {/* Workflow Name & Controls */}
              <div className="space-y-3 mb-4">
                <div className="flex items-center gap-2">
                  <Input
                    value={workflow.name}
                    onChange={(e) => setWorkflows(workflows.map(w =>
                      w.id === workflow.id ? { ...workflow, name: e.target.value } : w
                    ))}
                    className="max-w-sm"
                    placeholder="Workflow name"
                  />
                  <Button
                    onClick={() => setShowTestRunModal(true)}
                    disabled={workflowSaving || isTestRunning}
                    variant="outline"
                    className="gap-2"
                  >
                    <Play className="w-4 h-4" />
                    {language === "en" ? "Test Run" : "Prueba"}
                  </Button>
                  <Button
                    onClick={() => {
                      setShowHistory(true);
                      loadHistory();
                    }}
                    disabled={workflowSaving}
                    variant="outline"
                    className="gap-2"
                  >
                    <Clock className="w-4 h-4" />
                    {language === "en" ? "History" : "Historial"}
                  </Button>
                  <Button
                    onClick={() => setShowTemplates(true)}
                    disabled={workflowSaving}
                    variant="outline"
                    className="gap-2"
                  >
                    <Zap className="w-4 h-4" />
                    {language === "en" ? "Templates" : "Plantillas"}
                  </Button>
                  <Button onClick={handleSaveWorkflow} disabled={workflowSaving} className="bg-blue-600 hover:bg-blue-700">
                    {workflowSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    {language === "en" ? "Save" : "Guardar"}
                  </Button>
                </div>

                {/* Status Toggle */}
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Circle
                    className={`w-3 h-3 ${workflow.is_active ? "fill-green-500 text-green-500" : "fill-slate-400 text-slate-400"}`}
                  />
                  <span className="text-sm font-medium">
                    {workflow.is_active
                      ? language === "en" ? "Active" : "Activo"
                      : language === "en" ? "Paused" : "Pausado"}
                  </span>
                  <Switch
                    checked={workflow.is_active}
                    onCheckedChange={handleToggleActive}
                    disabled={workflowSaving}
                    className="ml-auto"
                  />
                </div>
              </div>
            </motion.div>

            {/* Workflow Canvas */}
            <motion.div
              className="card-glass-17 p-8"
              initial="hidden"
              animate="visible"
              custom={2}
              variants={fadeUp}
            >
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={workflow.steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4">
                  <AnimatePresence>
                    {workflow.steps.map((step, idx) => (
                      <div key={step.id}>
                        <WorkflowStep
                          id={step.id}
                          type={step.type}
                          service={step.service}
                          action={step.action}
                          label={step.label}
                          stepNumber={idx + 1}
                          onEdit={() => handleEditStep(step.id)}
                          onDelete={() => handleDeleteStep(step.id)}
                          onDuplicate={() => handleDuplicateStep(step.id)}
                          tested={!!stepTestResults[step.id]}
                          runStatus={stepRunStatuses[step.id] || 'idle'}
                        />

                        {/* Add Step Button (between steps) */}
                        {idx < workflow.steps.length - 1 || true ? (
                          <motion.div
                            className="flex justify-center py-2"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <div className="w-0.5 h-4 bg-gradient-to-b from-purple-500/50 to-transparent" />
                          </motion.div>
                        ) : null}

                        {/* Add Step Trigger */}
                        {idx < workflow.steps.length || true ? (
                          <motion.div
                            className="flex justify-center py-2"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                          >
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setAddStepAfter(step.id);
                                setShowAddStepModal(true);
                              }}
                              className="h-8 gap-2 text-xs"
                            >
                              <Plus className="w-3 h-3" />
                              {language === "en" ? "Add action" : "Agregar acción"}
                            </Button>
                          </motion.div>
                        ) : null}
                      </div>
                    ))}
                  </AnimatePresence>
                </div>
              </SortableContext>
            </DndContext>

            {/* Add First Action Button (if only trigger) */}
            {workflow.steps.length === 1 && (
              <div className="mt-6 flex justify-center">
                <Button
                  onClick={() => {
                    setAddStepAfter(workflow.steps[0].id);
                    setShowAddStepModal(true);
                  }}
                  className="gap-2 bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" />
                  {language === "en" ? "Add your first action" : "Agregar tu primera acción"}
                </Button>
              </div>
            )}
          </motion.div>

            {/* Info Box */}
            <motion.div
              className="mt-6 card-glass-17 p-4 bg-blue-500/10 border-blue-500/20"
              initial="hidden"
              animate="visible"
              custom={3}
              variants={fadeUp}
            >
              <p className="text-sm text-muted-foreground">
                💡 {language === "en" ? "Phase 1: Build your workflow visually. Integrations coming soon." : "Fase 1: Construye tu flujo visualmente. Integraciones próximamente."}
              </p>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Modals */}
      <AddStepModal
        open={showAddStepModal}
        onOpenChange={setShowAddStepModal}
        onSelectService={(service) => handleAddStep(service, addStepAfter)}
      />

      {editingStep && (
        <StepConfigModal
          open={showConfigModal}
          onOpenChange={setShowConfigModal}
          service={editingStep.service}
          action={editingStep.action}
          config={editingStep.config}
          onSave={handleUpdateStepConfig}
          clientId={clientId}
          prevSteps={workflow.steps.slice(0, workflow.steps.findIndex(s => s.id === editingStepId))}
          stepId={editingStep.id}
          label={editingStep.label}
          stepTestResults={stepTestResults}
          onTestComplete={handleTestComplete}
        />
      )}

      <TestRunModal
        open={showTestRunModal}
        onOpenChange={setShowTestRunModal}
        onRunTest={handleSequentialTestRun}
        isRunning={isTestRunning}
        results={testRunResults}
        savedTriggerData={workflow ? stepTestResults[workflow.steps[0]?.id] : undefined}
      />

      <LiveRunDrawer
        open={showLiveDrawer}
        onOpenChange={setShowLiveDrawer}
        steps={workflow?.steps || []}
        stepRunStatuses={stepRunStatuses}
        stepTestResults={stepTestResults}
        isRunning={isTestRunning}
        onRetry={() => {
          setStepRunStatuses({});
          handleSequentialTestRun();
        }}
      />

      {/* Execution History Dialog */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{language === "en" ? "Execution History" : "Historial de Ejecuciones"}</DialogTitle>
          </DialogHeader>

          {historyLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : executionHistory.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {language === "en" ? "No execution history yet" : "Sin historial de ejecuciones aún"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {executionHistory.map((execution: any) => (
                <div key={execution.id} className="p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <Circle
                          className={`w-2 h-2 flex-shrink-0 ${
                            execution.status === "completed"
                              ? "fill-green-500 text-green-500"
                              : execution.status === "failed"
                              ? "fill-red-500 text-red-500"
                              : "fill-yellow-500 text-yellow-500"
                          }`}
                        />
                        <span className="text-sm font-medium capitalize">
                          {execution.status === "completed"
                            ? language === "en" ? "Completed" : "Completado"
                            : execution.status === "failed"
                            ? language === "en" ? "Failed" : "Fallido"
                            : language === "en" ? "Running" : "Ejecutando"}
                        </span>
                        {execution.duration_ms && (
                          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                            {(execution.duration_ms / 1000).toFixed(2)}s
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(execution.created_at).toLocaleString(
                          language === "en" ? "en-US" : "es-ES"
                        )}
                      </p>
                      {execution.error_message && (
                        <p className="text-xs text-red-500 mt-2">{execution.error_message}</p>
                      )}
                    </div>
                  </div>

                  {/* Step Results */}
                  {execution.steps_results && execution.steps_results.length > 0 && (
                    <div className="mt-3 pl-6 border-l space-y-2">
                      {execution.steps_results.map((step: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <span className="font-medium">{step.step_id || `Step ${idx + 1}`}</span>
                          <span className={`ml-2 ${step.status === "success" ? "text-green-600" : "text-red-600"}`}>
                            {step.status === "success" ? "✓" : "✗"} {step.status}
                          </span>
                          {step.message && <p className="text-muted-foreground mt-1">{step.message}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <WorkflowTemplates
        open={showTemplates}
        onOpenChange={setShowTemplates}
        onSelectTemplate={handleSelectTemplate}
      />
    </div>
  );
}
