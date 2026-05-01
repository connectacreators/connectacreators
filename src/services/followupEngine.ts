import { leadService, type Lead } from './leadService';
import { messageService } from './messageService';
import { aiGenerator } from './aiGenerator';

/**
 * Follow-Up Engine
 *
 * Orchestrates the entire follow-up automation workflow.
 * Uses existing leads table fields for state management:
 *
 * SCHEMA MAPPING:
 * ├─ Lead ID: leads.id
 * ├─ Client ID: leads.client_id
 * ├─ Attempt Count: leads.follow_up_step (0-5)
 * ├─ Next Follow-Up Time: leads.next_follow_up_at (timestamp)
 * ├─ Last Contact: leads.last_contacted_at (timestamp)
 * └─ Stop Conditions:
 *    ├─ booked: boolean (appointment confirmed)
 *    ├─ replied: boolean (lead responded)
 *    ├─ stopped: boolean (lead opted out / dead)
 *    └─ follow_up_step >= 5 (max attempts reached)
 *
 * FOLLOW-UP SCHEDULE:
 * ├─ Attempt 1: Immediate (via startFollowUp)
 * ├─ Attempt 2: +10 minutes
 * ├─ Attempt 3: +1 day
 * ├─ Attempt 4: +2 days
 * ├─ Attempt 5: +3 days
 * └─ After Attempt 5: Mark as stopped (stopped=true)
 */

interface FollowUpResult {
  success: boolean;
  leadId: string;
  attempt: number;
  messageId?: string;
  error?: string;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60000);
}

/**
 * Calculate next follow-up time based on current attempt
 */
function calculateNextFollowUpTime(currentAttempt: number): Date {
  const now = new Date();

  const schedules = {
    1: () => addMinutes(now, 10), // Attempt 2 at +10 min
    2: () => addDays(now, 1), // Attempt 3 at +1 day
    3: () => addDays(now, 2), // Attempt 4 at +2 days
    4: () => addDays(now, 3), // Attempt 5 at +3 days
    5: null, // No more follow-ups (max reached)
  };

  return (schedules as any)[currentAttempt]?.() || now;
}

