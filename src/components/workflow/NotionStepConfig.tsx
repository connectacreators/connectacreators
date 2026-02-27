import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { WorkflowStep } from "@/pages/ClientWorkflow";

interface NotionStepConfigProps {
  action: string;
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
  clientId?: string;
  prevSteps?: WorkflowStep[];
  onVariableInsert?: (variable: string, fieldId: string) => void;
}

export function NotionStepConfig({
  action,
  config,
  onChange,
  clientId,
  prevSteps,
  onVariableInsert,
}: NotionStepConfigProps) {
  const [notionFields, setNotionFields] = useState<any[]>([]);
  const [notionPages, setNotionPages] = useState<any[]>([]);
  const [loadingFields, setLoadingFields] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Fetch Notion database schema
  const fetchNotionSchema = async () => {
    if (!config.database_id) {
      setFieldError("Please enter a database ID first");
      return;
    }

    setLoadingFields(true);
    setFieldError(null);

    try {
      const { data, error } = await supabase.functions.invoke("get-notion-db-schema", {
        body: { database_id: config.database_id },
      });

      if (error) throw error;
      if (data?.properties) {
        const fields = Object.entries(data.properties).map(([key, prop]: [string, any]) => ({
          name: prop.name || key,
          key,
          type: prop.type,
          options: prop[prop.type]?.options || [],
        }));
        setNotionFields(fields);
      }
      if (data?.pages) {
        setNotionPages(data.pages);
      }
    } catch (err) {
      setFieldError(String(err));
      console.error("Failed to fetch Notion schema:", err);
    } finally {
      setLoadingFields(false);
    }
  };

  // Load schema when modal opens
  useEffect(() => {
    if (config.database_id && notionFields.length === 0) {
      fetchNotionSchema();
    }
  }, [config.database_id]);

  return (
    <div className="space-y-6">
      {/* Database ID */}
      <div className="space-y-2">
        <Label htmlFor="notion_database_id">Notion Database ID</Label>
        <div className="flex gap-2">
          <Input
            id="notion_database_id"
            placeholder="e.g., 9ad6442e09c805a927de6e3fdb6112c"
            value={config.database_id || ""}
            onChange={(e) => onChange({ ...config, database_id: e.target.value })}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={fetchNotionSchema}
            disabled={loadingFields || !config.database_id}
          >
            {loadingFields ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {fieldError && (
        <div className="text-sm text-red-500 bg-red-50 p-2 rounded">{fieldError}</div>
      )}

      {action === "search_record" || action === "update_record" ? (
        <>
          {/* Find Record By */}
          <div className="space-y-2">
            <Label htmlFor="notion_find_by">Find Record By Title</Label>
            <Input
              id="notion_find_by"
              placeholder="e.g., {{lead.name}}"
              value={config.find_by || ""}
              onChange={(e) => onChange({ ...config, find_by: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Supports variables like {`{{lead.name}}`} and {`{{steps.step_id.field}}`}
            </p>
          </div>

          {/* Recent Pages Browser */}
          {notionPages.length > 0 && (
            <div className="space-y-2">
              <Label>Recent Records</Label>
              <div className="max-h-32 overflow-y-auto border rounded p-2 space-y-1">
                {notionPages.map((page) => (
                  <button
                    key={page.id}
                    type="button"
                    onClick={() => onChange({ ...config, find_by: page.title })}
                    className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors"
                  >
                    {page.title}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}

      {action === "create_record" || action === "update_record" ? (
        <>
          {/* Fields to Update */}
          <div className="space-y-2">
            <Label>Fields to Update</Label>
            {notionFields.length === 0 ? (
              <p className="text-xs text-muted-foreground">Load Notion schema to see available fields</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto border rounded p-2">
                {notionFields
                  .filter((f) => f.name && f.name.trim())
                  .map((field) => (
                    <div key={field.key} className="space-y-1 p-2 border-b last:border-b-0">
                      <Label className="text-xs">{field.name}</Label>
                      {field.type === "select" || field.type === "multi_select" || field.type === "status" ? (
                        <Select
                          value={config[field.key] || ""}
                          onValueChange={(value) => onChange({ ...config, [field.key]: value })}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options.map((opt: any) => (
                              <SelectItem key={opt.id} value={opt.name}>
                                {opt.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          className="h-8 text-xs"
                          placeholder={`Value for ${field.name}`}
                          value={config[field.key] || ""}
                          onChange={(e) => onChange({ ...config, [field.key]: e.target.value })}
                        />
                      )}
                    </div>
                  ))}
              </div>
            )}
          </div>
        </>
      ) : null}

      {/* Retry config */}
      <div className="space-y-2">
        <Label htmlFor="notion_retry">Retry on Failure</Label>
        <Select value={String(config.retry_count || 0)} onValueChange={(value) => onChange({ ...config, retry_count: parseInt(value) })}>
          <SelectTrigger id="notion_retry">
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
    </div>
  );
}
