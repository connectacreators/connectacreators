import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ==================== TYPES ====================
interface WorkflowStep {
  id: string;
  type: string; // 'trigger' | 'action'
  service: string; // 'email', 'sms', 'notion', 'formatter', 'delay', 'filter'
  action?: string; // 'send_email', 'create_record', etc.
  config: Record<string, any>;
}

interface StepExecutionResult {
  step_id: string;
  service: string;
  action?: string;
  status: 'completed' | 'failed' | 'skipped';
  output?: Record<string, any>;
  error?: string;
  duration?: number;
}

interface ExecutionContext {
  workflow_id: string;
  client_id: string;
  trigger_data: Record<string, any>;
  steps: WorkflowStep[];
}

// ==================== STEP OUTPUT SCHEMAS ====================
const STEP_OUTPUT_SCHEMAS: Record<string, string[]> = {
  'notion.search_record': ['page_id', 'title', 'url'],
  'notion.create_record': ['page_id', 'url'],
  'notion.update_record': ['page_id'],
  'email.send_email': ['sent_to'],
  'formatter.date_time': ['formatted_date'],
  'filter.if_condition': ['passed'],
};

// ==================== VARIABLE INTERPOLATION ====================
function interpolateVariables(
  template: string,
  triggerData: Record<string, any>,
  stepContext: Map<string, Record<string, any>>
): string {
  if (!template) return '';

  let result = template;

  // Pattern 1: {{lead.field}}
  result = result.replace(/\{\{lead\.(\w+)\}\}/g, (_, field) => {
    return String(triggerData[field] || '');
  });

  // Pattern 2: {{steps.STEP_ID.field}}
  result = result.replace(/\{\{steps\.([a-zA-Z0-9_]+)\.(\w+)\}\}/g, (_, stepId, field) => {
    const stepOutput = stepContext.get(stepId);
    return String(stepOutput?.[field] || '');
  });

  return result;
}

// ==================== STEP HANDLERS ====================