export const followupEngine = {
  /**
   * Start follow-up for a new lead (called immediately after lead is created)
   *
   * Attempt 1: Generate message, send email, log, schedule Attempt 2
   */
  async startFollowUp(leadId: string): Promise<FollowUpResult> {
    try {
      console.log(`[FollowUp] Starting follow-up for lead: ${leadId}`);

      // Load lead
      const lead = await leadService.getLeadById(leadId);
      if (!lead) {
        return {
          success: false,
          leadId,
          attempt: 0,
          error: `Lead not found: ${leadId}`,
        };
      }

      // Check stop conditions
      if (lead.booked || lead.stopped || lead.replied) {
        console.log(
          `[FollowUp] Lead ${leadId} already has stop condition: booked=${lead.booked}, stopped=${lead.stopped}, replied=${lead.replied}`
        );
        return {
          success: false,
          leadId,
          attempt: 0,
          error: 'Lead already has stop condition',
        };
      }

      // Generate message via Claude
      console.log(`[FollowUp] Generating message for lead ${leadId}...`);
      const { subject, body } = await aiGenerator.generateFollowUpMessage(lead, 1);

      console.log(`[FollowUp] Generated message:\nSubject: ${subject}\nBody: ${body}`);

      // Send via email (primary channel)
      if (!lead.email) {
        return {
          success: false,
          leadId,
          attempt: 1,
          error: `Lead ${lead.name} has no email address`,
        };
      }

      console.log(`[FollowUp] Sending email to ${lead.email}...`);

      const sendResult = await messageService.sendMessage({
        lead,
        channel: 'email',
        subject,
        body,
        fromName: 'Follow-up Team',
      });

      if (!sendResult.success) {
        return {
          success: false,
          leadId,
          attempt: 1,
          error: `Failed to send email: ${sendResult.error}`,
        };
      }

      // Log outbound message
      const message = await messageService.logMessage({
        lead_id: leadId,
        direction: 'outbound',
        channel: 'email',
        subject,
        body,
        sent_at: new Date().toISOString(),
      });

      console.log(`[FollowUp] Message logged: ${message.id}`);

      // Update lead: increment attempt, schedule next follow-up
      const nextFollowUpTime = calculateNextFollowUpTime(1); // Next = Attempt 2

      await leadService.updateLead(leadId, {
        follow_up_step: 1,
        last_contacted_at: new Date().toISOString(),
        next_follow_up_at: nextFollowUpTime.toISOString(),
      });

      console.log(
        `[FollowUp] Lead updated: attempt=1, next_follow_up_at=${nextFollowUpTime.toISOString()}`
      );

      return {
        success: true,
        leadId,
        attempt: 1,
        messageId: message.id,
      };
    } catch (error) {
      console.error(`[FollowUp] Error starting follow-up for ${leadId}:`, error);
      return {
        success: false,
        leadId,
        attempt: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /**
   * Process a follow-up for a lead that is due now
   * Called by the 5-minute worker for Attempts 2-5
   */
  async processFollowUp(leadId: string): Promise<FollowUpResult> {
    try {
      console.log(`[FollowUp] Processing follow-up for lead: ${leadId}`);

      // Load lead
      const lead = await leadService.getLeadById(leadId);
      if (!lead) {
        return {
          success: false,
          leadId,
          attempt: 0,
          error: `Lead not found: ${leadId}`,
        };
      }

      const currentAttempt = lead.follow_up_step || 0;
      const nextAttempt = currentAttempt + 1;

      console.log(`[FollowUp] Current attempt: ${currentAttempt}, Next: ${nextAttempt}`);

      // Check stop conditions
      if (lead.booked) {
        console.log(`[FollowUp] Lead ${leadId} booked - stopping follow-ups`);
        return {
          success: false,
          leadId,
          attempt: nextAttempt,
          error: 'Lead booked',
        };
      }

      if (lead.replied) {
        console.log(`[FollowUp] Lead ${leadId} replied - stopping follow-ups`);
        return {
          success: false,
          leadId,
          attempt: nextAttempt,
          error: 'Lead replied',
        };
      }

      if (lead.stopped) {
        console.log(`[FollowUp] Lead ${leadId} opted out - stopping follow-ups`);
        return {
          success: false,
          leadId,
          attempt: nextAttempt,
          error: 'Lead stopped',
        };
      }

      if (nextAttempt > 5) {
        console.log(`[FollowUp] Lead ${leadId} max attempts reached (5)`);

        // Mark as stopped (no more attempts)
        await leadService.updateLead(leadId, {
          stopped: true,
          follow_up_step: 5,
        });

        return {
          success: false,
          leadId,
          attempt: 5,
          error: 'Max attempts reached',
        };
      }

      // Get message history for context
      const history = await messageService.getMessageHistory(leadId, 3);
      const previousBodies = history
        .filter((m) => m.direction === 'outbound')
        .reverse()
        .map((m) => m.body);

      // Generate message via Claude (with context)
      console.log(`[FollowUp] Generating message for attempt ${nextAttempt}...`);
      const { subject, body } = await aiGenerator.generateFollowUpMessage(
        lead,
        nextAttempt,
        previousBodies
      );

      console.log(
        `[FollowUp] Generated message:\nSubject: ${subject}\nBody: ${body.substring(0, 100)}...`
      );

      // Send via email
      if (!lead.email) {
        return {
          success: false,
          leadId,
          attempt: nextAttempt,
          error: `Lead ${lead.name} has no email address`,
        };
      }

      console.log(`[FollowUp] Sending email to ${lead.email}...`);

      const sendResult = await messageService.sendMessage({
        lead,
        channel: 'email',
        subject,
        body,
        fromName: 'Follow-up Team',
      });

      if (!sendResult.success) {
        return {
          success: false,
          leadId,
          attempt: nextAttempt,
          error: `Failed to send email: ${sendResult.error}`,
        };
      }

      // Log outbound message
      const message = await messageService.logMessage({
        lead_id: leadId,
        direction: 'outbound',
        channel: 'email',
        subject,
        body,
        sent_at: new Date().toISOString(),
      });

      console.log(`[FollowUp] Message logged: ${message.id}`);

      // Update lead: increment attempt, schedule next follow-up
      const nextFollowUpTime =
        nextAttempt < 5 ? calculateNextFollowUpTime(nextAttempt) : new Date();

      await leadService.updateLead(leadId, {
        follow_up_step: nextAttempt,
        last_contacted_at: new Date().toISOString(),
        next_follow_up_at: nextFollowUpTime.toISOString(),
      });

      console.log(
        `[FollowUp] Lead updated: attempt=${nextAttempt}, next_follow_up_at=${nextFollowUpTime.toISOString()}`
      );

      return {
        success: true,
        leadId,
        attempt: nextAttempt,
        messageId: message.id,
      };
    } catch (error) {
      console.error(`[FollowUp] Error processing follow-up for ${leadId}:`, error);
      return {
        success: false,
        leadId,
        attempt: 0,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /**
   * Get leads that are eligible and due for follow-up now
   */
  async getLeadsForFollowUp(): Promise<Lead[]> {
    try {
      console.log(`[FollowUp] Fetching leads due for follow-up...`);

      // This would need to be a direct Supabase query or edge function
      // For now, return empty (worker will implement the actual query)
      // The worker has better access to Supabase realtime queries

      return [];
    } catch (error) {
      console.error('[FollowUp] Error fetching leads for follow-up:', error);
      return [];
    }
  },
};
