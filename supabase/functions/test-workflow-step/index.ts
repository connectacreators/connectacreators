import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ==================== TYPES ====================
interface WorkflowStep {
  id: string;
  service: string;
  action?: string;
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

    console.log(`[TEST EMAIL] To: ${to}, Subject: ${subject}`);
    return {
      step_id: config.step_id || '',
      service: 'email',
      action: 'send_email',
      status: 'completed',
      output: { sent_to: to },
      duration: Date.now() - startTime,
    };
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
        const searchPropertyType = config.search_property_type || 'title'; // title, text, rich_text, etc.

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

        // Build the filter based on the actual property type
        let filterBody: Record<string, any> = {
          property: searchProperty,
        };

        // Add appropriate filter based on property type
        if (searchPropertyType === 'title' || searchPropertyType === 'text' || searchPropertyType === 'rich_text') {
          filterBody[searchPropertyType] = { contains: searchValue };
        } else if (searchPropertyType === 'select' || searchPropertyType === 'status') {
          filterBody[searchPropertyType] = { equals: searchValue };
        } else if (searchPropertyType === 'number') {
          filterBody[searchPropertyType] = { equals: parseInt(searchValue) };
        } else {
          filterBody['text'] = { contains: searchValue };
        }

        const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ filter: filterBody }),
        });

        if (!response.ok) {
          const errorData = await response.text();
          return {
            step_id: config.step_id || '',
            service: 'notion',
            action,
            status: 'failed',
            error: `Notion API error: ${response.status} - ${errorData}`,
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
            output: { page_id: '', title: '', url: '', found: false },
            duration: Date.now() - startTime,
          };
        }

        // Extract title from the actual search property, not hardcoded 'Name'
        let extractedTitle = '';
        const searchPropData = firstResult.properties?.[searchProperty];
        if (searchPropData) {
          if (searchPropData.title) {
            extractedTitle = searchPropData.title?.[0]?.plain_text || '';
          } else if (searchPropData.rich_text) {
            extractedTitle = searchPropData.rich_text?.[0]?.plain_text || '';
          } else if (searchPropData.select) {
            extractedTitle = searchPropData.select?.name || '';
          } else if (searchPropData.status) {
            extractedTitle = searchPropData.status?.name || '';
          } else if (searchPropData.number) {
            extractedTitle = String(searchPropData.number) || '';
          }
        }

        return {
          step_id: config.step_id || '',
          service: 'notion',
          action,
          status: 'completed',
          output: {
            page_id: firstResult.id,
            title: extractedTitle,
            url: firstResult.url,
            found: true,
            properties: firstResult.properties,
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

        if (config.fields && Array.isArray(config.fields)) {
          for (const field of config.fields) {
            const fieldValue = interpolateVariables(field.value || '', triggerData, stepContext);

            if (field.property_type === 'title') {
              properties[field.property_name] = {
                title: [{ text: { content: fieldValue } }],
              };
            } else if (field.property_type === 'text' || field.property_type === 'rich_text') {
              properties[field.property_name] = {
                rich_text: [{ text: { content: fieldValue } }],
              };
            } else if (field.property_type === 'select') {
              properties[field.property_name] = {
                select: { name: fieldValue },
              };
            } else if (field.property_type === 'status') {
              properties[field.property_name] = {
                status: { name: fieldValue },
              };
            } else if (field.property_type === 'checkbox') {
              properties[field.property_name] = {
                checkbox: fieldValue === 'true' || fieldValue === true,
              };
            } else if (field.property_type === 'number') {
              properties[field.property_name] = {
                number: parseInt(fieldValue) || 0,
              };
            } else if (field.property_type === 'date') {
              properties[field.property_name] = {
                date: { start: fieldValue },
              };
            }
          }
        }

        // Validate that we have properties to update
        if (Object.keys(properties).length === 0) {
          return {
            step_id: config.step_id || '',
            service: 'notion',
            action,
            status: 'failed',
            error: 'No fields configured to update. Add at least one field in the step configuration.',
            duration: Date.now() - startTime,
          };
        }

        const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ properties }),
        });

        if (!response.ok) {
          let errorDetails = `Update failed: ${response.status}`;
          try {
            const errorData = await response.json();
            if (errorData.message) {
              errorDetails = `Notion error: ${errorData.message}`;
            } else if (errorData.error) {
              errorDetails = `Notion error: ${errorData.error}`;
            }
          } catch {
            const errorText = await response.text();
            if (errorText) {
              errorDetails = `Notion error: ${errorText.substring(0, 200)}`;
            }
          }
          return {
            step_id: config.step_id || '',
            service: 'notion',
            action,
            status: 'failed',
            error: errorDetails,
            duration: Date.now() - startTime,
          };
        }

        return {
          step_id: config.step_id || '',
          service: 'notion',
          action,
          status: 'completed',
          output: { page_id: pageId, updated: true },
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

async function handleSMSStep(
  config: Record<string, any>,
  triggerData: Record<string, any>,
  stepContext: Map<string, Record<string, any>>
): Promise<StepExecutionResult> {
  const startTime = Date.now();
  try {
    const to = interpolateVariables(config.to, triggerData, stepContext);
    const message = interpolateVariables(config.message || '', triggerData, stepContext);

    if (!to) {
      return {
        step_id: config.step_id || '',
        service: 'sms',
        action: 'send_sms',
        status: 'failed',
        error: 'No phone number provided',
        duration: Date.now() - startTime,
      };
    }

    console.log(`[TEST SMS] To: ${to}, Message: ${message}`);
    return {
      step_id: config.step_id || '',
      service: 'sms',
      action: 'send_sms',
      status: 'completed',
      output: { sent_to: to },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      step_id: config.step_id || '',
      service: 'sms',
      action: 'send_sms',
      status: 'failed',
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function handleWhatsAppStep(
  config: Record<string, any>,
  triggerData: Record<string, any>,
  stepContext: Map<string, Record<string, any>>
): Promise<StepExecutionResult> {
  const startTime = Date.now();
  try {
    const to = interpolateVariables(config.to, triggerData, stepContext);
    const message = interpolateVariables(config.message || '', triggerData, stepContext);

    if (!to) {
      return {
        step_id: config.step_id || '',
        service: 'whatsapp',
        action: 'send_whatsapp',
        status: 'failed',
        error: 'No phone number provided',
        duration: Date.now() - startTime,
      };
    }

    console.log(`[TEST WHATSAPP] To: ${to}, Message: ${message}`);
    return {
      step_id: config.step_id || '',
      service: 'whatsapp',
      action: 'send_whatsapp',
      status: 'completed',
      output: { sent_to: to },
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      step_id: config.step_id || '',
      service: 'whatsapp',
      action: 'send_whatsapp',
      status: 'failed',
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

async function handleWebhookStep(
  config: Record<string, any>,
  triggerData: Record<string, any>,
  stepContext: Map<string, Record<string, any>>
): Promise<StepExecutionResult> {
  const startTime = Date.now();
  try {
    const url = interpolateVariables(config.url || '', triggerData, stepContext);
    const method = (config.method || 'POST').toUpperCase();
    const headersStr = config.headers || '{}';
    const bodyTemplate = config.body || '';

    if (!url) {
      return {
        step_id: config.step_id || '',
        service: 'webhook',
        action: 'send_request',
        status: 'failed',
        error: 'No webhook URL provided',
        duration: Date.now() - startTime,
      };
    }

    try {
      // Parse headers
      let headers: Record<string, string> = {};
      try {
        const parsedHeaders = JSON.parse(headersStr);
        headers = typeof parsedHeaders === 'object' ? parsedHeaders : {};
      } catch {
        headers = {};
      }

      if (!Object.keys(headers).some(k => k.toLowerCase() === 'content-type')) {
        headers['Content-Type'] = 'application/json';
      }

      let body: string | undefined;
      if (bodyTemplate && ['POST', 'PUT', 'PATCH'].includes(method)) {
        const interpolatedBody = interpolateVariables(bodyTemplate, triggerData, stepContext);
        try {
          JSON.parse(interpolatedBody);
          body = interpolatedBody;
        } catch {
          body = JSON.stringify({ body: interpolatedBody });
        }
      }

      const res = await fetch(url, {
        method,
        headers,
        body,
      });

      const responseBody = await res.text();

      console.log(`[TEST WEBHOOK] ${method} ${url}, Status: ${res.status}`);
      return {
        step_id: config.step_id || '',
        service: 'webhook',
        action: 'send_request',
        status: res.ok ? 'completed' : 'failed',
        output: {
          status_code: res.status,
          response_body: responseBody,
        },
        duration: Date.now() - startTime,
      };
    } catch (fetchErr) {
      console.error('[TEST WEBHOOK] Fetch error:', fetchErr);
      return {
        step_id: config.step_id || '',
        service: 'webhook',
        action: 'send_request',
        status: 'failed',
        error: String(fetchErr),
        duration: Date.now() - startTime,
      };
    }
  } catch (error) {
    return {
      step_id: config.step_id || '',
      service: 'webhook',
      action: 'send_request',
      status: 'failed',
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

// Google Sheets handler
async function handleSheetsStep(
  config: Record<string, any>,
  triggerData: Record<string, any>,
  stepContext: Map<string, any>
): Promise<StepExecutionResult> {
  const startTime = Date.now();

  try {
    const action = config.action || 'append_row';

    // Build request payload
    const payload = {
      config: {
        spreadsheet_id: config.spreadsheet_id,
        sheet_name: config.sheet_name || 'Sheet1',
        action: action,
        columns: config.columns || [],
        search_column: config.search_column,
        search_value: config.search_value ? interpolateVariables(config.search_value, triggerData, stepContext) : '',
      },
      trigger_data: triggerData,
    };

    // Call google-sheets edge function
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const sheetsUrl = supabaseUrl + '/functions/v1/google-sheets';

    const response = await fetch(sheetsUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Google Sheets API error: ${errorText}`);
    }

    const result = await response.json();

    return {
      step_id: config.step_id || '',
      service: 'sheets',
      action: action,
      status: result.status === 'completed' ? 'completed' : 'failed',
      output: result.output || {},
      error: result.error,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    console.error('Google Sheets handler error:', error);
    return {
      step_id: config.step_id || '',
      service: 'sheets',
      status: 'failed',
      error: String(error),
      duration: Date.now() - startTime,
    };
  }
}

// ==================== HTTP HANDLER ====================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { step, trigger_data, step_context } = await req.json();

    if (!step || !trigger_data) {
      return new Response(
        JSON.stringify({ error: 'Missing step or trigger_data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Convert plain object stepContext to Map
    const contextMap = new Map<string, Record<string, any>>();
    if (step_context && typeof step_context === 'object') {
      Object.entries(step_context).forEach(([key, value]) => {
        contextMap.set(key, value as Record<string, any>);
      });
    }

    let result: StepExecutionResult;

    // Add step_id to config for tracking
    step.config.step_id = step.id;

    // Get retry configuration
    const retryCount = step.config.retry_count || 0;
    const retryDelayMs = step.config.retry_delay_ms || 1000;

    // Retry loop - attempt execution up to (retryCount + 1) times
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      switch (step.service) {
        case 'email':
          result = await handleEmailStep(step.config, trigger_data, contextMap);
          break;

        case 'sms':
          result = await handleSMSStep(step.config, trigger_data, contextMap);
          break;

        case 'whatsapp':
          result = await handleWhatsAppStep(step.config, trigger_data, contextMap);
          break;

        case 'webhook':
          result = await handleWebhookStep(step.config, trigger_data, contextMap);
          break;

        case 'notion':
          result = await handleNotionStep(step.action || 'create_record', step.config, trigger_data, contextMap);
          break;

        case 'formatter':
          result = await handleFormatterStep(step.config, trigger_data, contextMap);
          break;

        case 'delay':
          result = await handleDelayStep(step.config, trigger_data, contextMap);
          break;

        case 'filter':
          result = handleFilterStep(step.config, trigger_data, contextMap);
          break;

        case 'sheets':
          result = await handleSheetsStep(step.config, trigger_data, contextMap);
          break;

        default:
          result = {
            step_id: step.id,
            service: step.service,
            status: 'failed',
            error: `Unknown service: ${step.service}`,
          };
      }

      // If successful, break retry loop
      if (result.status !== 'failed') {
        break;
      }

      // If this was the last attempt, don't retry
      if (attempt === retryCount) {
        break;
      }

      // Wait before retrying
      if (retryDelayMs > 0) {
        await new Promise(r => setTimeout(r, retryDelayMs));
      }
    }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: String(error), status: 'failed' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
