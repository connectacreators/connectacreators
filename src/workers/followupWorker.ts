/**
 * Follow-Up Worker
 *
 * Runs every 5 minutes to process follow-ups that are due.
 *
 * DEPLOYMENT:
 * - This should be deployed as a Supabase Edge Function scheduled via cron
 * - Or implemented as a background job in a Node.js process
 * - Or called from a frontend component with react-query/SWR polling
 *
 * For now, provide a client-side function that can be called periodically.
 *
 * USAGE:
 * // In App.tsx or a dedicated worker component:
 * useEffect(() => {
 *   const interval = setInterval(() => {
 *     followupWorker.processQueuedFollowUps();
 *   }, 5 * 60 * 1000); // 5 minutes
 *   return () => clearInterval(interval);
 * }, []);
 */

import { supabase } from '@/integrations/supabase/client';
import { followupEngine } from '@/services/followupEngine';
import type { Lead } from '@/services/leadService';

interface WorkerStats {
  processed: number;
  successful: number;
  failed: number;
  errors: string[];
}

/**
 * Find all leads that are:
 * 1. Due for follow-up now (next_follow_up_at <= now)
 * 2. Not already marked as booked/stopped/replied
 * 3. Haven't exceeded max attempts (follow_up_step < 5)
 */
async function getLeadsDueForFollowUp(): Promise<Lead[]> {
  try {
    const now = new Date().toISOString();

    // Query Supabase directly
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .lte('next_follow_up_at', now) // Due now or in the past
      .eq('booked', false)
      .eq('stopped', false)
      .eq('replied', false)
      .lt('follow_up_step', 5) // Less than 5 attempts (0-4)
      .order('next_follow_up_at', { ascending: true })
      .limit(50); // Process max 50 at a time to avoid overload

    if (error) {
      console.error('[FollowUpWorker] Error querying leads:', error);
      return [];
    }

    console.log(`[FollowUpWorker] Found ${data?.length || 0} leads due for follow-up`);
    return (data || []) as Lead[];
  } catch (error) {
    console.error('[FollowUpWorker] Error in getLeadsDueForFollowUp:', error);
    return [];
  }
}

export const followupWorker = {
  /**
   * Main worker function - call every 5 minutes
   */
  async processQueuedFollowUps(): Promise<WorkerStats> {
    const stats: WorkerStats = {
      processed: 0,
      successful: 0,
      failed: 0,
      errors: [],
    };

    const startTime = Date.now();

    try {
      console.log(
        `[FollowUpWorker] Starting worker cycle at ${new Date().toISOString()}`
      );

      // Get leads due for follow-up
      const leadsDue = await getLeadsDueForFollowUp();

      if (leadsDue.length === 0) {
        console.log('[FollowUpWorker] No leads due for follow-up');
        return stats;
      }

      stats.processed = leadsDue.length;

      // Process each lead
      for (const lead of leadsDue) {
        try {
          console.log(
            `[FollowUpWorker] Processing lead: ${lead.id} (${lead.name}), attempt ${lead.follow_up_step}`
          );

          const result = await followupEngine.processFollowUp(lead.id);

          if (result.success) {
            stats.successful++;
            console.log(
              `[FollowUpWorker] ✓ Lead ${lead.id} attempt ${result.attempt} sent successfully`
            );
          } else {
            stats.failed++;
            const errorMsg = `Lead ${lead.id}: ${result.error}`;
            stats.errors.push(errorMsg);
            console.log(`[FollowUpWorker] ✗ ${errorMsg}`);
          }
        } catch (error) {
          stats.failed++;
          const errorMsg = `Error processing lead ${lead.id}: ${error instanceof Error ? error.message : String(error)}`;
          stats.errors.push(errorMsg);
          console.error(`[FollowUpWorker] ${errorMsg}`);
        }
      }

      const duration = Date.now() - startTime;
      console.log(
        `[FollowUpWorker] Cycle complete: ${stats.successful}/${stats.processed} successful in ${duration}ms`
      );

      if (stats.errors.length > 0) {
        console.error('[FollowUpWorker] Errors encountered:', stats.errors);
      }

      return stats;
    } catch (error) {
      const errorMsg = `Critical worker error: ${error instanceof Error ? error.message : String(error)}`;
      stats.errors.push(errorMsg);
      console.error(`[FollowUpWorker] ${errorMsg}`);
      return stats;
    }
  },

  /**
   * Manual trigger for immediate follow-up after lead creation
   * (called from Facebook webhook or lead creation flow)
   */
  async triggerImmediateFollowUp(leadId: string): Promise<boolean> {
    try {
      console.log(`[FollowUpWorker] Triggering immediate follow-up for lead: ${leadId}`);

      const result = await followupEngine.startFollowUp(leadId);

      if (result.success) {
        console.log(`[FollowUpWorker] ✓ Immediate follow-up sent for ${leadId}`);
        return true;
      } else {
        console.error(`[FollowUpWorker] ✗ Failed to send immediate follow-up: ${result.error}`);
        return false;
      }
    } catch (error) {
      console.error('[FollowUpWorker] Error in triggerImmediateFollowUp:', error);
      return false;
    }
  },

  /**
   * Get worker statistics (for debugging/dashboard)
   */
  async getWorkerHealth(): Promise<{
    lastRun?: string;
    leadsPending: number;
    nextLeads: Array<{ id: string; name: string; dueAt: string }>;
  }> {
    try {
      // Get next 5 leads due for follow-up
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, next_follow_up_at')
        .lte('next_follow_up_at', now)
        .eq('booked', false)
        .eq('stopped', false)
        .eq('replied', false)
        .lt('follow_up_step', 5)
        .order('next_follow_up_at', { ascending: true })
        .limit(5);

      if (error) {
        console.error('[FollowUpWorker] Error getting health stats:', error);
        return { leadsPending: 0, nextLeads: [] };
      }

      // Get total pending
      const { count, error: countError } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .lte('next_follow_up_at', now)
        .eq('booked', false)
        .eq('stopped', false)
        .eq('replied', false)
        .lt('follow_up_step', 5);

      return {
        leadsPending: count || 0,
        nextLeads: (data || []).map((lead: any) => ({
          id: lead.id,
          name: lead.name,
          dueAt: lead.next_follow_up_at,
        })),
      };
    } catch (error) {
      console.error('[FollowUpWorker] Error in getWorkerHealth:', error);
      return { leadsPending: 0, nextLeads: [] };
    }
  },
};
