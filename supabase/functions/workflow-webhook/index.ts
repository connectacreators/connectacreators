import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WebhookPayload {
  [key: string]: any;
}

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Extract webhook ID from URL path
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const webhookId = pathParts[pathParts.length - 1];

    if (!webhookId) {
      return new Response(
        JSON.stringify({ error: 'Invalid webhook URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Read raw body for signature verification
    const rawBody = await req.arrayBuffer();
    const rawBodyBytes = new Uint8Array(rawBody);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const headers = new Headers();
    headers.set('Authorization', `Bearer ${serviceRoleKey}`);
    headers.set('Content-Type', 'application/json');
    headers.set('apikey', serviceRoleKey);

    // Look up workflow by webhook_id
    const workflowRes = await fetch(
      `${supabaseUrl}/rest/v1/client_workflows?webhook_id=eq.${webhookId}&select=*`,
      {
        headers,
      }
    );

    if (!workflowRes.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to lookup webhook' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const workflows = await workflowRes.json();

    if (!workflows || workflows.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Webhook not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const workflow = workflows[0];

    // Verify HMAC signature using webhook_secret
    if (workflow.webhook_secret) {
      const signatureHeader = req.headers.get('x-webhook-signature');
      if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
        return new Response(
          JSON.stringify({ error: 'Missing or invalid X-Webhook-Signature header' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const providedHex = signatureHeader.slice(7); // Remove 'sha256=' prefix

      // Compute HMAC-SHA256
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(workflow.webhook_secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const signature = await crypto.subtle.sign('HMAC', key, rawBodyBytes);
      const expectedHex = Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Timing-safe comparison
      if (providedHex.length !== expectedHex.length) {
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let diff = 0;
      for (let i = 0; i < expectedHex.length; i++) {
        diff |= expectedHex.charCodeAt(i) ^ providedHex.charCodeAt(i);
      }

      if (diff !== 0) {
        return new Response(
          JSON.stringify({ error: 'Invalid signature' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Parse incoming payload from raw body
    let payload: WebhookPayload = {};
    const contentType = req.headers.get('content-type') || '';
    const bodyText = new TextDecoder().decode(rawBodyBytes);

    try {
      if (contentType.includes('application/json')) {
        payload = bodyText ? JSON.parse(bodyText) : {};
      } else if (contentType.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(bodyText);
        for (const [key, value] of params.entries()) {
          payload[key] = value;
        }
      } else {
        payload = { raw_body: bodyText };
      }
    } catch (e) {
      console.error('Failed to parse webhook payload:', e);
      payload = { raw_body: bodyText };
    }

    // Check if workflow is active
    if (!workflow.is_active) {
      return new Response(
        JSON.stringify({ status: 'skipped', message: 'Workflow is paused' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse steps
    let steps = [];
    try {
      steps = typeof workflow.steps === 'string' ? JSON.parse(workflow.steps) : workflow.steps || [];
    } catch (e) {
      console.error('Failed to parse workflow steps:', e);
      steps = [];
    }

    // Build trigger data from webhook payload
    const triggerData = {
      ...payload,
      webhook_received_at: new Date().toISOString(),
    };

    // Enqueue the workflow for async execution instead of synchronous call
    const queueInsertRes = await fetch(`${supabaseUrl}/rest/v1/workflow_execution_queue`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'apikey': serviceRoleKey,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({
        workflow_id: workflow.id,
        client_id: workflow.client_id,
        status: 'pending',
        scheduled_for: new Date().toISOString(),
        trigger_data: triggerData,
        workflow_steps: steps,
        max_retries: 3,
        retry_count: 0,
      }),
    });

    if (!queueInsertRes.ok) {
      const error = await queueInsertRes.text();
      console.error('Failed to queue workflow:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to queue workflow', details: error }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const queuedJob = await queueInsertRes.json();
    const executionResult = { queue_job_id: queuedJob[0]?.id };

    // Update workflow's last_triggered_at
    await fetch(`${supabaseUrl}/rest/v1/client_workflows?id=eq.${workflow.id}`, {
      method: 'PATCH',
      headers: {
        ...Object.fromEntries(headers.entries()),
      },
      body: JSON.stringify({
        last_triggered_at: new Date().toISOString(),
      }),
    });

    return new Response(
      JSON.stringify({
        status: 'queued',
        queue_job_id: executionResult.queue_job_id,
        message: 'Workflow queued for execution',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
