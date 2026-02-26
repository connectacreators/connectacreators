import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useEffect } from "react";
import { Loader2, Play, ChevronRight } from "lucide-react";
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
function VariablePicker({ fieldId, value, onChange, prevSteps }: {
  fieldId: string;
  value: string;
  onChange: (v: string) => void;
  prevSteps?: WorkflowStep[];
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
        <div className="absolute right-0 top-6 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 w-64 space-y-2 max-h-64 overflow-y-auto">
          {/* Trigger data section */}
          <div>
            <p className="text-xs text-muted-foreground px-2 py-1 font-semibold">Trigger data</p>
            <div className="space-y-1">
              {TRIGGER_FIELDS.map((f) => (
                <button
                  key={f.variable}
                  type="button"
                  onClick={() => insert(f.variable)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-muted/60 text-blue-400 font-mono transition-colors"
                >
                  {`{{${f.variable}}}`}
                  <span className="text-muted-foreground ml-2 font-sans">{f.label}</span>
                </button>
              ))}
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
                      {fields.map(field => (
                        <button
                          key={field}
                          type="button"
                          onClick={() => insert(`steps.${step.id}.${field}`)}
                          className="w-full text-left text-xs px-2 py-1 rounded-lg hover:bg-muted/60 text-green-400 font-mono transition-colors"
                        >
                          {`{{steps.${step.id}.${field}}}`}
                        </button>
                      ))}
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

export default function StepConfigModal({ open, onOpenChange, service, action, config, onSave, clientId, prevSteps }: StepConfigModalProps) {
  const [formData, setFormData] = useState<Record<string, any>>(config || {});
  const [saving, setSaving] = useState(false);
  const [testData, setTestData] = useState<Record<string, any> | null>(null);
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

    // Load Facebook pages if opening webhook trigger
    if (open && service === "webhooks") {
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

  const handleTest = async () => {
    if (!clientId) return;
    setTesting(true);
    setTestError(null);
    try {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      setTesting(false);
      if (error || !data) {
        setTestError("No leads found for this client yet. Add a test lead first.");
        return;
      }
      setTestData(data);
    } catch (err) {
      setTesting(false);
      setTestError("Error fetching test data");
    }
  };

  const fetchNotionSchema = async (dbId: string) => {
    if (!dbId) return;
    setLoadingFields(true);
    setFieldError(null);
    try {
      const { data, error } = await supabase.functions.invoke('get-notion-db-schema', {
        body: { database_id: dbId }
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
                <VariablePicker prevSteps={prevSteps} fieldId="email_to" value={formData.to || ""} onChange={(v) => setFormData({ ...formData, to: v })} />
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
                <VariablePicker prevSteps={prevSteps} fieldId="email_subject" value={formData.subject || ""} onChange={(v) => setFormData({ ...formData, subject: v })} />
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
                <VariablePicker prevSteps={prevSteps} fieldId="email_body" value={formData.body || ""} onChange={(v) => setFormData({ ...formData, body: v })} />
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
                  <VariablePicker prevSteps={prevSteps} fieldId="notion_title" value={formData.title || ""} onChange={(v) => setFormData({ ...formData, title: v })} />
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
                      setFormData({ ...formData, database_id: e.target.value });
                      if (e.target.value) fetchNotionSchema(e.target.value);
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
                  <VariablePicker prevSteps={prevSteps} fieldId="notion_search_title" value={formData.search_title || ""} onChange={(v) => setFormData({ ...formData, search_title: v })} />
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
                              {notionFields.find(f => f.name === update.field)?.options?.map((opt: any) => (
                                <SelectItem key={opt.name || opt} value={opt.name || opt}>{opt.name || opt}</SelectItem>
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
                    {notionFields.map((field) => (
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
                      setFormData({ ...formData, database_id: e.target.value });
                      if (e.target.value) fetchNotionSchema(e.target.value);
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
                      {notionFields.map((field) => (
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
                  <VariablePicker prevSteps={prevSteps} fieldId="search_value" value={formData.search_title || ""} onChange={(v) => setFormData({ ...formData, search_title: v })} />
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
                <VariablePicker prevSteps={prevSteps} fieldId="notion_title" value={formData.title || ""} onChange={(v) => setFormData({ ...formData, title: v })} />
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
                <VariablePicker prevSteps={prevSteps} fieldId="sms_to" value={formData.to || ""} onChange={(v) => setFormData({ ...formData, to: v })} />
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
                <VariablePicker prevSteps={prevSteps} fieldId="sms_message" value={formData.message || ""} onChange={(v) => setFormData({ ...formData, message: v })} />
              </div>
              <Textarea
                id="sms_message"
                placeholder="Hi {{lead.name}}, thanks for your interest!"
                value={formData.message || ""}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                className="min-h-20"
              />
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Step</DialogTitle>
        </DialogHeader>

        <div className="py-4">{renderForm()}</div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
          <Button onClick={() => { onSave(formData); onOpenChange(false); }} variant="default" className="gap-1">
            Continue
            <ChevronRight className="w-4 h-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
