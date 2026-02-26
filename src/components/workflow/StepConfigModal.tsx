import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { Loader2, Play, ChevronRight, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { WorkflowStep } from "@/pages/ClientWorkflow";

interface StepConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service: string;
  action: string;
  config: Record<string, any>;
  onSave: (config: Record<string, any>) => void;
  clientId?: string;
  prevSteps?: WorkflowStep[];
  stepId?: string;
  label?: string;
  stepTestResults?: Record<string, Record<string, any>>;
  onTestComplete?: (stepId: string, output: Record<string, any>) => void;
}

const TRIGGER_FIELDS = [
  { key: "full_name", label: "Full Name", variable: "lead.name" },
  { key: "email", label: "Email", variable: "lead.email" },
  { key: "phone", label: "Phone", variable: "lead.phone" },
  { key: "status", label: "Status", variable: "lead.status" },
  { key: "source", label: "Source", variable: "lead.source" },
  { key: "created_at", label: "Date Created", variable: "lead.created_at" },
];

// Step output schemas for Data Mapper
const STEP_OUTPUT_SCHEMAS: Record<string, string[]> = {
  'notion.search_record': ['page_id', 'title', 'url'],
  'notion.create_record': ['page_id', 'url'],
  'notion.update_record': ['page_id'],
  'email.send_email': ['sent_to'],
  'formatter.date_time': ['formatted_date'],
  'filter.if_condition': ['passed'],
};

