// Generado por scripts/gen-types-local.mjs a partir de supabase/migrations. No editar a mano.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          account_number: string
          account_type: string
          annual_revenue: number | null
          billing_city: string | null
          billing_country: string | null
          billing_state: string | null
          billing_street: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          description: string | null
          email: string | null
          employees: number | null
          id: string
          industry: string | null
          is_demo: boolean
          name: string
          owner_id: string | null
          parent_account_id: string | null
          phone: string | null
          rating: string | null
          segment: string | null
          shipping_city: string | null
          shipping_country: string | null
          shipping_state: string | null
          shipping_street: string | null
          tax_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          account_number?: string
          account_type?: string
          annual_revenue?: number | null
          billing_city?: string | null
          billing_country?: string | null
          billing_state?: string | null
          billing_street?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          email?: string | null
          employees?: number | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          name: string
          owner_id?: string | null
          parent_account_id?: string | null
          phone?: string | null
          rating?: string | null
          segment?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          account_number?: string
          account_type?: string
          annual_revenue?: number | null
          billing_city?: string | null
          billing_country?: string | null
          billing_state?: string | null
          billing_street?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          email?: string | null
          employees?: number | null
          id?: string
          industry?: string | null
          is_demo?: boolean
          name?: string
          owner_id?: string | null
          parent_account_id?: string | null
          phone?: string | null
          rating?: string | null
          segment?: string | null
          shipping_city?: string | null
          shipping_country?: string | null
          shipping_state?: string | null
          shipping_street?: string | null
          tax_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_account_id_fkey"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          account_id: string | null
          activity_type: string
          call_result: string | null
          case_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          description: string | null
          due_date: string | null
          duration_minutes: number | null
          email_cc: string | null
          email_delivery: string | null
          email_provider_id: string | null
          email_to: string | null
          end_at: string | null
          id: string
          is_demo: boolean
          lead_id: string | null
          location: string | null
          opportunity_id: string | null
          owner_id: string | null
          priority: string
          start_at: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          activity_type: string
          call_result?: string | null
          case_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          email_cc?: string | null
          email_delivery?: string | null
          email_provider_id?: string | null
          email_to?: string | null
          end_at?: string | null
          id?: string
          is_demo?: boolean
          lead_id?: string | null
          location?: string | null
          opportunity_id?: string | null
          owner_id?: string | null
          priority?: string
          start_at?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          activity_type?: string
          call_result?: string | null
          case_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          due_date?: string | null
          duration_minutes?: number | null
          email_cc?: string | null
          email_delivery?: string | null
          email_provider_id?: string | null
          email_to?: string | null
          end_at?: string | null
          id?: string
          is_demo?: boolean
          lead_id?: string | null
          location?: string | null
          opportunity_id?: string | null
          owner_id?: string | null
          priority?: string
          start_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_settings: {
        Row: {
          enabled: boolean
          id: number
          last_run_at: string | null
          last_run_count: number | null
          notify_overdue_close: boolean
          notify_overdue_tasks: boolean
          notify_stale: boolean
          stale_days: number
        }
        Insert: {
          enabled?: boolean
          id?: number
          last_run_at?: string | null
          last_run_count?: number | null
          notify_overdue_close?: boolean
          notify_overdue_tasks?: boolean
          notify_stale?: boolean
          stale_days?: number
        }
        Update: {
          enabled?: boolean
          id?: number
          last_run_at?: string | null
          last_run_count?: number | null
          notify_overdue_close?: boolean
          notify_overdue_tasks?: boolean
          notify_stale?: boolean
          stale_days?: number
        }
        Relationships: [
        ]
      }
      automation_rules: {
        Row: {
          actions: Json
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          name: string
          object: string
          run_count: number
          sort_order: number
          trigger_on: string
          updated_at: string
          watch_field: string | null
        }
        Insert: {
          actions?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name: string
          object: string
          run_count?: number
          sort_order?: number
          trigger_on?: string
          updated_at?: string
          watch_field?: string | null
        }
        Update: {
          actions?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          name?: string
          object?: string
          run_count?: number
          sort_order?: number
          trigger_on?: string
          updated_at?: string
          watch_field?: string | null
        }
        Relationships: [
        ]
      }
      campaign_members: {
        Row: {
          campaign_id: string
          contact_id: string | null
          created_at: string
          created_by: string | null
          has_responded: boolean | null
          id: string
          lead_id: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          has_responded?: never
          id?: string
          lead_id?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          has_responded?: never
          id?: string
          lead_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_members_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_members_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          actual_cost: number | null
          budgeted_cost: number | null
          campaign_type: string
          created_at: string
          created_by: string | null
          custom_fields: Json
          description: string | null
          end_date: string | null
          expected_response: number | null
          expected_revenue: number | null
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          owner_id: string | null
          parent_id: string | null
          start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actual_cost?: number | null
          budgeted_cost?: number | null
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          end_date?: string | null
          expected_response?: number | null
          expected_revenue?: number | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          owner_id?: string | null
          parent_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actual_cost?: number | null
          budgeted_cost?: number | null
          campaign_type?: string
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          end_date?: string | null
          expected_response?: number | null
          expected_revenue?: number | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          owner_id?: string | null
          parent_id?: string | null
          start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          account_id: string | null
          case_number: string
          case_type: string | null
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          description: string | null
          id: string
          is_closed: boolean
          is_demo: boolean
          origin: string | null
          owner_id: string | null
          priority: string
          product_id: string | null
          reason: string | null
          resolution: string | null
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          case_number?: string
          case_type?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          id?: string
          is_closed?: boolean
          is_demo?: boolean
          origin?: string | null
          owner_id?: string | null
          priority?: string
          product_id?: string | null
          reason?: string | null
          resolution?: string | null
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          case_number?: string
          case_type?: string | null
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          id?: string
          is_closed?: boolean
          is_demo?: boolean
          origin?: string | null
          owner_id?: string | null
          priority?: string
          product_id?: string | null
          reason?: string | null
          resolution?: string | null
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          account_id: string | null
          birthdate: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          department: string | null
          description: string | null
          do_not_call: boolean
          email: string | null
          email_opt_out: boolean
          first_name: string | null
          full_name: string | null
          id: string
          is_demo: boolean
          last_name: string
          lead_source: string | null
          mailing_city: string | null
          mailing_country: string | null
          mailing_state: string | null
          mailing_street: string | null
          mobile: string | null
          owner_id: string | null
          phone: string | null
          reports_to_id: string | null
          salutation: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          birthdate?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          department?: string | null
          description?: string | null
          do_not_call?: boolean
          email?: string | null
          email_opt_out?: boolean
          first_name?: string | null
          full_name?: never
          id?: string
          is_demo?: boolean
          last_name: string
          lead_source?: string | null
          mailing_city?: string | null
          mailing_country?: string | null
          mailing_state?: string | null
          mailing_street?: string | null
          mobile?: string | null
          owner_id?: string | null
          phone?: string | null
          reports_to_id?: string | null
          salutation?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          birthdate?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          department?: string | null
          description?: string | null
          do_not_call?: boolean
          email?: string | null
          email_opt_out?: boolean
          first_name?: string | null
          full_name?: never
          id?: string
          is_demo?: boolean
          last_name?: string
          lead_source?: string | null
          mailing_city?: string | null
          mailing_country?: string | null
          mailing_state?: string | null
          mailing_street?: string | null
          mobile?: string | null
          owner_id?: string | null
          phone?: string | null
          reports_to_id?: string | null
          salutation?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          api_name: string
          created_at: string
          field_type: string
          help_text: string | null
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          object: string
          options: Json
          show_in_list: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          api_name: string
          created_at?: string
          field_type: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          object: string
          options?: Json
          show_in_list?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          api_name?: string
          created_at?: string
          field_type?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          object?: string
          options?: Json
          show_in_list?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
        ]
      }
      email_templates: {
        Row: {
          body: string
          category: string
          created_at: string
          id: string
          is_active: boolean
          is_shared: boolean
          name: string
          owner_id: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_shared?: boolean
          name: string
          owner_id?: string | null
          subject?: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_shared?: boolean
          name?: string
          owner_id?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      field_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          field: string
          id: number
          new_value: string | null
          object: string
          old_value: string | null
          operation: string
          record_id: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          field: string
          id?: number
          new_value?: string | null
          object: string
          old_value?: string | null
          operation?: string
          record_id: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          field?: string
          id?: number
          new_value?: string | null
          object?: string
          old_value?: string | null
          operation?: string
          record_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          created: number
          created_at: string
          created_by: string | null
          errors: Json
          file_name: string | null
          id: string
          match_field: string | null
          mode: string
          object: string
          skipped: number
          total: number
          updated: number
        }
        Insert: {
          created?: number
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_name?: string | null
          id?: string
          match_field?: string | null
          mode?: string
          object: string
          skipped?: number
          total?: number
          updated?: number
        }
        Update: {
          created?: number
          created_at?: string
          created_by?: string | null
          errors?: Json
          file_name?: string | null
          id?: string
          match_field?: string | null
          mode?: string
          object?: string
          skipped?: number
          total?: number
          updated?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          annual_revenue: number | null
          campaign_id: string | null
          city: string | null
          company: string
          converted_account_id: string | null
          converted_at: string | null
          converted_contact_id: string | null
          converted_opportunity_id: string | null
          country: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          description: string | null
          email: string | null
          employees: number | null
          first_name: string | null
          full_name: string | null
          id: string
          industry: string | null
          is_converted: boolean
          is_demo: boolean
          last_name: string
          lead_source: string | null
          mobile: string | null
          owner_id: string | null
          phone: string | null
          rating: string | null
          salutation: string | null
          state: string | null
          status: string
          street: string | null
          title: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          annual_revenue?: number | null
          campaign_id?: string | null
          city?: string | null
          company: string
          converted_account_id?: string | null
          converted_at?: string | null
          converted_contact_id?: string | null
          converted_opportunity_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          email?: string | null
          employees?: number | null
          first_name?: string | null
          full_name?: never
          id?: string
          industry?: string | null
          is_converted?: boolean
          is_demo?: boolean
          last_name: string
          lead_source?: string | null
          mobile?: string | null
          owner_id?: string | null
          phone?: string | null
          rating?: string | null
          salutation?: string | null
          state?: string | null
          status?: string
          street?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          annual_revenue?: number | null
          campaign_id?: string | null
          city?: string | null
          company?: string
          converted_account_id?: string | null
          converted_at?: string | null
          converted_contact_id?: string | null
          converted_opportunity_id?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          email?: string | null
          employees?: number | null
          first_name?: string | null
          full_name?: never
          id?: string
          industry?: string | null
          is_converted?: boolean
          is_demo?: boolean
          last_name?: string
          lead_source?: string | null
          mobile?: string | null
          owner_id?: string | null
          phone?: string | null
          rating?: string | null
          salutation?: string | null
          state?: string | null
          status?: string
          street?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_account_id_fkey"
            columns: ["converted_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_opportunity_id_fkey"
            columns: ["converted_opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      list_views: {
        Row: {
          created_at: string
          definition: Json
          id: string
          is_pinned: boolean
          is_shared: boolean
          name: string
          object: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          definition?: Json
          id?: string
          is_pinned?: boolean
          is_shared?: boolean
          name: string
          object: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          definition?: Json
          id?: string
          is_pinned?: boolean
          is_shared?: boolean
          name?: string
          object?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_views_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          dedupe_key: string | null
          id: string
          is_read: boolean
          link: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          link?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          account_id: string | null
          amount: number
          campaign_id: string | null
          close_date: string
          closed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          custom_fields: Json
          description: string | null
          expected_revenue: number | null
          forecast_category: string
          id: string
          is_closed: boolean
          is_demo: boolean
          is_won: boolean
          lead_source: string | null
          loss_reason: string | null
          name: string
          next_step: string | null
          opportunity_type: string | null
          owner_id: string | null
          pipeline_id: string
          price_book_id: string | null
          probability: number
          stage_changed_at: string
          stage_id: string
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          amount?: number
          campaign_id?: string | null
          close_date?: string
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          custom_fields?: Json
          description?: string | null
          expected_revenue?: never
          forecast_category?: string
          id?: string
          is_closed?: boolean
          is_demo?: boolean
          is_won?: boolean
          lead_source?: string | null
          loss_reason?: string | null
          name: string
          next_step?: string | null
          opportunity_type?: string | null
          owner_id?: string | null
          pipeline_id: string
          price_book_id?: string | null
          probability?: number
          stage_changed_at?: string
          stage_id: string
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          campaign_id?: string | null
          close_date?: string
          closed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          custom_fields?: Json
          description?: string | null
          expected_revenue?: never
          forecast_category?: string
          id?: string
          is_closed?: boolean
          is_demo?: boolean
          is_won?: boolean
          lead_source?: string | null
          loss_reason?: string | null
          name?: string
          next_step?: string | null
          opportunity_type?: string | null
          owner_id?: string | null
          pipeline_id?: string
          price_book_id?: string | null
          probability?: number
          stage_changed_at?: string
          stage_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_price_book_id_fkey"
            columns: ["price_book_id"]
            isOneToOne: false
            referencedRelation: "price_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_stage_history: {
        Row: {
          amount: number | null
          changed_at: string
          changed_by: string | null
          from_stage_id: string | null
          id: string
          opportunity_id: string
          probability: number | null
          to_stage_id: string | null
        }
        Insert: {
          amount?: number | null
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          id?: string
          opportunity_id: string
          probability?: number | null
          to_stage_id?: string | null
        }
        Update: {
          amount?: number | null
          changed_at?: string
          changed_by?: string | null
          from_stage_id?: string | null
          id?: string
          opportunity_id?: string
          probability?: number | null
          to_stage_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_stage_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_history_from_stage_id_fkey"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_history_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_history_to_stage_id_fkey"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_profiles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_admin: boolean
          is_default: boolean
          name: string
          permissions: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_admin?: boolean
          is_default?: boolean
          name: string
          permissions?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_admin?: boolean
          is_default?: boolean
          name?: string
          permissions?: Json
          updated_at?: string
        }
        Relationships: [
        ]
      }
      picklist_values: {
        Row: {
          created_at: string
          field: string
          id: string
          is_active: boolean
          object: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          field: string
          id?: string
          is_active?: boolean
          object: string
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string
          field?: string
          id?: string
          is_active?: boolean
          object?: string
          sort_order?: number
          value?: string
        }
        Relationships: [
        ]
      }
      pipeline_stages: {
        Row: {
          category: string
          color: string
          created_at: string
          forecast_category: string
          id: string
          name: string
          pipeline_id: string
          probability: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          color?: string
          created_at?: string
          forecast_category?: string
          id?: string
          name: string
          pipeline_id: string
          probability?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          color?: string
          created_at?: string
          forecast_category?: string
          id?: string
          name?: string
          pipeline_id?: string
          probability?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
        ]
      }
      price_book_entries: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          price_book_id: string
          product_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          price_book_id: string
          product_id: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          price_book_id?: string
          product_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_book_entries_price_book_id_fkey"
            columns: ["price_book_id"]
            isOneToOne: false
            referencedRelation: "price_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_book_entries_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_books: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_standard: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_standard?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_standard?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      products: {
        Row: {
          created_at: string
          created_by: string | null
          custom_fields: Json
          description: string | null
          family: string | null
          id: string
          is_active: boolean
          is_demo: boolean
          name: string
          product_code: string | null
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          family?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name: string
          product_code?: string | null
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          description?: string | null
          family?: string | null
          id?: string
          is_active?: boolean
          is_demo?: boolean
          name?: string
          product_code?: string | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          manager_id: string | null
          permission_profile_id: string | null
          phone: string | null
          preferences: Json
          role_id: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string
          id: string
          is_active?: boolean
          manager_id?: string | null
          permission_profile_id?: string | null
          phone?: string | null
          preferences?: Json
          role_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          permission_profile_id?: string | null
          phone?: string | null
          preferences?: Json
          role_id?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_permission_profile_id_fkey"
            columns: ["permission_profile_id"]
            isOneToOne: false
            referencedRelation: "permission_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_line_items: {
        Row: {
          created_at: string
          description: string | null
          discount: number
          id: string
          line_total: number | null
          product_id: string | null
          quantity: number
          quote_id: string
          sort_order: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount?: number
          id?: string
          line_total?: never
          product_id?: string | null
          quantity?: number
          quote_id: string
          sort_order?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount?: number
          id?: string
          line_total?: never
          product_id?: string | null
          quantity?: number
          quote_id?: string
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_line_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          account_id: string | null
          bill_to_name: string | null
          billing_address: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          delivery_terms: string | null
          description: string | null
          discount_total: number
          expiration_date: string | null
          grand_total: number
          id: string
          is_demo: boolean
          is_synced: boolean
          name: string
          net_total: number
          opportunity_id: string
          owner_id: string | null
          payment_terms: string | null
          price_book_id: string | null
          quote_number: string
          shipping: number
          shipping_address: string | null
          status: string
          subtotal: number
          tax: number
          tax_rate: number
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          bill_to_name?: string | null
          billing_address?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          delivery_terms?: string | null
          description?: string | null
          discount_total?: number
          expiration_date?: string | null
          grand_total?: number
          id?: string
          is_demo?: boolean
          is_synced?: boolean
          name: string
          net_total?: number
          opportunity_id: string
          owner_id?: string | null
          payment_terms?: string | null
          price_book_id?: string | null
          quote_number?: string
          shipping?: number
          shipping_address?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          bill_to_name?: string | null
          billing_address?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          delivery_terms?: string | null
          description?: string | null
          discount_total?: number
          expiration_date?: string | null
          grand_total?: number
          id?: string
          is_demo?: boolean
          is_synced?: boolean
          name?: string
          net_total?: number
          opportunity_id?: string
          owner_id?: string | null
          payment_terms?: string | null
          price_book_id?: string | null
          quote_number?: string
          shipping?: number
          shipping_address?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_price_book_id_fkey"
            columns: ["price_book_id"]
            isOneToOne: false
            referencedRelation: "price_books"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          definition: Json
          description: string | null
          folder: string
          id: string
          is_shared: boolean
          last_run_at: string | null
          name: string
          object: string
          owner_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          definition?: Json
          description?: string | null
          folder?: string
          id?: string
          is_shared?: boolean
          last_run_at?: string | null
          name: string
          object: string
          owner_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          definition?: Json
          description?: string | null
          folder?: string
          id?: string
          is_shared?: boolean
          last_run_at?: string | null
          name?: string
          object?: string
          owner_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          parent_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          },
        ]
      }
      sharing_settings: {
        Row: {
          access: string
          object: string
          updated_at: string
        }
        Insert: {
          access?: string
          object: string
          updated_at?: string
        }
        Update: {
          access?: string
          object?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
      validation_rules: {
        Row: {
          conditions: Json
          created_at: string
          description: string | null
          error_field: string | null
          error_message: string
          id: string
          is_active: boolean
          name: string
          object: string
          updated_at: string
        }
        Insert: {
          conditions?: Json
          created_at?: string
          description?: string | null
          error_field?: string | null
          error_message: string
          id?: string
          is_active?: boolean
          name: string
          object: string
          updated_at?: string
        }
        Update: {
          conditions?: Json
          created_at?: string
          description?: string | null
          error_field?: string | null
          error_message?: string
          id?: string
          is_active?: boolean
          name?: string
          object?: string
          updated_at?: string
        }
        Relationships: [
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_access_owner: {
        Args: {
          p_owner: string
        }
        Returns: boolean
      }
      can_delete_record: {
        Args: {
          p_object: string
          p_owner: string
        }
        Returns: boolean
      }
      can_edit_record: {
        Args: {
          p_object: string
          p_owner: string
        }
        Returns: boolean
      }
      can_read_record: {
        Args: {
          p_object: string
          p_owner: string
        }
        Returns: boolean
      }
      can_see_record: {
        Args: {
          p_object: string
          p_id: string
        }
        Returns: boolean
      }
      claim_demo_records: {
        Args: {
          p_owner: string
        }
        Returns: undefined
      }
      convert_lead: {
        Args: {
          p_lead: string
          p_account_id?: string
          p_account_name?: string
          p_create_opportunity?: boolean
          p_opportunity_name?: string
          p_stage_id?: string
          p_amount?: number
          p_close_date?: string
          p_owner?: string
        }
        Returns: Json
      }
      crm_dashboard: {
        Args: {
          p_from: string
          p_to: string
          p_owner?: string
          p_pipeline?: string
        }
        Returns: Json
      }
      crm_dashboard_extra: {
        Args: {
          p_from: string
          p_to: string
          p_owner?: string
        }
        Returns: Json
      }
      find_duplicates: {
        Args: {
          p_object: string
        }
        Returns: {
          id_a: string
          name_a: string
          id_b: string
          name_b: string
          reason: string
        }[]
      }
      generate_alerts: {
        Args: never
        Returns: number
      }
      global_search: {
        Args: {
          p_query: string
          p_limit?: number
        }
        Returns: {
          object: string
          id: string
          title: string
          subtitle: string
        }[]
      }
      has_perm: {
        Args: {
          p_object: string
          p_action: string
        }
        Returns: boolean
      }
      is_admin: {
        Args: never
        Returns: boolean
      }
      mark_automation_run: {
        Args: {
          p_rule: string
        }
        Returns: undefined
      }
      merge_records: {
        Args: {
          p_object: string
          p_master: string
          p_duplicate: string
        }
        Returns: string
      }
      my_permissions: {
        Args: never
        Returns: Json
      }
      normalize_text: {
        Args: {
          p: string
        }
        Returns: string
      }
      notify_user: {
        Args: {
          p_user: string
          p_title: string
          p_body?: string
          p_link?: string
        }
        Returns: string
      }
      possible_duplicates: {
        Args: {
          p_object: string
          p_name: string
          p_email?: string
          p_tax_id?: string
        }
        Returns: {
          id: string
          label: string
        }[]
      }
      recalc_quote: {
        Args: {
          p_quote: string
        }
        Returns: undefined
      }
      sharing_access: {
        Args: {
          p_object: string
        }
        Returns: string
      }
      sync_quote: {
        Args: {
          p_quote: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
