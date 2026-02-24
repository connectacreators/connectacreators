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

// VariablePicker component - small + button that inserts variables
function VariablePicker({ fieldId, value, onChange }: {
  fieldId: string;
  value: string;
  onChange: (v: string) => void;
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

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="ml-1 w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 text-xs font-bold flex items-center justify-center transition-colors"
        title="Insert data from trigger"
      >
        +
      </button>
      {open && (
        <div className="absolute right-0 top-6 z-50 bg-popover border border-border rounded-xl shadow-lg p-2 w-56 space-y-1">
          <p className="text-xs text-muted-foreground px-2 py-1 font-semibold">Trigger data</p>
          {TRIGGER_FIELDS.map((f) => (
            <button
              key={f.variable}
              type="button"
              onClick={() => insert(f.variable)}
              className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-muted/60 text-foreground font-mono transition-colors"
            >
              {`{{${f.variable}}}`}
              <span className="text-muted-foreground ml-2 font-sans">{f.label}</span>
            </button>
          ))}
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

  useEffect(() => {
    setFormData(config || {});
    setTestData(null);
    setTestError(null);
    setNotionFields([]);
    setNotionPages([]);
    setFieldError(null);

    // Auto-load Notion schema if database_id is already set and this is an update_record
    if (open && config?.database_id && service === "notion" && action === "update_record") {
      fetchNotionSchema(config.database_id);
    }
  }, [config, open, service, action]);

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

  // Render form based on service type
  const renderForm = () => {
    switch (service) {
      case "webhooks":
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="form_id">Facebook Form ID (optional)</Label>
              <Input
                id="form_id"
                placeholder="Leave empty to accept all forms"
                value={formData.facebook_form_id || ""}
                onChange={(e) => setFormData({ ...formData, facebook_form_id: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">Only trigger when leads come from this specific Facebook form ID</p>
            </div>

            {/* Test Trigger Button */}
            <div className="space-y-2">
              <Button onClick={handleTest} disabled={testing} variant="outline" size="sm" className="w-full gap-2">
                {testing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {testData ? "Re-test Trigger" : "Test Trigger"}
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
        );

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
                <VariablePicker fieldId="email_to" value={formData.to || ""} onChange={(v) => setFormData({ ...formData, to: v })} />
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
                <VariablePicker fieldId="email_subject" value={formData.subject || ""} onChange={(v) => setFormData({ ...formData, subject: v })} />
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
                <VariablePicker fieldId="email_body" value={formData.body || ""} onChange={(v) => setFormData({ ...formData, body: v })} />
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
                  <VariablePicker fieldId="notion_title" value={formData.title || ""} onChange={(v) => setFormData({ ...formData, title: v })} />
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
                  <VariablePicker fieldId="notion_search_title" value={formData.search_title || ""} onChange={(v) => setFormData({ ...formData, search_title: v })} />
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

        // Default Notion form for search actions
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
                <VariablePicker fieldId="notion_title" value={formData.title || ""} onChange={(v) => setFormData({ ...formData, title: v })} />
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
                <VariablePicker fieldId="sms_to" value={formData.to || ""} onChange={(v) => setFormData({ ...formData, to: v })} />
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
                <VariablePicker fieldId="sms_message" value={formData.message || ""} onChange={(v) => setFormData({ ...formData, message: v })} />
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