// VariablePicker component - small + button that inserts variables
function VariablePicker({ fieldId, value, onChange, prevSteps, triggerData, stepOutputResults }: {
  fieldId: string;
  value: string;
  onChange: (v: string) => void;
  prevSteps?: WorkflowStep[];
  triggerData?: Record<string, any> | null;
  stepOutputResults?: Record<string, Record<string, any>>;
}) {
  const [open, setOpen] = useState(false);

  const insert = (variable: string) => {
    const el = document.getElementById(fieldId) as HTMLInputElement | HTMLTextAreaElement | null;
    const tag = `{{${variable}}}`;
    if (el && el.selectionStart !== null) {
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      onChange(value.slice(0, start) + tag + value.slice(end));
    } else {
      onChange(value + tag);
    }
    setOpen(false);
  };

  // Compute available step outputs
  const stepOutputs = (prevSteps || [])
    .filter(s => s.type !== 'trigger')
    .map(step => {
      const key = `${step.service}.${step.action}`;
      const fields = STEP_OUTPUT_SCHEMAS[key] || [];
      return { step, fields };
    })
    .filter(item => item.fields.length > 0);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="ml-1 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-xs font-bold flex items-center justify-center transition-colors"
        title="Insert variables"
      >
        +
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 w-72 space-y-2 max-h-80 overflow-y-auto">
          {/* Trigger data section */}
          <div>
            <p className="text-xs text-muted-foreground px-2 py-1 font-semibold">Trigger data</p>
            <div className="space-y-1">
              {TRIGGER_FIELDS.map((f) => {
                const resolved = triggerData?.[f.key];
                return (
                  <button
                    key={f.variable}
                    type="button"
                    onClick={() => insert(f.variable)}
                    className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-muted/60 transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1 min-w-0">
                      <span className="text-blue-400 font-mono shrink-0">{`{{${f.variable}}}`}</span>
                      <span className="text-muted-foreground font-sans truncate">{f.label}</span>
                    </div>
                    {resolved !== undefined && (
                      <span
                        className="text-green-400 text-[10px] font-mono truncate max-w-[90px] shrink-0"
                        title={String(resolved)}
                      >
                        {String(resolved).length > 18 ? String(resolved).slice(0, 18) + '…' : String(resolved)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step outputs section */}
          {stepOutputs.length > 0 && (
            <div className="border-t border-border pt-2">
              <p className="text-xs text-muted-foreground px-2 py-1 font-semibold">Step outputs</p>
              <div className="space-y-2">
                {stepOutputs.map(({ step, fields }) => (
                  <div key={step.id}>
                    <p className="text-xs text-green-400 px-2 py-0.5 font-semibold">{step.service} - {step.action}</p>
                    <div className="space-y-0.5 ml-2">
                      {fields.map(field => {
                        const resolved = stepOutputResults?.[step.id]?.[field];
                        return (
                          <button
                            key={field}
                            type="button"
                            onClick={() => insert(`steps.${step.id}.${field}`)}
                            className="w-full text-left text-xs px-2 py-1 rounded-lg hover:bg-muted/60 text-green-400 font-mono transition-colors flex items-center justify-between gap-2"
                          >
                            <span className="truncate">{`{{steps.${step.id}.${field}}}`}</span>
                            {resolved !== undefined && (
                              <span
                                className="text-cyan-400 text-[10px] truncate max-w-[80px]"
                                title={String(resolved)}
                              >
                                {String(resolved).length > 15 ? String(resolved).slice(0, 15) + '…' : String(resolved)}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const MOCK_TRIGGER_DATA = {
  full_name: 'Test Lead',
  name: 'Test Lead',
  email: 'test@example.com',
  phone: '+1 (555) 000-0000',
  status: 'Meta Ad (Not Booked)',
  source: 'Facebook Lead',
  created_at: new Date().toISOString(),
};

export default function StepConfigModal({ open, onOpenChange, service, action, config, onSave, clientId, prevSteps, stepId, label, stepTestResults, onTestComplete }: StepConfigModalProps) {
  const [formData, setFormData] = useState<Record<string, any>>(config || {});
  const [saving, setSaving] = useState(false);
  const [testData, setTestData] = useState<Record<string, any> | null>(null);

  // Derive saved trigger data from parent's stepTestResults
  const triggerStep = prevSteps?.find(s => s.type === 'trigger');
  const savedTriggerData: Record<string, any> | null =
    (triggerStep && stepTestResults?.[triggerStep.id]) ? stepTestResults![triggerStep.id] : null;
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [notionFields, setNotionFields] = useState<Array<{ name: string; type: string; id: string; options?: Array<{ name: string }> }>>([]);
  const [notionPages, setNotionPages] = useState<Array<{ id: string; title: string }>>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Facebook state
  const [fbPages, setFbPages] = useState<Array<{ page_id: string; page_name: string; is_subscribed: boolean }>>([]);
  const [fbForms, setFbForms] = useState<Array<{ form_id: string; form_name: string; status: string }>>([]);
  const [fbLoadingPages, setFbLoadingPages] = useState(false);
  const [fbLoadingForms, setFbLoadingForms] = useState(false);
  const [fbConnecting, setFbConnecting] = useState(false);
  const [fbError, setFbError] = useState<string | null>(null);

  // Step testing state
  const [stepTestResult, setStepTestResult] = useState<{
    status: 'completed' | 'failed' | 'skipped';
    output?: Record<string, any>;
    error?: string;
    duration?: number;
  } | null>(null);
  const [stepTesting, setStepTesting] = useState(false);

  useEffect(() => {
    const newConfig = config || {};
    setFormData(newConfig);
    setTestData(null);
    setTestError(null);
    setNotionFields([]);
    setNotionPages([]);
    setFieldError(null);
    setFbError(null);
    setFbPages([]);
    setFbForms([]);
    setStepTestResult(null);

    // Auto-load client's Notion DB if not already set and this is a Notion action
    if (open && !newConfig?.database_id && service === "notion" && clientId) {
      supabase
        .from("client_notion_mapping")
        .select("notion_database_id")
        .eq("client_id", clientId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.notion_database_id) {
            setFormData((prev) => ({ ...prev, database_id: data.notion_database_id }));
            // Auto-fetch schema for update_record action
            if (action === "update_record") {
              fetchNotionSchema(data.notion_database_id);
            }
          }
        })
        .catch((err) => {
          console.error("Error loading client Notion mapping:", err);
        });
    }
    // Auto-load Notion schema if database_id is already set and this is an update_record
    else if (open && newConfig?.database_id && service === "notion" && action === "update_record") {
      fetchNotionSchema(newConfig.database_id);
    }

    // Load Facebook pages if opening webhook trigger or if trigger_type is new_lead
    if (open && (service === "webhooks" || config?.trigger_type === "new_lead")) {
      loadFbPages();
    }
  }, [config, open, service, action, clientId]);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((resolve) => setTimeout(resolve, 300)); // Simulate save
    onSave(formData);
    onOpenChange(false);
    setSaving(false);
  };

  const handleTest = async (useMockData: boolean = false) => {
    setTesting(true);
    setTestError(null);
    try {
      let data;

      if (useMockData) {
        // Directly use mock data
        data = MOCK_TRIGGER_DATA;
      } else if (clientId) {
        // Try to fetch real lead data
        const { data: leadData, error } = await supabase
          .from("leads")
          .select("*")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error || !leadData) {
          // Fall back to mock data instead of failing
          data = MOCK_TRIGGER_DATA;
        } else {
          data = leadData;
        }
      } else {
        // No clientId, use mock data
        data = MOCK_TRIGGER_DATA;
      }

      setTesting(false);
      setTestData(data);
      // Store trigger test data if callback is provided
      if (onTestComplete && stepId && service === 'webhooks') {
        onTestComplete(stepId, data);
      }
    } catch (err) {
      setTesting(false);
      // Fall back to mock data on error
      const mockData = MOCK_TRIGGER_DATA;
      setTestData(mockData);
      if (onTestComplete && stepId && service === 'webhooks') {
        onTestComplete(stepId, mockData);
      }
    }
  };

  const fetchNotionSchema = async (dbId: string) => {
    if (!dbId) return;
    // Extract 32-char hex ID from anywhere in the string (handles full Notion URLs)
    const stripped = dbId.split('?')[0].replace(/-/g, '');
    const match = stripped.match(/[0-9a-f]{32}/i);
    if (!match) {
      setFieldError("Invalid database ID — paste the 32-character ID or full Notion database URL.");
      return;
    }
    const hex = match[0].toLowerCase();
    const formattedId = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    setLoadingFields(true);
    setFieldError(null);
    try {
      const { data, error } = await supabase.functions.invoke('get-notion-db-schema', {
        body: { database_id: formattedId }
      });

      if (error) {
        console.error("Error fetching Notion schema:", error);
        setFieldError("Failed to fetch database schema. Check the database ID.");
        setNotionFields([]);
        setNotionPages([]);
      } else if (data?.properties) {
        // Convert options format from API
        const fields = data.properties.map((prop: any) => ({
          name: prop.name,
          type: prop.type,
          id: prop.id,
          options: prop.options?.map((opt: any) => ({ name: opt.name })) || []
        }));
        setNotionFields(fields);
        setNotionPages(data.pages || []);
      }
    } catch (err) {
      console.error("Failed to fetch Notion schema:", err);
      setFieldError("Failed to connect to Notion API");
      setNotionFields([]);
      setNotionPages([]);
    }
    setLoadingFields(false);
  };

  // Facebook OAuth helpers
  const loadFbPages = async () => {
    if (!clientId) return;
    setFbLoadingPages(true);
    setFbError(null);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-oauth", {
        body: { action: "get_pages", client_id: clientId }
      });
      if (error) throw error;
      setFbPages(data?.pages || []);
      // If a page is already selected, auto-load its forms
      if (formData.facebook_page_id && data?.pages?.length > 0) {
        loadFbForms(formData.facebook_page_id);
      }
    } catch (err: any) {
      setFbError(err.message || "Failed to load Facebook pages");
    }
    setFbLoadingPages(false);
  };

  const loadFbForms = async (pageId: string) => {
    if (!clientId || !pageId) return;
    setFbLoadingForms(true);
    try {
      const { data, error } = await supabase.functions.invoke("facebook-oauth", {
        body: { action: "get_forms", client_id: clientId, page_id: pageId }
      });
      if (error) throw error;
      setFbForms(data?.forms || []);
    } catch (err: any) {
      setFbError("Failed to load forms: " + err.message);
    }
    setFbLoadingForms(false);
  };

  const connectFacebook = async () => {
    if (!clientId) return;
    setFbConnecting(true);
    setFbError(null);

    try {
      // Get OAuth URL from edge function (use fetch instead of invoke for GET)
      const baseUrl = supabase.supabaseUrl;
      const response = await fetch(
        `${baseUrl}/functions/v1/facebook-oauth?action=get_url&client_id=${clientId}&return_path=${encodeURIComponent(window.location.pathname)}`,
        {
          headers: {
            "Authorization": `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ""}`,
            "apikey": supabase.supabaseKey,
          }
        }
      );
      const urlData = await response.json();
      if (!urlData.url) throw new Error("Failed to get OAuth URL");

      // Open popup
      const popup = window.open(
        urlData.url,
        "facebook_oauth",
        "width=600,height=700,top=100,left=200,scrollbars=yes"
      );

      if (!popup) {
        throw new Error("Popup was blocked. Please allow popups for this site.");
      }

      // Listen for message back from /facebook-callback
      const handler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;

        if (event.data?.type === "FACEBOOK_AUTH_SUCCESS") {
          window.removeEventListener("message", handler);
          setFbConnecting(false);
          loadFbPages();
        } else if (event.data?.type === "FACEBOOK_AUTH_ERROR") {
          window.removeEventListener("message", handler);
          setFbConnecting(false);
          setFbError(event.data.error || "Facebook connection failed");
        }
      };

      window.addEventListener("message", handler);

      // Cleanup if popup is closed manually
      const pollClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(pollClosed);
          window.removeEventListener("message", handler);
          setFbConnecting(false);
        }
      }, 500);

    } catch (err: any) {
      setFbConnecting(false);
      setFbError(err.message);
    }
  };

  const subscribeWebhook = async (pageId: string) => {
    if (!clientId) return;
    try {
      const { data, error } = await supabase.functions.invoke("facebook-oauth", {
        body: { action: "subscribe_webhook", client_id: clientId, page_id: pageId }
      });
      if (error) {
        setFbError("Webhook subscription failed: " + error.message);
      } else {
        // Update local state
        setFbPages(prev => prev.map(p => p.page_id === pageId ? { ...p, is_subscribed: true } : p));
      }
    } catch (err: any) {
      setFbError("Error: " + err.message);
    }
  };

  // Test individual step
  const handleTestStep = async () => {
    if (!clientId || service === 'webhooks') return;

    setStepTesting(true);
    setStepTestResult(null);

    try {
      // Build trigger data: use saved trigger data, then testData, then mock
      const triggerData = savedTriggerData || testData || MOCK_TRIGGER_DATA;

      // Build step_context from previous step results (all steps before current one)
      const step_context: Record<string, any> = {};
      if (prevSteps && stepTestResults) {
        prevSteps.forEach(step => {
          if (step.type !== 'trigger' && stepTestResults[step.id]) {
            step_context[step.id] = stepTestResults[step.id];
          }
        });
      }

      const { data, error } = await supabase.functions.invoke('test-workflow-step', {
        body: {
          step: { id: `step_${Date.now()}`, service, action, config: formData },
          trigger_data: triggerData,
          step_context: step_context
        }
      });

      setStepTesting(false);

      if (error) {
        console.error('Edge function error:', error);
        setStepTestResult({
          status: 'failed',
          error: error.message || 'Step test failed'
        });
      } else if (data) {
        setStepTestResult(data);
        // Call onTestComplete to store result in parent
        if (onTestComplete && stepId && data.output) {
          onTestComplete(stepId, data.output);
        }
      } else {
        setStepTestResult({
          status: 'failed',
          error: 'No response from server'
        });
      }
    } catch (err: any) {
      setStepTesting(false);
      console.error('Test error:', err);
      setStepTestResult({
        status: 'failed',
        error: err?.message || String(err) || 'Unknown error'
      });
    }
  };

  // Render Setup tab
  const renderSetupTab = () => {
    const serviceLabels: Record<string, string> = {
      webhooks: "Trigger",
      notion: "Notion",
      email: "Email",
      sms: "SMS",
      formatter: "Formatter",
      delay: "Delay",
      filter: "Filter",
    };
    const serviceLabel = serviceLabels[service] || service;
    const actionLabel = action
      ? action
          .replace(/_/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase())
      : "";

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-4 bg-muted/40 rounded-lg">
          <div>
            <p className="font-medium">{serviceLabel}</p>
            {actionLabel && (
              <p className="text-sm text-muted-foreground">{actionLabel}</p>
            )}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Review the step type above, then go to the Configure tab to fill in the details.
        </p>
      </div>
    );
  };

  // Render Test tab
  const renderTestTab = () => {
    // For trigger steps
    if (service === "webhooks") {
      return (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold mb-2">Test Trigger</h4>
            <p className="text-xs text-muted-foreground mb-3">
              Load test data to test this workflow. You can use real lead data from your database or test data for quick testing.
            </p>
            <div className="flex gap-2 w-full">
              <Button
                onClick={() => handleTest(false)}
                disabled={testing}
                className="gap-2 flex-1"
                variant="default"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Real Data
                  </>
                )}
              </Button>
              <Button
                onClick={() => handleTest(true)}
                disabled={testing}
                className="gap-2 flex-1"
                variant="outline"
              >
                {testing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Test Data
                  </>
                )}
              </Button>
            </div>
          </div>

          {testData && (
            <div className="bg-green-500/10 border border-green-500/30 rounded p-3 space-y-3">
              <p className="text-xs font-semibold text-green-600">Edit Test Data</p>
              <div className="space-y-2">
                {Object.entries(testData).map(([key, value]) => (
                  <div key={key} className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </label>
                    <Input
                      type="text"
                      value={typeof value === "string" ? value : JSON.stringify(value)}
                      onChange={(e) => {
                        setTestData(prev => prev ? { ...prev, [key]: e.target.value } : null);
                      }}
                      className="h-8 text-xs"
                      placeholder={`Enter ${key}`}
                    />
                  </div>
                ))}
              </div>
              <Button
                onClick={() => {
                  if (onTestComplete && stepId && testData) {
                    onTestComplete(stepId, testData);
                  }
                }}
                size="sm"
                className="w-full bg-green-600 hover:bg-green-700 text-white"
              >
                Save Test Data
              </Button>
            </div>
          )}
        </div>
      );
    }

    // For action steps
    const triggerSource = savedTriggerData
      ? `Trigger tested: ${savedTriggerData.full_name || savedTriggerData.name || 'Lead'} · ${savedTriggerData.email || ''}`
      : testData
      ? `Using loaded data: ${testData.full_name || testData.name || 'Lead'}`
      : 'No trigger data — open Trigger step → Test tab and click Real Data or Test Data';

    return (
      <div className="space-y-4">
        <div>
          <h4 className="text-sm font-semibold mb-2">Test This Step</h4>
          <p className="text-xs text-muted-foreground mb-3">{triggerSource}</p>
          <Button
            onClick={handleTestStep}
            disabled={stepTesting}
            className="gap-2 w-full"
          >
            {stepTesting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Test
              </>
            )}
          </Button>
        </div>

        {/* Previous step data preview */}
        {prevSteps && prevSteps.length > 0 && stepTestResults && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded p-3">
            <p className="text-xs font-semibold text-blue-600 mb-2">
              Available data from previous steps
            </p>
            <div className="space-y-2 text-xs">
              {prevSteps.map((step) => {
                const stepResult = stepTestResults[step.id];
                if (!stepResult) return null;
                return (
                  <div key={step.id} className="bg-black/20 rounded p-2">
                    <p className="text-blue-400 font-mono mb-1">
                      Step: {step.service} - {step.action}
                    </p>
                    <div className="space-y-0.5">
                      {Object.entries(stepResult).map(([key, value]) => (
                        <div key={key} className="text-muted-foreground">
                          <span className="text-cyan-400">{key}</span>: {String(value)}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Test Result Display */}
        {stepTestResult && (
          <div
            className={`rounded-lg border p-3 space-y-2 ${
              stepTestResult.status === "completed"
                ? "border-green-500/30 bg-green-500/5"
                : stepTestResult.status === "skipped"
                ? "border-yellow-500/30 bg-yellow-500/5"
                : "border-red-500/30 bg-red-500/5"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {stepTestResult.status === "completed" && (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className="text-xs font-semibold text-green-600">
                      Completed
                    </span>
                  </>
                )}
                {stepTestResult.status === "failed" && (
                  <>
                    <XCircle className="w-4 h-4 text-red-500" />
                    <span className="text-xs font-semibold text-red-600">
                      Failed
                    </span>
                  </>
                )}
                {stepTestResult.status === "skipped" && (
                  <>
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                    <span className="text-xs font-semibold text-yellow-600">
                      Skipped
                    </span>
                  </>
                )}
              </div>
              {stepTestResult.duration && (
                <span className="text-xs text-muted-foreground">
                  {stepTestResult.duration}ms
                </span>
              )}
            </div>

            {stepTestResult.error && (
              <div className="bg-red-500/10 rounded px-2 py-1.5">
                <p className="text-xs text-red-600 font-mono">
                  {stepTestResult.error}
                </p>
              </div>
            )}

            {stepTestResult.output &&
              Object.keys(stepTestResult.output).length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Output:
                  </p>
                  <div className="bg-black/30 rounded px-2 py-1.5 space-y-1 max-h-32 overflow-y-auto">
                    {Object.entries(stepTestResult.output).map(([key, value]) => (
                      <div key={key} className="text-xs text-green-400 font-mono">
                        <span className="text-yellow-400">{key}</span> →{" "}
                        <span className="text-cyan-400">{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>
    );
  };

  // Render form based on service type
  const renderForm = () => {
    switch (service) {
      case "webhooks": {
        // Trigger Type Selector for Phase 2
        const TRIGGER_TYPES = [
          { id: 'new_lead', label: 'New Lead', desc: '📥 When new Facebook lead arrives', color: 'blue' },
          { id: 'lead_status_changed', label: 'Lead Status Changed', desc: '🔄 When lead status changes to...', color: 'orange' },
          { id: 'schedule', label: 'Schedule', desc: '🕐 Run on a recurring schedule', color: 'purple' },
          { id: 'manual', label: 'Manual', desc: '▶ Triggered only by Test Run button', color: 'green' },
        ];

        const ALL_STATUSES = [
          "Meta Ad (Not Booked)", "Appointment Booked", "Canceled",
          "Follow up #1 (Not Booked)", "Follow up #2 (Not Booked)", "Follow up #3 (Not Booked)",
        ];

        const SCHEDULE_PRESETS = [
          { value: 'daily_9am', label: 'Every day at 9am' },
          { value: 'monday_9am', label: 'Every Monday at 9am' },
          { value: 'monthly_1st', label: '1st of every month at 9am' },
        ];

        const selectedTriggerType = formData.trigger_type || 'new_lead';

        return (
          <div className="space-y-4">
            {/* Trigger Type Cards */}
            <div>
              <Label className="mb-2 block text-xs font-semibold">Trigger Type</Label>
              <div className="grid grid-cols-2 gap-2">
                {TRIGGER_TYPES.map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setFormData({ ...formData, trigger_type: type.id })}
                    className={`p-3 rounded-lg border-2 transition-all text-left text-sm ${
                      selectedTriggerType === type.id
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-muted bg-muted/50 hover:border-muted-foreground/50'
                    }`}
                  >
                    <div className="font-semibold text-xs">{type.label}</div>
                    <div className="text-xs text-muted-foreground">{type.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Type-Specific Config */}
            <div className="border-t border-muted pt-4">
              {selectedTriggerType === 'new_lead' && (
                <div className="space-y-4">
                  {/* Connection Status Banner */}
                  {fbPages.length === 0 && !fbLoadingPages ? (
                    <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-orange-500" />
                        <p className="text-sm font-medium text-orange-300">Facebook not connected</p>
                      </div>
                      <p className="text-xs text-muted-foreground">Connect your Facebook account to automatically receive leads from your ad forms.</p>
                      <Button
                        onClick={connectFacebook}
                        disabled={fbConnecting}
                        className="w-full bg-[#1877F2] hover:bg-[#1468d8] text-white gap-2"
                        size="sm"
                      >
                        {fbConnecting ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                          </svg>
                        )}
                        {fbConnecting ? "Connecting..." : "Connect Facebook Account"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Connected badge + reconnect button */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500" />
                          <p className="text-xs font-medium text-green-400">
                            {fbPages.length} page{fbPages.length !== 1 ? "s" : ""} connected
                          </p>
                        </div>
                        <Button
                          onClick={connectFacebook}
                          disabled={fbConnecting}
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7 text-muted-foreground"
                        >
                          {fbConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : "Add / Reconnect"}
                        </Button>
                      </div>

                      {/* Page selector */}
                      <div className="space-y-2">
                        <Label htmlFor="fb_page_select">Facebook Page</Label>
                        {fbLoadingPages ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Loading pages...
                          </div>
                        ) : (
                          <Select
                            value={formData.facebook_page_id || ""}
                            onValueChange={(pageId) => {
                              setFormData({ ...formData, facebook_page_id: pageId, facebook_form_id: "" });
                              setFbForms([]);
                              loadFbForms(pageId);
                            }}
                          >
                            <SelectTrigger id="fb_page_select">
                              <SelectValue placeholder="Select a Facebook page..." />
                            </SelectTrigger>
                            <SelectContent>
                              {fbPages.map(page => (
                                <SelectItem key={page.page_id} value={page.page_id}>
                                  <span className="flex items-center gap-2">
                                    {page.page_name}
                                    {page.is_subscribed ? (
                                      <span className="text-xs text-green-400">● live</span>
                                    ) : (
                                      <span className="text-xs text-orange-400">○ not subscribed</span>
                                    )}
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>

                      {/* Webhook subscription warning */}
                      {formData.facebook_page_id && fbPages.find(p => p.page_id === formData.facebook_page_id && !p.is_subscribed) && (
                        <div className="rounded-lg border border-orange-500/30 bg-orange-500/10 p-3 space-y-2">
                          <p className="text-xs text-orange-300">Leads won't be received until you activate the webhook for this page.</p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 border-orange-500/50 text-orange-300 hover:bg-orange-500/20"
                            onClick={() => subscribeWebhook(formData.facebook_page_id)}
                          >
                            Activate Webhook
                          </Button>
                        </div>
                      )}

                      {/* Form selector */}
                      {formData.facebook_page_id && (
                        <div className="space-y-2">
                          <Label htmlFor="fb_form_select">Lead Form (optional)</Label>
                          {fbLoadingForms ? (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Loading forms...
                            </div>
                          ) : (
                            <>
                              <Select
                                value={formData.facebook_form_id || "ALL"}
                                onValueChange={(formId) =>
                                  setFormData({
                                    ...formData,
                                    facebook_form_id: formId === "ALL" ? "" : formId
                                  })
                                }
                              >
                                <SelectTrigger id="fb_form_select">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="ALL">All forms (accept any lead)</SelectItem>
                                  {fbForms.map(form => (
                                    <SelectItem key={form.form_id} value={form.form_id}>
                                      {form.form_name}
                                      {form.status === "archived" && (
                                        <span className="ml-1 text-muted-foreground">(archived)</span>
                                      )}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">Filter to only trigger for leads from one specific form. Leave as "All forms" to accept leads from any form on this page.</p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Error display */}
                  {fbError && (
                    <p className="text-xs text-destructive bg-red-500/10 px-2 py-1 rounded">{fbError}</p>
                  )}

                  {/* Test Trigger Button */}
                  <div className="space-y-2 border-t border-muted pt-3">
                    <Button onClick={handleTest} disabled={testing} variant="outline" size="sm" className="w-full gap-2">
                      {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      {testData ? "Re-test Trigger" : "Test Trigger (use latest lead)"}
                    </Button>
                    {testError && <p className="text-xs text-destructive bg-red-500/10 px-2 py-1 rounded">{testError}</p>}
                  </div>

                  {/* Sample Data Display */}
                  {testData && (
                    <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-3 space-y-1.5">
                      <p className="text-xs font-semibold text-green-400 mb-2">✓ Found a lead! Available data:</p>
                      {TRIGGER_FIELDS.map((f) =>
                        testData[f.key] ? (
                          <div key={f.key} className="flex items-start gap-2 text-xs">
                            <span className="text-muted-foreground min-w-fit">{f.label}:</span>
                            <span className="font-mono bg-muted/40 px-1.5 py-0.5 rounded text-foreground flex-1 break-words">{String(testData[f.key]).slice(0, 50)}</span>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              )}

              {selectedTriggerType === 'lead_status_changed' && (
                <div className="space-y-2">
                  <Label htmlFor="status_to_watch">Trigger when lead status changes to:</Label>
                  <Select value={formData.status_to_watch || ""} onValueChange={(value) => setFormData({ ...formData, status_to_watch: value })}>
                    <SelectTrigger id="status_to_watch">
                      <SelectValue placeholder="Select a status..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>{status}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">This workflow will fire whenever a lead's status is updated to the selected value</p>
                </div>
              )}

              {selectedTriggerType === 'schedule' && (
                <div className="space-y-2">
                  <Label htmlFor="schedule_preset">Schedule Preset:</Label>
                  <Select value={formData.schedule_preset || ""} onValueChange={(value) => setFormData({ ...formData, schedule_preset: value })}>
                    <SelectTrigger id="schedule_preset">
                      <SelectValue placeholder="Select a schedule..." />
                    </SelectTrigger>
                    <SelectContent>
                      {SCHEDULE_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">This workflow will run automatically on the selected schedule. Setup cron in Supabase Dashboard after deploying.</p>
                </div>
              )}

              {selectedTriggerType === 'manual' && (
                <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-3">
                  <p className="text-sm text-blue-300 font-medium">Manual Trigger</p>
                  <p className="text-xs text-blue-200 mt-1">This workflow is only triggered when you click the "Test Run" button. No automatic triggers will fire this workflow.</p>
                </div>
              )}
            </div>
          </div>
        );
      }

      case "email":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="zoho_email">Zoho Email Address</Label>
              <Input
                id="zoho_email"
                type="email"
                placeholder="your-email@zoho.com"
                value={formData.zoho_email || ""}
                onChange={(e) => setFormData({ ...formData, zoho_email: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Your Zoho Mail account email</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zoho_password">Zoho App Password</Label>
              <Input
                id="zoho_password"
                type="password"
                placeholder="Your Zoho App Password"
                value={formData.zoho_password || ""}
                onChange={(e) => setFormData({ ...formData, zoho_password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Generate an App Password in Zoho Mail settings</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="email_to">To (email address)</Label>
                <VariablePicker prevSteps={prevSteps} fieldId="email_to" value={formData.to || ""} onChange={(v) => setFormData({ ...formData, to: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
              </div>
              <Input
                id="email_to"
                placeholder="e.g., {{lead.email}}"
                value={formData.to || ""}
                onChange={(e) => setFormData({ ...formData, to: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="email_subject">Subject</Label>
                <VariablePicker prevSteps={prevSteps} fieldId="email_subject" value={formData.subject || ""} onChange={(v) => setFormData({ ...formData, subject: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
              </div>
              <Input
                id="email_subject"
                placeholder="Welcome {{lead.name}}"
                value={formData.subject || ""}
                onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="email_body">Body</Label>
                <VariablePicker prevSteps={prevSteps} fieldId="email_body" value={formData.body || ""} onChange={(v) => setFormData({ ...formData, body: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
              </div>
              <Textarea
                id="email_body"
                placeholder="Email message body..."
                value={formData.body || ""}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                className="min-h-24"
              />
            </div>
          </div>
        );

      case "notion":
        // Handle different Notion actions
        if (action === "create_record") {
          return (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notion_db">Notion Database ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="notion_db"
                    placeholder="e.g., 29ad6442e09c805a927de6e3fdb6112c"
                    value={formData.database_id || ""}
                    onChange={(e) => setFormData({ ...formData, database_id: e.target.value })}
                  />
                  {/* Browse Databases button - placeholder for future API integration */}
                  <Button size="sm" variant="outline" disabled>
                    Browse
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Paste your Notion database ID or click Browse to select</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="notion_title">Title Field Value</Label>
                  <VariablePicker prevSteps={prevSteps} fieldId="notion_title" value={formData.title || ""} onChange={(v) => setFormData({ ...formData, title: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
                </div>
                <Input
                  id="notion_title"
                  placeholder="{{lead.name}}"
                  value={formData.title || ""}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="notion_title_prop">Title Property Name</Label>
                  <Input
                    id="notion_title_prop"
                    placeholder="Name"
                    value={formData.title_property || "Name"}
                    onChange={(e) => setFormData({ ...formData, title_property: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notion_email_prop">Email Property Name</Label>
                  <Input
                    id="notion_email_prop"
                    placeholder="Email"
                    value={formData.email_property || ""}
                    onChange={(e) => setFormData({ ...formData, email_property: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="notion_phone_prop">Phone Property Name</Label>
                  <Input
                    id="notion_phone_prop"
                    placeholder="Phone"
                    value={formData.phone_property || ""}
                    onChange={(e) => setFormData({ ...formData, phone_property: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notion_status_prop">Status Property Name (optional)</Label>
                  <Input
                    id="notion_status_prop"
                    placeholder="Status"
                    value={formData.status_property || ""}
                    onChange={(e) => setFormData({ ...formData, status_property: e.target.value })}
                  />
                </div>
              </div>

              {formData.status_property && (
                <div className="space-y-2">
                  <Label htmlFor="notion_status_value">Status Default Value</Label>
                  <Input
                    id="notion_status_value"
                    placeholder="New Lead"
                    value={formData.status_value || ""}
                    onChange={(e) => setFormData({ ...formData, status_value: e.target.value })}
                  />
                </div>
              )}
            </div>
          );
        }

        // Update Record form
        if (action === "update_record") {
          return (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notion_db">Notion Database ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="notion_db"
                    placeholder="e.g., 29ad6442e09c805a927de6e3fdb6112c"
                    value={formData.database_id || ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setFormData({ ...formData, database_id: raw });
                      if (raw && raw.length >= 32) fetchNotionSchema(raw);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => formData.database_id && fetchNotionSchema(formData.database_id)}
                    disabled={loadingFields}
                  >
                    {loadingFields ? "Loading..." : "Refresh"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Get this from your Notion database URL</p>
                {fieldError && (
                  <p className="text-xs text-destructive bg-red-500/10 px-2 py-1 rounded">{fieldError}</p>
                )}
              </div>

              {/* Browse Records section */}
              {notionPages.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">Recent Records</Label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {notionPages.slice(0, 6).map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, search_title: page.title })}
                        className="p-2 text-xs border border-muted rounded-lg hover:bg-muted/60 text-left transition-colors truncate"
                        title={page.title}
                      >
                        {page.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Find record by title */}
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="notion_search_title">Find Record by Title</Label>
                  <VariablePicker prevSteps={prevSteps} fieldId="notion_search_title" value={formData.search_title || ""} onChange={(v) => setFormData({ ...formData, search_title: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
                </div>
                <Input
                  id="notion_search_title"
                  placeholder="{{lead.name}}"
                  value={formData.search_title || ""}
                  onChange={(e) => setFormData({ ...formData, search_title: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">The title of the record to find and update</p>
              </div>

              {/* Update fields */}
              <div className="space-y-3 pt-2 border-t">
                <Label>Fields to Update</Label>
                {formData.updates && formData.updates.length > 0 ? (
                  <div className="space-y-3">
                    {formData.updates.map((update: any, idx: number) => (
                      <div key={idx} className="p-3 border border-muted rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">{update.field}</Label>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const newUpdates = formData.updates.filter((_: any, i: number) => i !== idx);
                              setFormData({ ...formData, updates: newUpdates });
                            }}
                          >
                            Remove
                          </Button>
                        </div>

                        {/* Find field definition */}
                        {notionFields.find(f => f.name === update.field)?.type === "select" ? (
                          <Select value={update.value || ""} onValueChange={(val) => {
                            const newUpdates = [...formData.updates];
                            newUpdates[idx].value = val;
                            setFormData({ ...formData, updates: newUpdates });
                          }}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select option" />
                            </SelectTrigger>
                            <SelectContent>
                              {notionFields.find(f => f.name === update.field)?.options?.filter((opt: any) => opt.name && opt.name.trim()).map((opt: any) => (
                                <SelectItem key={opt.name} value={opt.name}>{opt.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <div className="flex gap-2">
                            <Input
                              placeholder="Value"
                              value={update.value || ""}
                              onChange={(e) => {
                                const newUpdates = [...formData.updates];
                                newUpdates[idx].value = e.target.value;
                                setFormData({ ...formData, updates: newUpdates });
                              }}
                            />
                            <VariablePicker
                              fieldId={`notion_update_${idx}`}
                              value={update.value || ""}
                              onChange={(v) => {
                                const newUpdates = [...formData.updates];
                                newUpdates[idx].value = v;
                                setFormData({ ...formData, updates: newUpdates });
                              }}
                              prevSteps={prevSteps}
                              triggerData={savedTriggerData || testData}
                              stepOutputResults={stepTestResults}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No fields added yet</p>
                )}

                {/* Add field button */}
                <Select onValueChange={(fieldName) => {
                  const newUpdates = formData.updates || [];
                  newUpdates.push({ field: fieldName, value: "" });
                  setFormData({ ...formData, updates: newUpdates });
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="+ Add a field to update..." />
                  </SelectTrigger>
                  <SelectContent>
                    {notionFields.filter(f => f.name && f.name.trim()).map((field) => (
                      <SelectItem key={field.id} value={field.name}>
                        {field.name} {field.type === "select" ? "📋" : "📝"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          );
        }

        // Search Record form
        if (action === "search_record") {
          return (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="notion_db">Notion Database ID</Label>
                <div className="flex gap-2">
                  <Input
                    id="notion_db"
                    placeholder="e.g., 29ad6442e09c805a927de6e3fdb6112c"
                    value={formData.database_id || ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      setFormData({ ...formData, database_id: raw });
                      if (raw && raw.length >= 32) fetchNotionSchema(raw);
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => formData.database_id && fetchNotionSchema(formData.database_id)}
                    disabled={loadingFields}
                  >
                    {loadingFields ? "Loading..." : "Refresh"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Get this from your Notion database URL</p>
                {fieldError && (
                  <p className="text-xs text-destructive bg-red-500/10 px-2 py-1 rounded">{fieldError}</p>
                )}
              </div>

              {/* Search property selector */}
              {notionFields.length > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="search_property">Search by Property</Label>
                  <Select value={formData.search_property || "Name"} onValueChange={(val) => setFormData({ ...formData, search_property: val })}>
                    <SelectTrigger id="search_property">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {notionFields.filter(f => f.name && f.name.trim()).map((field) => (
                        <SelectItem key={field.id} value={field.name}>
                          {field.name} {field.type === "title" ? "📝" : field.type === "select" ? "📋" : "🔤"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Search value */}
              <div className="space-y-2">
                <div className="flex items-center gap-1">
                  <Label htmlFor="search_value">Search Value</Label>
                  <VariablePicker prevSteps={prevSteps} fieldId="search_value" value={formData.search_title || ""} onChange={(v) => setFormData({ ...formData, search_title: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
                </div>
                <Input
                  id="search_value"
                  placeholder="{{lead.name}}"
                  value={formData.search_title || ""}
                  onChange={(e) => setFormData({ ...formData, search_title: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">The value to search for in the selected property</p>
              </div>

              {/* Output variables info */}
              <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-xs font-semibold text-blue-400 mb-2">Step Output Variables</p>
                <div className="space-y-1">
                  <p className="text-xs text-blue-300"><code>{"{{steps.STEP_ID.page_id}}"}</code> - Notion page ID</p>
                  <p className="text-xs text-blue-300"><code>{"{{steps.STEP_ID.title}}"}</code> - Record title</p>
                  <p className="text-xs text-blue-300"><code>{"{{steps.STEP_ID.url}}"}</code> - Notion page URL</p>
                </div>
              </div>
            </div>
          );
        }

        // Default Notion form for other actions
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="notion_db">Notion Database ID</Label>
              <Input
                id="notion_db"
                placeholder="e.g., 29ad6442e09c805a927de6e3fdb6112c"
                value={formData.database_id || ""}
                onChange={(e) => setFormData({ ...formData, database_id: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Get this from your Notion database URL</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="notion_title">Record Title</Label>
                <VariablePicker prevSteps={prevSteps} fieldId="notion_title" value={formData.title || ""} onChange={(v) => setFormData({ ...formData, title: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
              </div>
              <Input
                id="notion_title"
                placeholder="{{lead.name}}"
                value={formData.title || ""}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>
          </div>
        );

      case "formatter":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="date_format">Date Format</Label>
              <Select value={formData.format || "MM/DD/YYYY"} onValueChange={(value) => setFormData({ ...formData, format: value })}>
                <SelectTrigger id="date_format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                  <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                  <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                  <SelectItem value="MMM DD, YYYY">MMM DD, YYYY</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        );

      case "delay":
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="delay_amount">Amount</Label>
                <Input
                  id="delay_amount"
                  type="number"
                  min="1"
                  placeholder="5"
                  value={formData.amount || ""}
                  onChange={(e) => setFormData({ ...formData, amount: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delay_unit">Unit</Label>
                <Select value={formData.unit || "hours"} onValueChange={(value) => setFormData({ ...formData, unit: value })}>
                  <SelectTrigger id="delay_unit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minutes">Minutes</SelectItem>
                    <SelectItem value="hours">Hours</SelectItem>
                    <SelectItem value="days">Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        );

      case "sms":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="sms_to">Phone Number</Label>
                <VariablePicker prevSteps={prevSteps} fieldId="sms_to" value={formData.to || ""} onChange={(v) => setFormData({ ...formData, to: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
              </div>
              <Input
                id="sms_to"
                placeholder="{{lead.phone}}"
                value={formData.to || ""}
                onChange={(e) => setFormData({ ...formData, to: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="sms_message">Message</Label>
                <VariablePicker prevSteps={prevSteps} fieldId="sms_message" value={formData.message || ""} onChange={(v) => setFormData({ ...formData, message: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
              </div>
              <Textarea
                id="sms_message"
                placeholder="Hi {{lead.name}}, thanks for your interest!"
                value={formData.message || ""}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="min-h-20"
              />
            </div>

            {/* Retry on Failure */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Retry on Failure</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="retry_count">Retry Count</Label>
                  <Select value={String(formData.retry_count || 0)} onValueChange={(value) => setFormData({ ...formData, retry_count: parseInt(value) })}>
                    <SelectTrigger id="retry_count">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No retries</SelectItem>
                      <SelectItem value="1">1 retry</SelectItem>
                      <SelectItem value="2">2 retries</SelectItem>
                      <SelectItem value="3">3 retries</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="retry_delay">Delay Between Retries</Label>
                  <Select value={String(formData.retry_delay_ms || 1000)} onValueChange={(value) => setFormData({ ...formData, retry_delay_ms: parseInt(value) })}>
                    <SelectTrigger id="retry_delay">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1000">1 second</SelectItem>
                      <SelectItem value="3000">3 seconds</SelectItem>
                      <SelectItem value="5000">5 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        );

      case "whatsapp":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="whatsapp_to">Phone Number</Label>
                <VariablePicker prevSteps={prevSteps} fieldId="whatsapp_to" value={formData.to || ""} onChange={(v) => setFormData({ ...formData, to: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
              </div>
              <Input
                id="whatsapp_to"
                placeholder="{{lead.phone}}"
                value={formData.to || ""}
                onChange={(e) => setFormData({ ...formData, to: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Format: +1 (555) 000-0000</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="whatsapp_message">Message</Label>
                <VariablePicker prevSteps={prevSteps} fieldId="whatsapp_message" value={formData.message || ""} onChange={(v) => setFormData({ ...formData, message: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
              </div>
              <Textarea
                id="whatsapp_message"
                placeholder="Hi {{lead.name}}, thanks for your interest!"
                value={formData.message || ""}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="min-h-20"
              />
            </div>

            {/* Retry on Failure */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Retry on Failure</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_retry_count">Retry Count</Label>
                  <Select value={String(formData.retry_count || 0)} onValueChange={(value) => setFormData({ ...formData, retry_count: parseInt(value) })}>
                    <SelectTrigger id="whatsapp_retry_count">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No retries</SelectItem>
                      <SelectItem value="1">1 retry</SelectItem>
                      <SelectItem value="2">2 retries</SelectItem>
                      <SelectItem value="3">3 retries</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="whatsapp_retry_delay">Delay Between Retries</Label>
                  <Select value={String(formData.retry_delay_ms || 1000)} onValueChange={(value) => setFormData({ ...formData, retry_delay_ms: parseInt(value) })}>
                    <SelectTrigger id="whatsapp_retry_delay">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1000">1 second</SelectItem>
                      <SelectItem value="3000">3 seconds</SelectItem>
                      <SelectItem value="5000">5 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        );

      case "webhook":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="webhook_url">Webhook URL</Label>
                <VariablePicker prevSteps={prevSteps} fieldId="webhook_url" value={formData.url || ""} onChange={(v) => setFormData({ ...formData, url: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
              </div>
              <Input
                id="webhook_url"
                placeholder="https://example.com/webhook"
                value={formData.url || ""}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook_method">Method</Label>
              <Select value={formData.method || "POST"} onValueChange={(value) => setFormData({ ...formData, method: value })}>
                <SelectTrigger id="webhook_method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                  <SelectItem value="PUT">PUT</SelectItem>
                  <SelectItem value="PATCH">PATCH</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="webhook_headers">Headers (JSON)</Label>
              <Textarea
                id="webhook_headers"
                placeholder='{"Authorization": "Bearer token", "X-Custom-Header": "value"}'
                value={formData.headers || ""}
                onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                className="min-h-16 font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label htmlFor="webhook_body">Body (JSON)</Label>
                <VariablePicker prevSteps={prevSteps} fieldId="webhook_body" value={formData.body || ""} onChange={(v) => setFormData({ ...formData, body: v })} triggerData={savedTriggerData || testData} stepOutputResults={stepTestResults} />
              </div>
              <Textarea
                id="webhook_body"
                placeholder='{"name": "{{lead.name}}", "email": "{{lead.email}}"}'
                value={formData.body || ""}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                className="min-h-20 font-mono text-xs"
              />
            </div>

            {/* Retry on Failure */}
            <div className="border-t pt-4 space-y-3">
              <h3 className="text-sm font-semibold text-foreground">Retry on Failure</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="webhook_retry_count">Retry Count</Label>
                  <Select value={String(formData.retry_count || 0)} onValueChange={(value) => setFormData({ ...formData, retry_count: parseInt(value) })}>
                    <SelectTrigger id="webhook_retry_count">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No retries</SelectItem>
                      <SelectItem value="1">1 retry</SelectItem>
                      <SelectItem value="2">2 retries</SelectItem>
                      <SelectItem value="3">3 retries</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="webhook_retry_delay">Delay Between Retries</Label>
                  <Select value={String(formData.retry_delay_ms || 1000)} onValueChange={(value) => setFormData({ ...formData, retry_delay_ms: parseInt(value) })}>
                    <SelectTrigger id="webhook_retry_delay">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1000">1 second</SelectItem>
                      <SelectItem value="3000">3 seconds</SelectItem>
                      <SelectItem value="5000">5 seconds</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        );

      case "filter":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="filter_field">Lead Field</Label>
              <Select value={formData.field || ""} onValueChange={(value) => setFormData({ ...formData, field: value })}>
                <SelectTrigger id="filter_field">
                  <SelectValue placeholder="Select a field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lead.name">Lead Name</SelectItem>
                  <SelectItem value="lead.email">Lead Email</SelectItem>
                  <SelectItem value="lead.phone">Lead Phone</SelectItem>
                  <SelectItem value="lead.form_id">Facebook Form ID</SelectItem>
                  <SelectItem value="lead.form_name">Facebook Form Name</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="filter_operator">Operator</Label>
              <Select value={formData.operator || "equals"} onValueChange={(value) => setFormData({ ...formData, operator: value })}>
                <SelectTrigger id="filter_operator">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">equals</SelectItem>
                  <SelectItem value="not_equals">does not equal</SelectItem>
                  <SelectItem value="contains">contains</SelectItem>
                  <SelectItem value="not_contains">does not contain</SelectItem>
                  <SelectItem value="is_empty">is empty</SelectItem>
                  <SelectItem value="is_not_empty">is not empty</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {!["is_empty", "is_not_empty"].includes(formData.operator) && (
              <div className="space-y-2">
                <Label htmlFor="filter_value">Value</Label>
                <Input
                  id="filter_value"
                  placeholder="Enter value to match"
                  value={formData.value || ""}
                  onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                />
              </div>
            )}
          </div>
        );

      default:
        return <p className="text-muted-foreground">No configuration needed</p>;
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[520px] flex flex-col gap-0 p-0 overflow-hidden"
      >
        <SheetHeader className="px-6 pt-5 pb-4 border-b">
          <SheetTitle>
            {label || `Configure ${service}`}
          </SheetTitle>
        </SheetHeader>

        <Tabs
          defaultValue="configure"
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="mx-6 mt-4 w-auto justify-start rounded-none bg-transparent border-b pb-0 h-auto gap-0 px-0">
            <TabsTrigger
              value="setup"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-3 py-2 text-sm"
            >
              Setup
            </TabsTrigger>
            <TabsTrigger
              value="configure"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-3 py-2 text-sm"
            >
              Configure
            </TabsTrigger>
            <TabsTrigger
              value="test"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary px-3 py-2 text-sm"
            >
              Test
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="setup"
            className="flex-1 overflow-y-auto px-6 py-4"
          >
            {renderSetupTab()}
          </TabsContent>

          <TabsContent
            value="configure"
            className="flex-1 overflow-y-auto px-6 py-4 pb-20"
          >
            {renderForm()}
          </TabsContent>

          <TabsContent
            value="test"
            className="flex-1 overflow-y-auto px-6 py-4"
          >
            {renderTestTab()}
          </TabsContent>
        </Tabs>

        {/* Sticky footer for Configure tab buttons */}
        <div className="border-t bg-background px-6 py-3 flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            size="sm"
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving} size="sm">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
          <Button
            onClick={() => {
              onSave(formData);
              onOpenChange(false);
            }}
            variant="default"
            size="sm"
            className="gap-1"
          >
            Continue
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
