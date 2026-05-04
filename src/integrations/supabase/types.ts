export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      assistant_memories: {
        Row: {
          client_id: string | null
          created_at: string
          id: string
          key: string
          scope: string
          source_thread_id: string | null
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          id?: string
          key: string
          scope: string
          source_thread_id?: string | null
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          id?: string
          key?: string
          scope?: string
          source_thread_id?: string | null
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_memories_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assistant_memories_source_thread_id_fkey"
            columns: ["source_thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_messages: {
        Row: {
          content: Json
          created_at: string
          id: string
          model: string | null
          role: string
          thread_id: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          model?: string | null
          role: string
          thread_id: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          model?: string | null
          role?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "assistant_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_threads: {
        Row: {
          canvas_node_id: string | null
          client_id: string | null
          created_at: string
          id: string
          last_message_at: string | null
          message_count: number
          origin: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          canvas_node_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          origin: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          canvas_node_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          origin?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistant_threads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_settings: {
        Row: {
          available_days: number[]
          booking_description: string | null
          booking_title: string
          break_times: Json
          client_id: string
          created_at: string
          default_language: string
          end_hour: number
          id: string
          is_active: boolean
          logo_url: string | null
          primary_color: string
          secondary_color: string
          slot_duration_minutes: number
          start_hour: number
          timezone: string
          updated_at: string
          zapier_webhook_url: string | null
        }
        Insert: {
          available_days?: number[]
          booking_description?: string | null
          booking_title?: string
          break_times?: Json
          client_id: string
          created_at?: string
          default_language?: string
          end_hour?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          primary_color?: string
          secondary_color?: string
          slot_duration_minutes?: number
          start_hour?: number
          timezone?: string
          updated_at?: string
          zapier_webhook_url?: string | null
        }
        Update: {
          available_days?: number[]
          booking_description?: string | null
          booking_title?: string
          break_times?: Json
          client_id?: string
          created_at?: string
          default_language?: string
          end_hour?: number
          id?: string
          is_active?: boolean
          logo_url?: string | null
          primary_color?: string
          secondary_color?: string
          slot_duration_minutes?: number
          start_hour?: number
          timezone?: string
          updated_at?: string
          zapier_webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_date: string
          booking_time: string
          client_id: string
          created_at: string
          email: string
          id: string
          message: string | null
          name: string
          notion_page_id: string | null
          phone: string
          status: string
        }
        Insert: {
          booking_date: string
          booking_time: string
          client_id: string
          created_at?: string
          email: string
          id?: string
          message?: string | null
          name: string
          notion_page_id?: string | null
          phone: string
          status?: string
        }
        Update: {
          booking_date?: string
          booking_time?: string
          client_id?: string
          created_at?: string
          email?: string
          id?: string
          message?: string | null
          name?: string
          notion_page_id?: string | null
          phone?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_ai_chats: {
        Row: {
          client_id: string
          created_at: string
          id: string
          messages: Json
          name: string
          node_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          messages?: Json
          name?: string
          node_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          messages?: Json
          name?: string
          node_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_ai_chats_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_media: {
        Row: {
          audio_transcription: string | null
          client_id: string
          created_at: string
          file_name: string
          file_size_bytes: number
          file_type: string
          id: string
          mime_type: string
          node_id: string
          session_id: string
          storage_path: string
          transcription_status: string | null
          updated_at: string
          user_id: string
          visual_transcription: Json | null
        }
        Insert: {
          audio_transcription?: string | null
          client_id: string
          created_at?: string
          file_name: string
          file_size_bytes: number
          file_type: string
          id?: string
          mime_type: string
          node_id: string
          session_id: string
          storage_path: string
          transcription_status?: string | null
          updated_at?: string
          user_id: string
          visual_transcription?: Json | null
        }
        Update: {
          audio_transcription?: string | null
          client_id?: string
          created_at?: string
          file_name?: string
          file_size_bytes?: number
          file_type?: string
          id?: string
          mime_type?: string
          node_id?: string
          session_id?: string
          storage_path?: string
          transcription_status?: string | null
          updated_at?: string
          user_id?: string
          visual_transcription?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "canvas_media_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_media_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "canvas_states"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_states: {
        Row: {
          client_id: string
          draw_paths: Json
          edges: Json
          id: string
          is_active: boolean
          name: string
          nodes: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          draw_paths?: Json
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          draw_paths?: Json
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      client_email_settings: {
        Row: {
          client_id: string
          created_at: string
          from_name: string
          id: string
          smtp_email: string
          smtp_password: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          from_name?: string
          id?: string
          smtp_email: string
          smtp_password: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          from_name?: string
          id?: string
          smtp_email?: string
          smtp_password?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_email_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notion_mapping: {
        Row: {
          client_id: string
          created_at: string
          file_submission_property: string | null
          footage_property: string | null
          id: string
          notion_database_id: string
          notion_leads_database_id: string | null
          script_property: string | null
          title_property: string
        }
        Insert: {
          client_id: string
          created_at?: string
          file_submission_property?: string | null
          footage_property?: string | null
          id?: string
          notion_database_id: string
          notion_leads_database_id?: string | null
          script_property?: string | null
          title_property?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          file_submission_property?: string | null
          footage_property?: string | null
          id?: string
          notion_database_id?: string
          notion_leads_database_id?: string | null
          script_property?: string | null
          title_property?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notion_mapping_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding: {
        Row: {
          budget_amount: string | null
          client_id: string
          client_story: string | null
          created_at: string | null
          differentiators: string | null
          extra_notes: string | null
          id: string
          ideal_clients: string | null
          industry: string | null
          instagram_handle: string | null
          instagram_password: string | null
          social_handle: string | null
          state: string | null
          tiktok_handle: string | null
          tiktok_password: string | null
          unique_offer: string | null
          updated_at: string | null
          youtube_handle: string | null
          youtube_password: string | null
        }
        Insert: {
          budget_amount?: string | null
          client_id: string
          client_story?: string | null
          created_at?: string | null
          differentiators?: string | null
          extra_notes?: string | null
          id?: string
          ideal_clients?: string | null
          industry?: string | null
          instagram_handle?: string | null
          instagram_password?: string | null
          social_handle?: string | null
          state?: string | null
          tiktok_handle?: string | null
          tiktok_password?: string | null
          unique_offer?: string | null
          updated_at?: string | null
          youtube_handle?: string | null
          youtube_password?: string | null
        }
        Update: {
          budget_amount?: string | null
          client_id?: string
          client_story?: string | null
          created_at?: string | null
          differentiators?: string | null
          extra_notes?: string | null
          id?: string
          ideal_clients?: string | null
          industry?: string | null
          instagram_handle?: string | null
          instagram_password?: string | null
          social_handle?: string | null
          state?: string | null
          tiktok_handle?: string | null
          tiktok_password?: string | null
          unique_offer?: string | null
          updated_at?: string | null
          youtube_handle?: string | null
          youtube_password?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_strategies: {
        Row: {
          ads_active: boolean
          ads_budget: number
          ads_goal: string | null
          audience_analysis: Json | null
          audience_analyzed_at: string | null
          audience_score: number
          client_id: string
          content_pillars: Json
          created_at: string
          cta_goal: string
          id: string
          manychat_active: boolean
          manychat_keyword: string | null
          mix_convert: number
          mix_reach: number
          mix_trust: number
          monthly_revenue_actual: number
          monthly_revenue_goal: number
          posts_per_month: number
          primary_platform: string
          scripts_per_month: number
          stories_per_week: number
          uniqueness_score: number
          updated_at: string
          videos_edited_per_month: number
        }
        Insert: {
          ads_active?: boolean
          ads_budget?: number
          ads_goal?: string | null
          audience_analysis?: Json | null
          audience_analyzed_at?: string | null
          audience_score?: number
          client_id: string
          content_pillars?: Json
          created_at?: string
          cta_goal?: string
          id?: string
          manychat_active?: boolean
          manychat_keyword?: string | null
          mix_convert?: number
          mix_reach?: number
          mix_trust?: number
          monthly_revenue_actual?: number
          monthly_revenue_goal?: number
          posts_per_month?: number
          primary_platform?: string
          scripts_per_month?: number
          stories_per_week?: number
          uniqueness_score?: number
          updated_at?: string
          videos_edited_per_month?: number
        }
        Update: {
          ads_active?: boolean
          ads_budget?: number
          ads_goal?: string | null
          audience_analysis?: Json | null
          audience_analyzed_at?: string | null
          audience_score?: number
          client_id?: string
          content_pillars?: Json
          created_at?: string
          cta_goal?: string
          id?: string
          manychat_active?: boolean
          manychat_keyword?: string | null
          mix_convert?: number
          mix_reach?: number
          mix_trust?: number
          monthly_revenue_actual?: number
          monthly_revenue_goal?: number
          posts_per_month?: number
          primary_platform?: string
          scripts_per_month?: number
          stories_per_week?: number
          uniqueness_score?: number
          updated_at?: string
          videos_edited_per_month?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_strategies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_workflows: {
        Row: {
          client_id: string
          created_at: string | null
          description: string | null
          facebook_form_id: string | null
          facebook_page_id: string | null
          id: string
          is_active: boolean | null
          last_triggered_at: string | null
          name: string
          steps: Json
          trigger_config: Json | null
          trigger_type: string | null
          updated_at: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          description?: string | null
          facebook_form_id?: string | null
          facebook_page_id?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
          steps?: Json
          trigger_config?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          description?: string | null
          facebook_form_id?: string | null
          facebook_page_id?: string | null
          id?: string
          is_active?: boolean | null
          last_triggered_at?: string | null
          name?: string
          steps?: Json
          trigger_config?: Json | null
          trigger_type?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_workflows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          channel_scrapes_limit: number
          channel_scrapes_used: number
          created_at: string
          credits_balance: number
          credits_monthly_cap: number
          credits_reset_at: string | null
          credits_used: number
          email: string | null
          facebook_integration_enabled: boolean | null
          id: string
          lead_tracker_enabled: boolean | null
          name: string
          niche_keywords: string[] | null
          notion_lead_database_id: string | null
          notion_lead_name: string | null
          notion_leads_database_id: string | null
          onboarding_data: Json | null
          owner_user_id: string | null
          parent_subscriber_id: string | null
          pending_plan_effective_date: string | null
          pending_plan_type: string | null
          plan_type: string | null
          script_limit: number | null
          scripts_used: number | null
          stripe_customer_id: string | null
          subscription_status: string | null
          topup_credits_balance: number
          trial_ends_at: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          channel_scrapes_limit?: number
          channel_scrapes_used?: number
          created_at?: string
          credits_balance?: number
          credits_monthly_cap?: number
          credits_reset_at?: string | null
          credits_used?: number
          email?: string | null
          facebook_integration_enabled?: boolean | null
          id?: string
          lead_tracker_enabled?: boolean | null
          name: string
          niche_keywords?: string[] | null
          notion_lead_database_id?: string | null
          notion_lead_name?: string | null
          notion_leads_database_id?: string | null
          onboarding_data?: Json | null
          owner_user_id?: string | null
          parent_subscriber_id?: string | null
          pending_plan_effective_date?: string | null
          pending_plan_type?: string | null
          plan_type?: string | null
          script_limit?: number | null
          scripts_used?: number | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          topup_credits_balance?: number
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          channel_scrapes_limit?: number
          channel_scrapes_used?: number
          created_at?: string
          credits_balance?: number
          credits_monthly_cap?: number
          credits_reset_at?: string | null
          credits_used?: number
          email?: string | null
          facebook_integration_enabled?: boolean | null
          id?: string
          lead_tracker_enabled?: boolean | null
          name?: string
          niche_keywords?: string[] | null
          notion_lead_database_id?: string | null
          notion_lead_name?: string | null
          notion_leads_database_id?: string | null
          onboarding_data?: Json | null
          owner_user_id?: string | null
          parent_subscriber_id?: string | null
          pending_plan_effective_date?: string | null
          pending_plan_type?: string | null
          plan_type?: string | null
          script_limit?: number | null
          scripts_used?: number | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          topup_credits_balance?: number
          trial_ends_at?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      companion_messages: {
        Row: {
          client_id: string
          content: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "companion_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      companion_state: {
        Row: {
          client_id: string
          companion_name: string
          companion_setup_done: boolean
          created_at: string
          id: string
          updated_at: string
          workflow_context: Json
        }
        Insert: {
          client_id: string
          companion_name?: string
          companion_setup_done?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          workflow_context?: Json
        }
        Update: {
          client_id?: string
          companion_name?: string
          companion_setup_done?: boolean
          created_at?: string
          id?: string
          updated_at?: string
          workflow_context?: Json
        }
        Relationships: [
          {
            foreignKeyName: "companion_state_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      connecta_leads: {
        Row: {
          business_type: string | null
          city: string | null
          created_at: string
          email: string
          id: string
          investment_ready: string | null
          name: string
          niche: string | null
          phone: string
          revenue_range: string | null
          state: string | null
          status: string
        }
        Insert: {
          business_type?: string | null
          city?: string | null
          created_at?: string
          email: string
          id?: string
          investment_ready?: string | null
          name: string
          niche?: string | null
          phone: string
          revenue_range?: string | null
          state?: string | null
          status?: string
        }
        Update: {
          business_type?: string | null
          city?: string | null
          created_at?: string
          email?: string
          id?: string
          investment_ready?: string | null
          name?: string
          niche?: string | null
          phone?: string
          revenue_range?: string | null
          state?: string | null
          status?: string
        }
        Relationships: []
      }
      content_calendar: {
        Row: {
          caption: string | null
          client_id: string
          created_at: string
          file_submission_url: string | null
          id: string
          notion_page_id: string
          post_status: string
          revision_notes: string | null
          scheduled_date: string
          script_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          client_id: string
          created_at?: string
          file_submission_url?: string | null
          id?: string
          notion_page_id: string
          post_status?: string
          revision_notes?: string | null
          scheduled_date: string
          script_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          client_id?: string
          created_at?: string
          file_submission_url?: string | null
          id?: string
          notion_page_id?: string
          post_status?: string
          revision_notes?: string | null
          scheduled_date?: string
          script_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_calendar_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          created_at: string | null
          created_by: string
          id: string
          name: string
          storage_path: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          id?: string
          name: string
          storage_path: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          id?: string
          name?: string
          storage_path?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          admin_signature_font: string | null
          admin_signature_name: string | null
          admin_signed_at: string | null
          client_email: string | null
          client_id: string
          client_signature_font: string | null
          client_signature_name: string | null
          client_signed_at: string | null
          created_at: string | null
          created_by: string
          current_storage_path: string | null
          id: string
          original_storage_path: string
          send_message: string | null
          send_method: string | null
          signing_token: string | null
          signing_token_expires_at: string | null
          status: string
          template_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          admin_signature_font?: string | null
          admin_signature_name?: string | null
          admin_signed_at?: string | null
          client_email?: string | null
          client_id: string
          client_signature_font?: string | null
          client_signature_name?: string | null
          client_signed_at?: string | null
          created_at?: string | null
          created_by: string
          current_storage_path?: string | null
          id?: string
          original_storage_path: string
          send_message?: string | null
          send_method?: string | null
          signing_token?: string | null
          signing_token_expires_at?: string | null
          status?: string
          template_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          admin_signature_font?: string | null
          admin_signature_name?: string | null
          admin_signed_at?: string | null
          client_email?: string | null
          client_id?: string
          client_signature_font?: string | null
          client_signature_name?: string | null
          client_signed_at?: string | null
          created_at?: string | null
          created_by?: string
          current_storage_path?: string | null
          id?: string
          original_storage_path?: string
          send_message?: string | null
          send_method?: string | null
          signing_token?: string | null
          signing_token_expires_at?: string | null
          status?: string
          template_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          action: string
          balance_after: number
          client_id: string
          created_at: string | null
          credits: number
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          balance_after: number
          client_id: string
          created_at?: string | null
          credits: number
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          balance_after?: number
          client_id?: string
          created_at?: string | null
          credits?: number
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_transactions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_lead_forms: {
        Row: {
          client_id: string
          fetched_at: string | null
          form_id: string
          form_name: string
          id: string
          page_id: string
          status: string | null
        }
        Insert: {
          client_id: string
          fetched_at?: string | null
          form_id: string
          form_name: string
          id?: string
          page_id: string
          status?: string | null
        }
        Update: {
          client_id?: string
          fetched_at?: string | null
          form_id?: string
          form_name?: string
          id?: string
          page_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_lead_forms_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      facebook_pages: {
        Row: {
          client_id: string
          connected_by: string | null
          created_at: string | null
          id: string
          is_subscribed: boolean | null
          page_access_token: string
          page_id: string
          page_name: string
          updated_at: string | null
        }
        Insert: {
          client_id: string
          connected_by?: string | null
          created_at?: string | null
          id?: string
          is_subscribed?: boolean | null
          page_access_token: string
          page_id: string
          page_name: string
          updated_at?: string | null
        }
        Update: {
          client_id?: string
          connected_by?: string | null
          created_at?: string | null
          id?: string
          is_subscribed?: boolean | null
          page_access_token?: string
          page_id?: string
          page_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "facebook_pages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_month_settings: {
        Row: {
          created_at: string
          employee_salary: number
          id: string
          month: string
          salary_payout: number
          tax_rate: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          employee_salary?: number
          id?: string
          month: string
          salary_payout?: number
          tax_rate?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          employee_salary?: number
          id?: string
          month?: string
          salary_payout?: number
          tax_rate?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      finance_recurring_subscriptions: {
        Row: {
          amount: number
          category: string
          client: string | null
          created_at: string
          day_of_month: number
          deductible_ratio: number | null
          description: string | null
          end_month: string | null
          id: string
          interval: string
          last_generated_month: string | null
          payment_method: string | null
          start_month: string
          type: string
          updated_at: string
          user_id: string
          vendor: string | null
        }
        Insert: {
          amount: number
          category: string
          client?: string | null
          created_at?: string
          day_of_month?: number
          deductible_ratio?: number | null
          description?: string | null
          end_month?: string | null
          id?: string
          interval: string
          last_generated_month?: string | null
          payment_method?: string | null
          start_month: string
          type: string
          updated_at?: string
          user_id: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string
          client?: string | null
          created_at?: string
          day_of_month?: number
          deductible_ratio?: number | null
          description?: string | null
          end_month?: string | null
          id?: string
          interval?: string
          last_generated_month?: string | null
          payment_method?: string | null
          start_month?: string
          type?: string
          updated_at?: string
          user_id?: string
          vendor?: string | null
        }
        Relationships: []
      }
      finance_transactions: {
        Row: {
          amount: number
          attachment_url: string | null
          category: string
          client: string | null
          created_at: string
          date: string
          deductible_amount: number | null
          deleted_at: string | null
          description: string | null
          id: string
          is_ar: boolean
          payment_method: string | null
          raw_input: string | null
          recurring_subscription_id: string | null
          type: string
          updated_at: string
          user_id: string
          vendor: string | null
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          category: string
          client?: string | null
          created_at?: string
          date?: string
          deductible_amount?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_ar?: boolean
          payment_method?: string | null
          raw_input?: string | null
          recurring_subscription_id?: string | null
          type: string
          updated_at?: string
          user_id: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          category?: string
          client?: string | null
          created_at?: string
          date?: string
          deductible_amount?: number | null
          deleted_at?: string | null
          description?: string | null
          id?: string
          is_ar?: boolean
          payment_method?: string | null
          raw_input?: string | null
          recurring_subscription_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_transactions_recurring_subscription_id_fkey"
            columns: ["recurring_subscription_id"]
            isOneToOne: false
            referencedRelation: "finance_recurring_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_scheduled_runs: {
        Row: {
          context: Json
          created_at: string
          id: string
          lead_id: string
          resume_at: string
          resume_node_id: string
          workflow_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          lead_id: string
          resume_at: string
          resume_node_id: string
          workflow_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          lead_id?: string
          resume_at?: string
          resume_node_id?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followup_scheduled_runs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followup_scheduled_runs_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "followup_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      followup_workflows: {
        Row: {
          client_id: string
          created_at: string
          edges: Json
          id: string
          is_active: boolean
          name: string
          nodes: Json
          updated_at: string
          viewport: Json
        }
        Insert: {
          client_id: string
          created_at?: string
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          updated_at?: string
          viewport?: Json
        }
        Update: {
          client_id?: string
          created_at?: string
          edges?: Json
          id?: string
          is_active?: boolean
          name?: string
          nodes?: Json
          updated_at?: string
          viewport?: Json
        }
        Relationships: [
          {
            foreignKeyName: "followup_workflows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      funnel_pages: {
        Row: {
          benefits: Json
          booking_cta_text: string | null
          booking_cta_url: string | null
          booking_type: string
          client_id: string
          created_at: string | null
          cta_headline: string | null
          cta_subtext: string | null
          headline: string | null
          id: string
          is_published: boolean
          primary_color: string
          show_booking: boolean
          slug: string
          subheadline: string | null
          updated_at: string | null
          urgency_text: string | null
          video_headline: string | null
          video_url: string | null
        }
        Insert: {
          benefits?: Json
          booking_cta_text?: string | null
          booking_cta_url?: string | null
          booking_type?: string
          client_id: string
          created_at?: string | null
          cta_headline?: string | null
          cta_subtext?: string | null
          headline?: string | null
          id?: string
          is_published?: boolean
          primary_color?: string
          show_booking?: boolean
          slug: string
          subheadline?: string | null
          updated_at?: string | null
          urgency_text?: string | null
          video_headline?: string | null
          video_url?: string | null
        }
        Update: {
          benefits?: Json
          booking_cta_text?: string | null
          booking_cta_url?: string | null
          booking_type?: string
          client_id?: string
          created_at?: string | null
          cta_headline?: string | null
          cta_subtext?: string | null
          headline?: string | null
          id?: string
          is_published?: boolean
          primary_color?: string
          show_booking?: boolean
          slug?: string
          subheadline?: string | null
          updated_at?: string | null
          urgency_text?: string | null
          video_headline?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funnel_pages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      hook_usage: {
        Row: {
          client_id: string
          hook_id: string
          id: string
          topic: string
          used_at: string | null
        }
        Insert: {
          client_id: string
          hook_id: string
          id?: string
          topic: string
          used_at?: string | null
        }
        Update: {
          client_id?: string
          hook_id?: string
          id?: string
          topic?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hook_usage_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pages: {
        Row: {
          about_description: string | null
          about_photo_1_url: string | null
          about_photo_2_url: string | null
          about_section_title: string | null
          about_title: string | null
          about_us_text: string | null
          booking_cta_text: string | null
          booking_cta_url: string | null
          booking_type: string
          client_id: string
          clinic_photo_url: string | null
          contact_address: string | null
          contact_email: string | null
          contact_hours: string | null
          contact_phone: string | null
          created_at: string | null
          cta_button_text: string
          custom_domain: string | null
          favicon_url: string | null
          fb_pixel_id: string | null
          font_family: string
          gallery_images: Json | null
          hero_headline: string | null
          hero_image_url: string | null
          hero_price_now: string | null
          hero_price_was: string | null
          hero_subheadline: string | null
          id: string
          is_published: boolean
          language: string | null
          logo_max_width: number | null
          logo_url: string | null
          map_embed_url: string | null
          og_image_url: string | null
          primary_color: string
          secondary_color: string
          seo_description: string | null
          seo_title: string | null
          services: Json
          show_booking: boolean
          show_sticky_cta: boolean
          slug: string
          ssl_provisioned_at: string | null
          testimonials: Json
          trust_stat_1_label: string | null
          trust_stat_1_number: string | null
          trust_stat_2_label: string | null
          trust_stat_2_number: string | null
          trust_stat_3_label: string | null
          trust_stat_3_number: string | null
          updated_at: string | null
          vimeo_embed_url: string | null
        }
        Insert: {
          about_description?: string | null
          about_photo_1_url?: string | null
          about_photo_2_url?: string | null
          about_section_title?: string | null
          about_title?: string | null
          about_us_text?: string | null
          booking_cta_text?: string | null
          booking_cta_url?: string | null
          booking_type?: string
          client_id: string
          clinic_photo_url?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_hours?: string | null
          contact_phone?: string | null
          created_at?: string | null
          cta_button_text?: string
          custom_domain?: string | null
          favicon_url?: string | null
          fb_pixel_id?: string | null
          font_family?: string
          gallery_images?: Json | null
          hero_headline?: string | null
          hero_image_url?: string | null
          hero_price_now?: string | null
          hero_price_was?: string | null
          hero_subheadline?: string | null
          id?: string
          is_published?: boolean
          language?: string | null
          logo_max_width?: number | null
          logo_url?: string | null
          map_embed_url?: string | null
          og_image_url?: string | null
          primary_color?: string
          secondary_color?: string
          seo_description?: string | null
          seo_title?: string | null
          services?: Json
          show_booking?: boolean
          show_sticky_cta?: boolean
          slug: string
          ssl_provisioned_at?: string | null
          testimonials?: Json
          trust_stat_1_label?: string | null
          trust_stat_1_number?: string | null
          trust_stat_2_label?: string | null
          trust_stat_2_number?: string | null
          trust_stat_3_label?: string | null
          trust_stat_3_number?: string | null
          updated_at?: string | null
          vimeo_embed_url?: string | null
        }
        Update: {
          about_description?: string | null
          about_photo_1_url?: string | null
          about_photo_2_url?: string | null
          about_section_title?: string | null
          about_title?: string | null
          about_us_text?: string | null
          booking_cta_text?: string | null
          booking_cta_url?: string | null
          booking_type?: string
          client_id?: string
          clinic_photo_url?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_hours?: string | null
          contact_phone?: string | null
          created_at?: string | null
          cta_button_text?: string
          custom_domain?: string | null
          favicon_url?: string | null
          fb_pixel_id?: string | null
          font_family?: string
          gallery_images?: Json | null
          hero_headline?: string | null
          hero_image_url?: string | null
          hero_price_now?: string | null
          hero_price_was?: string | null
          hero_subheadline?: string | null
          id?: string
          is_published?: boolean
          language?: string | null
          logo_max_width?: number | null
          logo_url?: string | null
          map_embed_url?: string | null
          og_image_url?: string | null
          primary_color?: string
          secondary_color?: string
          seo_description?: string | null
          seo_title?: string | null
          services?: Json
          show_booking?: boolean
          show_sticky_cta?: boolean
          slug?: string
          ssl_provisioned_at?: string | null
          testimonials?: Json
          trust_stat_1_label?: string | null
          trust_stat_1_number?: string | null
          trust_stat_2_label?: string | null
          trust_stat_2_number?: string | null
          trust_stat_3_label?: string | null
          trust_stat_3_number?: string | null
          updated_at?: string | null
          vimeo_embed_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "landing_pages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          appointment_date: string | null
          booked: boolean | null
          booking_date: string | null
          booking_time: string | null
          client_id: string
          created_at: string | null
          email: string | null
          facebook_form_id: string | null
          facebook_lead_id: string | null
          follow_up_step: string | null
          id: string
          last_contacted_at: string | null
          name: string
          next_follow_up_at: string | null
          notes: string | null
          phone: string | null
          replied: boolean | null
          source: string | null
          status: string | null
          stopped: boolean | null
          updated_at: string | null
        }
        Insert: {
          appointment_date?: string | null
          booked?: boolean | null
          booking_date?: string | null
          booking_time?: string | null
          client_id: string
          created_at?: string | null
          email?: string | null
          facebook_form_id?: string | null
          facebook_lead_id?: string | null
          follow_up_step?: string | null
          id?: string
          last_contacted_at?: string | null
          name: string
          next_follow_up_at?: string | null
          notes?: string | null
          phone?: string | null
          replied?: boolean | null
          source?: string | null
          status?: string | null
          stopped?: boolean | null
          updated_at?: string | null
        }
        Update: {
          appointment_date?: string | null
          booked?: boolean | null
          booking_date?: string | null
          booking_time?: string | null
          client_id?: string
          created_at?: string | null
          email?: string | null
          facebook_form_id?: string | null
          facebook_lead_id?: string | null
          follow_up_step?: string | null
          id?: string
          last_contacted_at?: string | null
          name?: string
          next_follow_up_at?: string | null
          notes?: string | null
          phone?: string | null
          replied?: boolean | null
          source?: string | null
          status?: string | null
          stopped?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          channel: string
          created_at: string | null
          direction: string
          id: string
          lead_id: string
          sent_at: string | null
          subject: string | null
        }
        Insert: {
          body: string
          channel: string
          created_at?: string | null
          direction: string
          id?: string
          lead_id: string
          sent_at?: string | null
          subject?: string | null
        }
        Update: {
          body?: string
          channel?: string
          created_at?: string | null
          direction?: string
          id?: string
          lead_id?: string
          sent_at?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notion_script_sync: {
        Row: {
          created_at: string
          id: string
          notion_database_id: string
          notion_page_id: string
          script_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notion_database_id: string
          notion_page_id: string
          script_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notion_database_id?: string
          notion_page_id?: string
          script_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notion_script_sync_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: true
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      revision_comments: {
        Row: {
          author_id: string | null
          author_name: string
          author_role: string
          comment: string
          created_at: string | null
          id: string
          internal_only: boolean
          resolved: boolean | null
          source_ref: string | null
          timestamp_seconds: number | null
          video_edit_id: string | null
        }
        Insert: {
          author_id?: string | null
          author_name: string
          author_role?: string
          comment: string
          created_at?: string | null
          id?: string
          internal_only?: boolean
          resolved?: boolean | null
          source_ref?: string | null
          timestamp_seconds?: number | null
          video_edit_id?: string | null
        }
        Update: {
          author_id?: string | null
          author_name?: string
          author_role?: string
          comment?: string
          created_at?: string | null
          id?: string
          internal_only?: boolean
          resolved?: boolean | null
          source_ref?: string | null
          timestamp_seconds?: number | null
          video_edit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revision_comments_video_edit_id_fkey"
            columns: ["video_edit_id"]
            isOneToOne: false
            referencedRelation: "video_edits"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_posts: {
        Row: {
          caption: string | null
          client_id: string
          created_at: string
          error_message: string | null
          id: string
          platforms: string[]
          published_at: string | null
          scheduled_time: string | null
          status: string
          thumbnail_url: string | null
          user_id: string
          video_url: string | null
        }
        Insert: {
          caption?: string | null
          client_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          platforms?: string[]
          published_at?: string | null
          scheduled_time?: string | null
          status?: string
          thumbnail_url?: string | null
          user_id: string
          video_url?: string | null
        }
        Update: {
          caption?: string | null
          client_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          platforms?: string[]
          published_at?: string | null
          scheduled_time?: string | null
          status?: string
          thumbnail_url?: string | null
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      script_folder_shares: {
        Row: {
          created_at: string
          created_by: string
          folder_id: string
          id: string
          permission: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          created_at?: string
          created_by: string
          folder_id: string
          id?: string
          permission?: string
          revoked_at?: string | null
          token: string
        }
        Update: {
          created_at?: string
          created_by?: string
          folder_id?: string
          id?: string
          permission?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_folder_shares_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "script_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      script_folders: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
          parent_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "script_folders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "script_folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "script_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      script_lines: {
        Row: {
          created_at: string
          id: string
          line_number: number
          line_type: string
          rich_text: string | null
          script_id: string
          section: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_number: number
          line_type: string
          rich_text?: string | null
          script_id: string
          section?: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          line_number?: number
          line_type?: string
          rich_text?: string | null
          script_id?: string
          section?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "script_lines_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      script_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lines_snapshot: Json | null
          raw_content: string
          script_id: string
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lines_snapshot?: Json | null
          raw_content: string
          script_id: string
          version_number: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lines_snapshot?: Json | null
          raw_content?: string
          script_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "script_versions_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      scripts: {
        Row: {
          canvas_user_id: string | null
          caption: string | null
          client_id: string
          created_at: string
          deleted_at: string | null
          folder_id: string | null
          formato: string | null
          google_drive_link: string | null
          grabado: boolean
          id: string
          idea_ganadora: string | null
          inspiration_url: string | null
          raw_content: string
          review_status: string | null
          revision_notes: string | null
          status: string | null
          target: string | null
          title: string
          updated_at: string
        }
        Insert: {
          canvas_user_id?: string | null
          caption?: string | null
          client_id: string
          created_at?: string
          deleted_at?: string | null
          folder_id?: string | null
          formato?: string | null
          google_drive_link?: string | null
          grabado?: boolean
          id?: string
          idea_ganadora?: string | null
          inspiration_url?: string | null
          raw_content: string
          review_status?: string | null
          revision_notes?: string | null
          status?: string | null
          target?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          canvas_user_id?: string | null
          caption?: string | null
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          folder_id?: string | null
          formato?: string | null
          google_drive_link?: string | null
          grabado?: boolean
          id?: string
          idea_ganadora?: string | null
          inspiration_url?: string | null
          raw_content?: string
          review_status?: string | null
          revision_notes?: string | null
          status?: string | null
          target?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scripts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scripts_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "script_folders"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token: string | null
          account_name: string | null
          client_id: string
          created_at: string
          expires_at: string | null
          id: string
          platform: string
          refresh_token: string | null
          user_id: string
        }
        Insert: {
          access_token?: string | null
          account_name?: string | null
          client_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          platform: string
          refresh_token?: string | null
          user_id: string
        }
        Update: {
          access_token?: string | null
          account_name?: string | null
          client_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          platform?: string
          refresh_token?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriber_clients: {
        Row: {
          client_id: string
          created_at: string
          id: string
          is_primary: boolean
          subscriber_user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          is_primary?: boolean
          subscriber_user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          is_primary?: boolean
          subscriber_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriber_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          client_limit: number
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_manually_assigned: boolean | null
          notes: string | null
          plan_type: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscribed_at: string | null
          trial_ends_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          client_limit?: number
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_manually_assigned?: boolean | null
          notes?: string | null
          plan_type: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscribed_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          client_limit?: number
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_manually_assigned?: boolean | null
          notes?: string | null
          plan_type?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscribed_at?: string | null
          trial_ends_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      trainings: {
        Row: {
          assigned_to_user_id: string | null
          category: string | null
          content: string | null
          created_at: string | null
          created_by: string | null
          id: string
          is_published: boolean | null
          title: string
          updated_at: string | null
          visibility: string
        }
        Insert: {
          assigned_to_user_id?: string | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_published?: boolean | null
          title: string
          updated_at?: string | null
          visibility?: string
        }
        Update: {
          assigned_to_user_id?: string | null
          category?: string | null
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_published?: boolean | null
          title?: string
          updated_at?: string | null
          visibility?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vault_templates: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
          source_url: string | null
          structure_analysis: Json | null
          template_lines: Json | null
          thumbnail_url: string | null
          transcription: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          name?: string
          source_url?: string | null
          structure_analysis?: Json | null
          template_lines?: Json | null
          thumbnail_url?: string | null
          transcription?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          source_url?: string | null
          structure_analysis?: Json | null
          template_lines?: Json | null
          thumbnail_url?: string | null
          transcription?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vault_templates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      video_edits: {
        Row: {
          assignee: string | null
          assignee_user_id: string | null
          caption: string | null
          client_id: string
          created_at: string | null
          deadline: string | null
          deleted_at: string | null
          file_expires_at: string | null
          file_size_bytes: number | null
          file_submission: string | null
          file_url: string
          footage: string | null
          id: string
          post_status: string | null
          record_expires_at: string | null
          reel_title: string | null
          revisions: string | null
          schedule_date: string | null
          script_id: string | null
          script_url: string | null
          status: string | null
          storage_path: string | null
          storage_url: string | null
          updated_at: string | null
          upload_source: string | null
        }
        Insert: {
          assignee?: string | null
          assignee_user_id?: string | null
          caption?: string | null
          client_id: string
          created_at?: string | null
          deadline?: string | null
          deleted_at?: string | null
          file_expires_at?: string | null
          file_size_bytes?: number | null
          file_submission?: string | null
          file_url: string
          footage?: string | null
          id?: string
          post_status?: string | null
          record_expires_at?: string | null
          reel_title?: string | null
          revisions?: string | null
          schedule_date?: string | null
          script_id?: string | null
          script_url?: string | null
          status?: string | null
          storage_path?: string | null
          storage_url?: string | null
          updated_at?: string | null
          upload_source?: string | null
        }
        Update: {
          assignee?: string | null
          assignee_user_id?: string | null
          caption?: string | null
          client_id?: string
          created_at?: string | null
          deadline?: string | null
          deleted_at?: string | null
          file_expires_at?: string | null
          file_size_bytes?: number | null
          file_submission?: string | null
          file_url?: string
          footage?: string | null
          id?: string
          post_status?: string | null
          record_expires_at?: string | null
          reel_title?: string | null
          revisions?: string | null
          schedule_date?: string | null
          script_id?: string | null
          script_url?: string | null
          status?: string | null
          storage_path?: string | null
          storage_url?: string | null
          updated_at?: string | null
          upload_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_edits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_edits_script_id_fkey"
            columns: ["script_id"]
            isOneToOne: false
            referencedRelation: "scripts"
            referencedColumns: ["id"]
          },
        ]
      }
      videographer_clients: {
        Row: {
          assigned_at: string
          client_id: string
          id: string
          videographer_user_id: string
        }
        Insert: {
          assigned_at?: string
          client_id: string
          id?: string
          videographer_user_id: string
        }
        Update: {
          assigned_at?: string
          client_id?: string
          id?: string
          videographer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "videographer_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      videographer_tasks: {
        Row: {
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          title: string
          updated_at: string
          videographer_user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          title: string
          updated_at?: string
          videographer_user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          title?: string
          updated_at?: string
          videographer_user_id?: string
        }
        Relationships: []
      }
      viral_channels: {
        Row: {
          apify_dataset_id: string | null
          apify_run_id: string | null
          avatar_url: string | null
          avg_views: number | null
          created_at: string | null
          created_by: string | null
          display_name: string | null
          follower_count: number | null
          id: string
          last_scraped_at: string | null
          platform: string | null
          scrape_error: string | null
          scrape_status: string | null
          username: string
          video_count: number | null
        }
        Insert: {
          apify_dataset_id?: string | null
          apify_run_id?: string | null
          avatar_url?: string | null
          avg_views?: number | null
          created_at?: string | null
          created_by?: string | null
          display_name?: string | null
          follower_count?: number | null
          id?: string
          last_scraped_at?: string | null
          platform?: string | null
          scrape_error?: string | null
          scrape_status?: string | null
          username: string
          video_count?: number | null
        }
        Update: {
          apify_dataset_id?: string | null
          apify_run_id?: string | null
          avatar_url?: string | null
          avg_views?: number | null
          created_at?: string | null
          created_by?: string | null
          display_name?: string | null
          follower_count?: number | null
          id?: string
          last_scraped_at?: string | null
          platform?: string | null
          scrape_error?: string | null
          scrape_status?: string | null
          username?: string
          video_count?: number | null
        }
        Relationships: []
      }
      viral_items: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          instagram_url: string
          thumbnail_url: string | null
          title: string
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          instagram_url: string
          thumbnail_url?: string | null
          title: string
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          instagram_url?: string
          thumbnail_url?: string | null
          title?: string
        }
        Relationships: []
      }
      viral_video_interactions: {
        Row: {
          clicked: boolean | null
          first_seen_at: string | null
          id: string
          last_seen_at: string | null
          seen_count: number | null
          starred: boolean | null
          user_id: string
          video_id: string
        }
        Insert: {
          clicked?: boolean | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          seen_count?: number | null
          starred?: boolean | null
          user_id: string
          video_id: string
        }
        Update: {
          clicked?: boolean | null
          first_seen_at?: string | null
          id?: string
          last_seen_at?: string | null
          seen_count?: number | null
          starred?: boolean | null
          user_id?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viral_video_interactions_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "viral_videos"
            referencedColumns: ["id"]
          },
        ]
      }
      viral_videos: {
        Row: {
          apify_video_id: string | null
          caption: string | null
          channel_id: string | null
          channel_username: string
          comments_count: number | null
          engagement_rate: number | null
          format_detection: Json | null
          hashtag_source: string | null
          id: string
          likes_count: number | null
          outlier_score: number | null
          platform: string | null
          posted_at: string | null
          scraped_at: string | null
          thumbnail_url: string | null
          video_url: string | null
          views_count: number | null
        }
        Insert: {
          apify_video_id?: string | null
          caption?: string | null
          channel_id?: string | null
          channel_username: string
          comments_count?: number | null
          engagement_rate?: number | null
          format_detection?: Json | null
          hashtag_source?: string | null
          id?: string
          likes_count?: number | null
          outlier_score?: number | null
          platform?: string | null
          posted_at?: string | null
          scraped_at?: string | null
          thumbnail_url?: string | null
          video_url?: string | null
          views_count?: number | null
        }
        Update: {
          apify_video_id?: string | null
          caption?: string | null
          channel_id?: string | null
          channel_username?: string
          comments_count?: number | null
          engagement_rate?: number | null
          format_detection?: Json | null
          hashtag_source?: string | null
          id?: string
          likes_count?: number | null
          outlier_score?: number | null
          platform?: string | null
          posted_at?: string | null
          scraped_at?: string | null
          thumbnail_url?: string | null
          video_url?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "viral_videos_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "viral_channels"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_executions: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          id: string
          started_at: string | null
          status: string
          steps_executed: Json
          trigger_data: Json
          workflow_id: string | null
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string
          steps_executed?: Json
          trigger_data?: Json
          workflow_id?: string | null
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          started_at?: string | null
          status?: string
          steps_executed?: Json
          trigger_data?: Json
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workflow_executions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_executions_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "client_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      zoho_connections: {
        Row: {
          access_token: string
          api_domain: string
          client_id: string
          connected_by: string | null
          created_at: string
          email_address: string
          id: string
          is_active: boolean
          refresh_token: string
          token_expires_at: string
          updated_at: string
          zoho_account_id: string
        }
        Insert: {
          access_token: string
          api_domain?: string
          client_id: string
          connected_by?: string | null
          created_at?: string
          email_address: string
          id?: string
          is_active?: boolean
          refresh_token: string
          token_expires_at: string
          updated_at?: string
          zoho_account_id: string
        }
        Update: {
          access_token?: string
          api_domain?: string
          client_id?: string
          connected_by?: string | null
          created_at?: string
          email_address?: string
          id?: string
          is_active?: boolean
          refresh_token?: string
          token_expires_at?: string
          updated_at?: string
          zoho_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoho_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_topup_credits: {
        Args: { p_amount: number; p_client_id: string; p_session_id: string }
        Returns: Json
      }
      create_client_for_subscriber: {
        Args: { _email?: string; _name: string }
        Returns: string
      }
      deduct_credits: {
        Args: {
          p_action: string
          p_client_id: string
          p_cost: number
          p_metadata?: Json
        }
        Returns: Json
      }
      deduct_credits_atomic: {
        Args: { p_action: string; p_client_id: string; p_cost: number }
        Returns: Json
      }
      finance_generate_recurring: {
        Args: { p_month: string; p_user_id: string }
        Returns: number
      }
      get_primary_client_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_client: { Args: { _client_id: string }; Returns: boolean }
      is_own_client: { Args: { _client_id: string }; Returns: boolean }
      is_owned_client: { Args: { _client_id: string }; Returns: boolean }
      is_primary_client: { Args: { _client_id: string }; Returns: boolean }
      is_subscriber_client: { Args: { _client_id: string }; Returns: boolean }
      is_user: { Args: never; Returns: boolean }
      is_videographer: { Args: never; Returns: boolean }
      upsert_video_seen: {
        Args: { p_user_id: string; p_video_ids: string[] }
        Returns: undefined
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "client"
        | "videographer"
        | "user"
        | "editor"
        | "connecta_plus"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "admin",
        "client",
        "videographer",
        "user",
        "editor",
        "connecta_plus",
      ],
    },
  },
} as const

