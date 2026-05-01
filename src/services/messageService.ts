import { supabase } from '@/integrations/supabase/client';
import type { Lead } from './leadService';

export type MessageChannel = 'email' | 'sms' | 'whatsapp';
export type MessageDirection = 'inbound' | 'outbound';

export interface Message {
  id: string;
  lead_id: string;
  direction: MessageDirection;
  channel: MessageChannel;
  subject?: string | null;
  body: string;
  sent_at: string | null;
  read_at?: string | null;
  created_at: string;
}

export interface CreateMessageInput {
  lead_id: string;
  direction: MessageDirection;
  channel: MessageChannel;
  subject?: string | null;
  body: string;
  sent_at?: string | null;
}

export interface SendMessageOptions {
  lead: Lead;
  channel: MessageChannel;
  subject?: string;
  body: string;
  fromName?: string;
  replyTo?: string;
}

export const messageService = {
  /**
   * Log a message (inbound or outbound) to the messages table
   */
  async logMessage(input: CreateMessageInput): Promise<Message> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([input])
        .select()
        .single();

      if (error) throw error;
      return data as Message;
    } catch (error) {
      console.error('Error logging message:', error);
      throw error;
    }
  },

  /**
   * Get message history for a lead
   */
  async getMessageHistory(leadId: string, limit: number = 10): Promise<Message[]> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select()
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as Message[];
    } catch (error) {
      console.error('Error fetching message history:', error);
      return [];
    }
  },

  /**
   * Send a message via the specified channel
   *
   * This is the main abstraction layer. It routes to the appropriate
   * sending service (Zoho for email, Twilio for SMS, etc.)
   *
   * NOTE: This should be called from a Supabase Edge Function wrapper
   * because client-side code cannot send emails directly.
   */
  async sendMessage(options: SendMessageOptions): Promise<{ success: boolean; error?: string }> {
    const { lead, channel, subject, body, fromName, replyTo } = options;

    console.log(`[MessageService] Sending ${channel} to ${lead.email || lead.phone}`, {
      leadId: lead.id,
      leadName: lead.name,
    });

    try {
      // Route to appropriate service
      switch (channel) {
        case 'email':
          if (!lead.email) {
            return {
              success: false,
              error: `Lead ${lead.name} has no email address`,
            };
          }

          // This would be implemented via Supabase Edge Function
          // For now, return a placeholder response
          // In production: const result = await zohoService.sendEmail({ to: lead.email, subject, body, fromName, replyTo });

          console.log(
            `[Email] Would send to ${lead.email}:\nSubject: ${subject}\nBody: ${body.substring(0, 100)}...`
          );

          return {
            success: true,
          };

        case 'sms':
          if (!lead.phone) {
            return {
              success: false,
              error: `Lead ${lead.name} has no phone number`,
            };
          }

          // SMS via Twilio (not configured yet)
          console.log(`[SMS] Would send to ${lead.phone}: ${body.substring(0, 100)}...`);

          return {
            success: true,
          };

        default:
          return {
            success: false,
            error: `Unsupported channel: ${channel}`,
          };
      }
    } catch (error) {
      console.error(`Error sending ${channel} message:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },

  /**
   * Get last outbound message for a lead (for context in AI generation)
   */
  async getLastOutboundMessage(leadId: string): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('body')
        .eq('lead_id', leadId)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code === 'PGRST116') return null; // No rows
      if (error) throw error;

      return data?.body || null;
    } catch (error) {
      console.error('Error fetching last message:', error);
      return null;
    }
  },
};
