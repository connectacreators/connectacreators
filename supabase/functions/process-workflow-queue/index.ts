import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface QueueJob {
  id: string;
  workflow_id: string;
  client_id: string;
  status: string;
  scheduled_for: string;
  trigger_data: Record<string, any>;
  workflow_steps: any[];
  retry_count: number;
  max_retries: number;
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const headers = new Headers();
  headers.set('Authorization', `Bearer ${serviceRoleKey}`);
  headers.set('Content-Type', 'application/json');
  headers.set('apikey', serviceRoleKey);

  try {
    // Fetch jobs that are ready to execute
    const now = new Date().toISOString();

    const jobsRes = await fetch(
      `${supabaseUrl}/rest/v1/workflow_execution_queue?status=in.("pending","retry")&scheduled_for=lte.${now}&order=scheduled_for.asc&limit=10`,
      { headers }
    );

    if (!jobsRes.ok) {
      throw new Error(`Failed to fetch queue jobs: ${jobsRes.statusText}`);
    }

    const jobs: QueueJob[] = await jobsRes.json();
    const results = [];

    for (const job of jobs) {
      try {
        // Update status to processing
        await fetch(
          `${supabaseUrl}/rest/v1/workflow_execution_queue?id=eq.${job.id}`,
          {
            method: 'PATCH',
            headers: Object.fromEntries(headers.entries()),
            body: JSON.stringify({
              status: 'processing',
              last_attempted_at: new Date().toISOString(),
            }),
          }
        );

        // Execute the workflow
        const executeRes = await fetch(`${supabaseUrl}/functions/v1/execute-workflow`, {
          method: 'POST',
          headers: Object.fromEntries(headers.entries()),
          body: JSON.stringify({
            workflow_id: job.workflow_id,
            client_id: job.client_id,
            trigger_data: job.trigger_data,
            steps: job.workflow_steps,
          }),
        });

        if (!executeRes.ok) {
          throw new Error(`Workflow execution failed: ${executeRes.statusText}`);
        }

        const executionResult = await executeRes.json();

        // Mark job as completed
        await fetch(
          `${supabaseUrl}/rest/v1/workflow_execution_queue?id=eq.${job.id}`,
          {
            method: 'PATCH',
            headers: Object.fromEntries(headers.entries()),
            body: JSON.stringify({
              status: 'completed',
              execution_id: executionResult.execution_id,
              completed_at: new Date().toISOString(),
            }),
          }
        );

        results.push({ job_id: job.id, status: 'completed' });
      } catch (jobError) {
        console.error(`Error processing job ${job.id}:`, jobError);

        // Check if we should retry
        const shouldRetry = job.retry_count < job.max_retries;
        const nextScheduledFor = new Date();
        nextScheduledFor.setMinutes(nextScheduledFor.getMinutes() + (5 * (job.retry_count + 1))); // Exponential backoff: 5, 10, 15 mins

        await fetch(
          `${supabaseUrl}/rest/v1/workflow_execution_queue?id=eq.${job.id}`,
          {
            method: 'PATCH',
            headers: Object.fromEntries(headers.entries()),
            body: JSON.stringify({
              status: shouldRetry ? 'retry' : 'failed',
              error_message: String(jobError),
              retry_count: job.retry_count + 1,
              scheduled_for: shouldRetry ? nextScheduledFor.toISOString() : job.scheduled_for,
            }),
          }
        );

        results.push({
          job_id: job.id,
          status: shouldRetry ? 'retry_scheduled' : 'failed',
          error: String(jobError),
        });
      }
    }

    return new Response(
      JSON.stringify({
        status: 'success',
        processed: results.length,
        results: results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Queue processor error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
