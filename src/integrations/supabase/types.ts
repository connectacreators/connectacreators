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
      booking_settings: {
        Row: {
          available_days: number[]
          booking_description: string | null
          booking_title: string
          break_times: Json
          client_id: string
          created_at: string
          end_hour: number
          id: string
          is_active: boolean
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
          end_hour?: number
          id?: string
          is_active?: boolean
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
          end_hour?: number
          id?: string
          is_active?: boolean
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
      client_notion_mapping: {
        Row: {
          client_id: string
          created_at: string
          footage_property: string | null
          id: string
          notion_database_id: string
          script_property: string | null
          title_property: string
        }
        Insert: {
          client_id: string
          created_at?: string
          footage_property?: string | null
          id?: string
          notion_database_id: string
          script_property?: string | null
          title_property?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          footage_property?: string | null
          id?: string
          notion_database_id?: string
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
      clients: {
        Row: {
          created_at: string
          email: string | null
          facebook_integration_enabled: boolean | null
          id: string
          lead_tracker_enabled: boolean | null
          name: string
          notion_lead_database_id: string | null
          notion_lead_name: string | null
          plan_type: string | null
          script_limit: number | null
          scripts_used: number | null
          stripe_customer_id: string | null
          subscription_status: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          facebook_integration_enabled?: boolean | null
          id?: string
          lead_tracker_enabled?: boolean | null
          name: string
          notion_lead_database_id?: string | null
          notion_lead_name?: string | null
          plan_type?: string | null
          script_limit?: number | null
          scripts_used?: number | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          facebook_integration_enabled?: boolean | null
          id?: string
          lead_tracker_enabled?: boolean | null
          name?: string
          notion_lead_database_id?: string | null
          notion_lead_name?: string | null
          plan_type?: string | null
          script_limit?: number | null
          scripts_used?: number | null
          stripe_customer_id?: string | null
          subscription_status?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
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
      script_lines: {
        Row: {
          created_at: string
          id: string
          line_number: number
          line_type: string
          script_id: string
          section: string
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          line_number: number
          line_type: string
          script_id: string
          section?: string
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          line_number?: number
          line_type?: string
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
      scripts: {
        Row: {
          client_id: string
          created_at: string
          deleted_at: string | null
          formato: string | null
          google_drive_link: string | null
          grabado: boolean
          id: string
          idea_ganadora: string | null
          inspiration_url: string | null
          raw_content: string
          target: string | null
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          deleted_at?: string | null
          formato?: string | null
          google_drive_link?: string | null
          grabado?: boolean
          id?: string
          idea_ganadora?: string | null
          inspiration_url?: string | null
          raw_content: string
          target?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          formato?: string | null
          google_drive_link?: string | null
          grabado?: boolean
          id?: string
          idea_ganadora?: string | null
          inspiration_url?: string | null
          raw_content?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      is_videographer: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "client" | "videographer"
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
      app_role: ["admin", "client", "videographer"],
    },
  },
} as const
