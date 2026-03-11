/**
 * process-followup-queue
 *
 * Runs every 5 minutes via pg_cron. Finds all leads due for follow-up
 * and calls send-followup for each one.
 *
 * Triggered by: pg_cron every 5 minutes
 * Also callable manually via POST for testing.
 *
 * Returns: { processed: number, successful: number, failed: number, errors: string[] }
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Verify cron secret if present (optional but recommended)
  const cronSecret = Deno.env.get('CRON_SECRET') || 'connectacreators-cron-2026';
  const incomingSecret = req.headers.get('x-cron-secret');
  if (incomingSecret && incomingSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const stats = { processed: 0, successful: 0, failed: 0, errors: [] as string[] };

  try {
    const now = new Date().toISOString();

    // Find leads due for follow-up
    const { data: leads, error } = await supabase
      .from('leads')
      .select('id, name, follow_up_step, next_follow_up_at')
      .lte('next_follow_up_at', now)
      .eq('booked', false)
      .eq('stopped', false)
      .eq('replied', false)
      .lt('follow_up_step', 5)
      .not('next_follow_up_at', 'is', null)
      .order('next_follow_up_at', { ascending: true })
      .limit(50);

    if (error) {
      throw new Error(`DB query failed: ${error.message}`);
    }

    if (!leads || leads.length === 0) {
      console.log('[process-followup-queue] No leads due for follow-up');
      return new Response(JSON.stringify({ ...stats, message: 'No leads due' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    stats.processed = leads.length;
    console.log(`[process-followup-queue] Processing ${leads.length} leads`);

    // Call send-followup for each lead
    const sendFollowupUrl = `${supabaseUrl}/functions/v1/send-followup`;

    for (const lead of leads) {
      try {
        const response = await fetch(sendFollowupUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ lead_id: lead.id }),
        });

        const result = await response.json();

        if (result.success || result.skipped) {
          stats.successful++;
          console.log(`[process-followup-queue] ✓ Lead ${lead.id} (${lead.name}) — attempt ${result.attempt || 'skipped'}`);
        } else {
          stats.failed++;
          const msg = `Lead ${lead.id}: ${result.error || 'unknown error'}`;
          stats.errors.push(msg);
          console.error(`[process-followup-queue] ✗ ${msg}`);
        }
      } catch (err) {
        stats.failed++;
        const msg = `Lead ${lead.id}: ${err instanceof Error ? err.message : String(err)}`;
        stats.errors.push(msg);
        console.error(`[process-followup-queue] ✗ ${msg}`);
      }
    }

    console.log(`[process-followup-queue] Done: ${stats.successful}/${stats.processed} successful`);

    return new Response(JSON.stringify(stats), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[process-followup-queue] Critical error:', err);
    return new Response(
      JSON.stringify({ ...stats, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
