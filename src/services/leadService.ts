import { supabase } from '@/integrations/supabase/client';

export interface Lead {
  id: string;
  client_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  status: string;
  notes: string | null;
  follow_up_step: number;
  last_contacted_at: string | null;
  next_follow_up_at: string | null;
  booked: boolean;
  stopped: boolean;
  replied: boolean;
  booking_date: string | null;
  booking_time: string | null;
  created_at: string;
}

export interface CreateLeadInput {
  client_id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string;
  notes?: string | null;
  booking_date?: string | null;
  booking_time?: string | null;
  booked?: boolean;
  follow_up_step?: number;
  last_contacted_at?: string | null;
  next_follow_up_at?: string | null;
  stopped?: boolean;
  replied?: boolean;
}

export interface UpdateLeadInput {
  name?: string;
  phone?: string | null;
  email?: string | null;
  source?: string | null;
  status?: string;
  notes?: string | null;
  follow_up_step?: number;
  last_contacted_at?: string | null;
  next_follow_up_at?: string | null;
  booked?: boolean;
  stopped?: boolean;
  replied?: boolean;
}

export const leadService = {
  async createLead(data: CreateLeadInput): Promise<Lead> {
    try {
      const { data: result, error } = await supabase
        .from('leads')
        .insert([{ ...data, next_follow_up_at: new Date().toISOString() }])
        .select()
        .single();

      if (error) throw error;
      const lead = result as Lead;

      // Trigger immediate follow-up if the lead has an email
      if (lead.email) {
        supabase.functions.invoke('send-followup', { body: { lead_id: lead.id } })
          .then(({ error: fnErr }) => {
            if (fnErr) console.warn('[leadService] send-followup trigger failed:', fnErr);
          });
      }

      return lead;
    } catch (error) {
      console.error('Error creating lead:', error);
      throw error;
    }
  },

  async getLeadById(leadId: string): Promise<Lead | null> {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select()
        .eq('id', leadId)
        .single();

      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data as Lead;
    } catch (error) {
      console.error('Error fetching lead:', error);
      throw error;
    }
  },

  async getLeadsByClient(clientId: string): Promise<Lead[]> {
    try {
      const { data, error } = await supabase
        .from('leads')
        .select()
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Lead[];
    } catch (error) {
      console.error('Error fetching leads for client:', error);
      throw error;
    }
  },

  async updateLead(leadId: string, updates: UpdateLeadInput): Promise<Lead> {
    try {
      const { data, error } = await supabase
        .from('leads')
        .update(updates)
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data as Lead;
    } catch (error) {
      console.error('Error updating lead:', error);
      throw error;
    }
  },

  async deleteLead(leadId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting lead:', error);
      throw error;
    }
  },
};