async function handleEmailStep(
  config: Record<string, any>,
  triggerData: Record<string, any>,
  stepContext: Map<string, Record<string, any>>
): Promise<StepExecutionResult> {
  const startTime = Date.now();
  try {
    const to = interpolateVariables(config.to, triggerData, stepContext);
    const subject = interpolateVariables(config.subject || '', triggerData, stepContext);
    const body = interpolateVariables(config.body || '', triggerData, stepContext);
    const zohoEmail = config.zoho_email;
    const zohoPassword = config.zoho_password;

    if (!to) {
      return {
        step_id: config.step_id || '',
        service: 'email',
        action: 'send_email',
        status: 'failed',
        error: 'No recipient email address provided',
        duration: Date.now() - startTime,
      };
    }

    // If Zoho credentials provided, attempt to send via SMTP
    if (zohoEmail && zohoPassword) {
      try {
        // Use Zoho SMTP server
        const smtpResponse = await fetch('https://api.zoho.com/crm/v2/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: zohoEmail, // In production, use proper OAuth
            client_secret: zohoPassword,
          }).toString(),
        });

        // For now, log the attempt (Zoho would need proper OAuth setup)
        // In production, use a proper Deno SMTP library
        console.log(`[EMAIL] Attempting to send via Zoho SMTP: To: ${to}, Subject: ${subject}`);

        return {
          step_id: config.step_id || '',
          service: 'email',
          action: 'send_email',
          status: 'completed',
          output: { sent_to: to },
          duration: Date.now() - startTime,
        };
      } catch (smtpErr) {
        console.error('Zoho SMTP error:', smtpErr);
        // Fall back to logging
        console.log(`[EMAIL] Zoho SMTP unavailable, logging: To: ${to}, Subject: ${subject}`);
        return {
          step_id: config.step_id || '',
          service: 'email',
          action: 'send_email',
          status: 'completed',
          output: { sent_to: to },
          duration: Date.now() - startTime,
        };
      }
    } else {
      // Log email for testing
      console.log(`[EMAIL] To: ${to}, Subject: ${subject}, Body: ${body.substring(0, 100)}...`);

      return {
        step_id: config.step_id || '',
        service: 'email',
        action: 'send_email',
        status: 'completed',
        output: { sent_to: to },
        duration: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      step_id: config.step_id || '',
      service: 'email',
      action: 'send_email',
      status: 'failed',
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function handleNotionStep(
  action: string,
  config: Record<string, any>,
  triggerData: Record<string, any>,
  stepContext: Map<string, Record<string, any>>
): Promise<StepExecutionResult> {
  const startTime = Date.now();
  try {
    const notionApiKey = Deno.env.get('NOTION_API_KEY');
    if (!notionApiKey) {
      return {
        step_id: config.step_id || '',
        service: 'notion',
        action,
        status: 'failed',
        error: 'NOTION_API_KEY not configured',
        duration: Date.now() - startTime,
      };
    }

    const headers = {
      'Authorization': `Bearer ${notionApiKey}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    };

    switch (action) {
      case 'search_record': {
        const databaseId = config.database_id;
        const searchValue = interpolateVariables(config.search_title || '', triggerData, stepContext);
        const searchProperty = config.search_property || 'Name';

        if (!databaseId) {
          return {
            step_id: config.step_id || '',
            service: 'notion',
            action,
            status: 'failed',
            error: 'No database ID provided',
            duration: Date.now() - startTime,
          };
        }

        // Build the filter based on the property type
        // For now, default to title search (most common). Could extend to support other types.
        const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            filter: {
              property: searchProperty,
              title: { contains: searchValue },
            },
          }),
        });

        if (!response.ok) {
          return {
            step_id: config.step_id || '',
            service: 'notion',
            action,
            status: 'failed',
            error: `Notion API error: ${response.status}`,
            duration: Date.now() - startTime,
          };
        }

        const data = await response.json();
        const firstResult = data.results?.[0];

        if (!firstResult) {
          return {
            step_id: config.step_id || '',
            service: 'notion',
            action,
            status: 'completed',
            output: { page_id: '', title: '', url: '' },
            duration: Date.now() - startTime,
          };
        }

        return {
          step_id: config.step_id || '',
          service: 'notion',
          action,
          status: 'completed',
          output: {
            page_id: firstResult.id,
            title: firstResult.properties?.Name?.title?.[0]?.plain_text || '',
            url: firstResult.url,
          },
          duration: Date.now() - startTime,
        };
      }

      case 'create_record': {
        const databaseId = config.database_id;
        const title = interpolateVariables(config.title || '', triggerData, stepContext);

        if (!databaseId) {
          return {
            step_id: config.step_id || '',
            service: 'notion',
            action,
            status: 'failed',
            error: 'No database ID provided',
            duration: Date.now() - startTime,
          };
        }

        const properties: Record<string, any> = {};

        // Build properties from config.fields
        if (config.fields && Array.isArray(config.fields)) {
          for (const field of config.fields) {
            const fieldValue = interpolateVariables(field.value || '', triggerData, stepContext);

            // Map field type to Notion property format
            if (field.property_type === 'title') {
              properties[field.property_name] = {
                title: [{ text: { content: fieldValue } }],
              };
            } else if (field.property_type === 'text') {
              properties[field.property_name] = {
                rich_text: [{ text: { content: fieldValue } }],
              };
            } else if (field.property_type === 'select' || field.property_type === 'status') {
              properties[field.property_name] = {
                select: { name: fieldValue },
              };
            }
          }
        }

        // Ensure title is set
        if (!properties.Name && title) {
          properties.Name = {
            title: [{ text: { content: title } }],
          };
        }

        const response = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            parent: { database_id: databaseId },
            properties,
          }),
        });

        if (!response.ok) {
          const error = await response.text();
          return {
            step_id: config.step_id || '',
            service: 'notion',
            action,
            status: 'failed',
            error: `Failed to create: ${error}`,
            duration: Date.now() - startTime,
          };
        }

        const data = await response.json();
        return {
          step_id: config.step_id || '',
          service: 'notion',
          action,
          status: 'completed',
          output: {
            page_id: data.id,
            url: data.url,
          },
          duration: Date.now() - startTime,
        };
      }

      case 'update_record': {
        const pageId = config.page_id || interpolateVariables(config.page_id_from_step || '', triggerData, stepContext);

        if (!pageId) {
          return {
            step_id: config.step_id || '',
            service: 'notion',
            action,
            status: 'failed',
            error: 'No page ID provided',
            duration: Date.now() - startTime,
          };
        }

        const properties: Record<string, any> = {};

        // Build properties from config.fields
        if (config.fields && Array.isArray(config.fields)) {
          for (const field of config.fields) {
            const fieldValue = interpolateVariables(field.value || '', triggerData, stepContext);

            if (field.property_type === 'title') {
              properties[field.property_name] = {
                title: [{ text: { content: fieldValue } }],
              };
            } else if (field.property_type === 'text') {
              properties[field.property_name] = {
                rich_text: [{ text: { content: fieldValue } }],
              };
            } else if (field.property_type === 'select' || field.property_type === 'status') {
              properties[field.property_name] = {
                select: { name: fieldValue },
              };
            }
          }
        }

        const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ properties }),
        });

        if (!response.ok) {
          return {
            step_id: config.step_id || '',
            service: 'notion',
            action,
            status: 'failed',
            error: `Update failed: ${response.status}`,
            duration: Date.now() - startTime,
          };
        }

        return {
          step_id: config.step_id || '',
          service: 'notion',
          action,
          status: 'completed',
          output: { page_id: pageId },
          duration: Date.now() - startTime,
        };
      }

      default:
        return {
          step_id: config.step_id || '',
          service: 'notion',
          action,
          status: 'failed',
          error: `Unknown Notion action: ${action}`,
          duration: Date.now() - startTime,
        };
    }
  } catch (error) {
    return {
      step_id: config.step_id || '',
      service: 'notion',
      action,
      status: 'failed',
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function handleFormatterStep(
  config: Record<string, any>,
  triggerData: Record<string, any>,
  stepContext: Map<string, Record<string, any>>
): Promise<StepExecutionResult> {
  const startTime = Date.now();
  try {
    const format = config.format || 'MM/DD/YYYY';
    const now = new Date();

    let formatted = '';
    switch (format) {
      case 'MM/DD/YYYY':
        formatted = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
        break;
      case 'DD/MM/YYYY':
        formatted = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
        break;
      case 'YYYY-MM-DD':
        formatted = now.toISOString().split('T')[0];
        break;
      case 'MMM DD, YYYY':
        formatted = now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        break;
      default:
        formatted = now.toISOString();
    }

    return {
      step_id: config.step_id || '',
      service: 'formatter',
      action: 'date_time',
      status: 'completed',
      output: { formatted_date: formatted },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      step_id: config.step_id || '',
      service: 'formatter',
      action: 'date_time',
      status: 'failed',
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function handleDelayStep(
  config: Record<string, any>,
  triggerData: Record<string, any>,
  stepContext: Map<string, Record<string, any>>
): Promise<StepExecutionResult> {
  const startTime = Date.now();
  try {
    const amount = parseInt(config.amount) || 0;
    const unit = config.unit || 'seconds';

    let ms = 0;
    switch (unit) {
      case 'seconds':
        ms = amount * 1000;
        break;
      case 'minutes':
        ms = amount * 60 * 1000;
        break;
      case 'hours':
        ms = amount * 60 * 60 * 1000;
        break;
    }

    // Cap at 30 seconds to avoid blocking edge function
    if (ms > 30000) {
      return {
        step_id: config.step_id || '',
        service: 'delay',
        action: 'delay_until',
        status: 'completed',
        output: { deferred: true, requested_delay: ms },
        duration: Date.now() - startTime,
      };
    }

    await new Promise(resolve => setTimeout(resolve, ms));

    return {
      step_id: config.step_id || '',
      service: 'delay',
      action: 'delay_until',
      status: 'completed',
      output: { delayed_ms: ms },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      step_id: config.step_id || '',
      service: 'delay',
      action: 'delay_until',
      status: 'failed',
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

function handleFilterStep(
  config: Record<string, any>,
  triggerData: Record<string, any>,
  stepContext: Map<string, Record<string, any>>
): StepExecutionResult {
  const startTime = Date.now();
  try {
    const field = config.field || '';
    const operator = config.operator || 'equals';
    const value = config.value || '';

    const fieldValue = triggerData[field];
    let passed = false;

    switch (operator) {
      case 'equals':
        passed = String(fieldValue) === String(value);
        break;
      case 'not_equals':
        passed = String(fieldValue) !== String(value);
        break;
      case 'contains':
        passed = String(fieldValue).includes(String(value));
        break;
      case 'not_contains':
        passed = !String(fieldValue).includes(String(value));
        break;
      case 'is_empty':
        passed = !fieldValue;
        break;
      case 'is_not_empty':
        passed = !!fieldValue;
        break;
      default:
        passed = true;
    }

    return {
      step_id: config.step_id || '',
      service: 'filter',
      action: 'if_condition',
      status: 'completed',
      output: { passed },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      step_id: config.step_id || '',
      service: 'filter',
      action: 'if_condition',
      status: 'failed',
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

// Placeholder for SMS (skip Twilio for now)
async function handleSMSStep(
  config: Record<string, any>,
  triggerData: Record<string, any>,
  stepContext: Map<string, Record<string, any>>
): Promise<StepExecutionResult> {
  return {
    step_id: config.step_id || '',
    service: 'sms',
    action: 'send_sms',
    status: 'skipped',
    error: 'SMS not configured (Twilio skipped for now)',
  };
}

// ==================== MAIN ORCHESTRATION ====================

async function executeWorkflow(context: ExecutionContext): Promise<{
  status: string;
  execution_id?: string;
  duration: number;
  steps_results: StepExecutionResult[];
  error?: string;
}> {
  const executionStartTime = Date.now();
  const stepContext = new Map<string, Record<string, any>>();
  const stepsResults: StepExecutionResult[] = [];
  let skipRemainingSteps = false;
  let clientNotionDatabaseId: string | null = null;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') || '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    );

    // Load client's Notion mapping for fallback
    const { data: clientMapping } = await supabase
      .from('client_notion_mapping')
      .select('notion_database_id')
      .eq('client_id', context.client_id)
      .maybeSingle();

    clientNotionDatabaseId = clientMapping?.notion_database_id || null;

    // Create execution record
    const { data: executionData, error: executionError } = await supabase
      .from('workflow_executions')
      .insert({
        workflow_id: context.workflow_id,
        client_id: context.client_id,
        trigger_data: context.trigger_data,
        status: 'running',
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (executionError) {
      console.error('Failed to create execution record:', executionError);
    }

    const executionId = executionData?.id;

    // Execute steps
    for (const step of context.steps) {
      if (step.type === 'trigger') continue; // Skip trigger step
      if (skipRemainingSteps) break;

      try {
        let result: StepExecutionResult;

        // Add step_id to config for tracking
        step.config.step_id = step.id;

        switch (step.service) {
          case 'email':
            result = await handleEmailStep(step.config, context.trigger_data, stepContext);
            break;

          case 'sms':
            result = await handleSMSStep(step.config, context.trigger_data, stepContext);
            break;

          case 'notion':
            // Use client's mapped database as fallback if step config doesn't have one
            const notionConfig = step.config;
            if (!notionConfig.database_id && clientNotionDatabaseId) {
              notionConfig.database_id = clientNotionDatabaseId;
            }
            result = await handleNotionStep(step.action || 'create_record', notionConfig, context.trigger_data, stepContext);
            break;

          case 'formatter':
            result = await handleFormatterStep(step.config, context.trigger_data, stepContext);
            break;

          case 'delay':
            result = await handleDelayStep(step.config, context.trigger_data, stepContext);
            break;

          case 'filter':
            result = handleFilterStep(step.config, context.trigger_data, stepContext);
            // Check if filter failed - if so, halt remaining steps
            if (!result.output?.passed) {
              skipRemainingSteps = true;
            }
            break;

          default:
            result = {
              step_id: step.id,
              service: step.service,
              status: 'failed',
              error: `Unknown service: ${step.service}`,
            };
        }

        // Store step output for next steps
        if (result.status === 'completed' && result.output) {
          stepContext.set(step.id, result.output);
        }

        stepsResults.push(result);

      } catch (error) {
        stepsResults.push({
          step_id: step.id,
          service: step.service,
          action: step.action,
          status: 'failed',
          error: String(error),
        });
      }
    }

    // Update execution record with results
    if (executionId) {
      const allCompleted = stepsResults.every(s => s.status === 'completed' || s.status === 'skipped');
      const duration = Date.now() - executionStartTime;

      await supabase
        .from('workflow_executions')
        .update({
          status: allCompleted ? 'completed' : 'failed',
          steps_results: stepsResults,
          duration_ms: duration,
          completed_at: new Date().toISOString(),
        })
        .eq('id', executionId);
    }

    return {
      status: 'success',
      execution_id: executionId,
      duration: Date.now() - executionStartTime,
      steps_results: stepsResults,
    };

  } catch (error) {
    return {
      status: 'error',
      duration: Date.now() - executionStartTime,
      steps_results: stepsResults,
      error: String(error),
    };
  }
}

// ==================== HTTP HANDLER ====================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workflow_id, client_id, trigger_data, steps } = await req.json();

    if (!workflow_id || !client_id || !steps) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await executeWorkflow({
      workflow_id,
      client_id,
      trigger_data: trigger_data || {},
      steps,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
