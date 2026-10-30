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
      account_team_members: {
        Row: {
          account_access: string
          account_id: string
          case_access: string
          contact_access: string
          created_at: string
          created_by: string | null
          id: string
          opportunity_access: string
          team_role: string
          user_id: string
        }
        Insert: {
          account_access?: string
          account_id: string
          case_access?: string
          contact_access?: string
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_access?: string
          team_role?: string
          user_id: string
        }
        Update: {
          account_access?: string
          account_id?: string
          case_access?: string
          contact_access?: string
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_access?: string
          team_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_team_members_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_team_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
          sap_card_code: string | null
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
          sap_card_code?: string | null
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
          sap_card_code?: string | null
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
      approval_processes: {
        Row: {
          approve_updates: Json
          conditions: Json
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          lock_record: boolean
          name: string
          object: string
          reject_updates: Json
          sort_order: number
          submit_updates: Json
          updated_at: string
        }
        Insert: {
          approve_updates?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          lock_record?: boolean
          name: string
          object: string
          reject_updates?: Json
          sort_order?: number
          submit_updates?: Json
          updated_at?: string
        }
        Update: {
          approve_updates?: Json
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          lock_record?: boolean
          name?: string
          object?: string
          reject_updates?: Json
          sort_order?: number
          submit_updates?: Json
          updated_at?: string
        }
        Relationships: [
        ]
      }
      approval_request_steps: {
        Row: {
          approver_id: string | null
          comment: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          request_id: string
          status: string
          step_name: string
          step_order: number
        }
        Insert: {
          approver_id?: string | null
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          request_id: string
          status?: string
          step_name: string
          step_order: number
        }
        Update: {
          approver_id?: string | null
          comment?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          request_id?: string
          status?: string
          step_name?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_request_steps_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_request_steps_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_request_steps_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          approver_id: string | null
          current_step: number | null
          current_step_name: string | null
          decided_at: string | null
          decided_by: string | null
          decision_comment: string | null
          id: string
          lock_record: boolean
          object: string
          process_id: string | null
          process_name: string
          record_id: string
          record_name: string | null
          status: string
          submit_comment: string | null
          submitted_at: string
          submitted_by: string | null
        }
        Insert: {
          approver_id?: string | null
          current_step?: number | null
          current_step_name?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_comment?: string | null
          id?: string
          lock_record?: boolean
          object: string
          process_id?: string | null
          process_name: string
          record_id: string
          record_name?: string | null
          status?: string
          submit_comment?: string | null
          submitted_at?: string
          submitted_by?: string | null
        }
        Update: {
          approver_id?: string | null
          current_step?: number | null
          current_step_name?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_comment?: string | null
          id?: string
          lock_record?: boolean
          object?: string
          process_id?: string | null
          process_name?: string
          record_id?: string
          record_name?: string | null
          status?: string
          submit_comment?: string | null
          submitted_at?: string
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "approval_processes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_steps: {
        Row: {
          approver_id: string | null
          approver_type: string
          conditions: Json
          id: string
          name: string
          process_id: string
          step_order: number
        }
        Insert: {
          approver_id?: string | null
          approver_type?: string
          conditions?: Json
          id?: string
          name: string
          process_id: string
          step_order: number
        }
        Update: {
          approver_id?: string | null
          approver_type?: string
          conditions?: Json
          id?: string
          name?: string
          process_id?: string
          step_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_steps_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_steps_process_id_fkey"
            columns: ["process_id"]
            isOneToOne: false
            referencedRelation: "approval_processes"
            referencedColumns: ["id"]
          },
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
          schedule_field: string | null
          schedule_offset_days: number
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
          schedule_field?: string | null
          schedule_offset_days?: number
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
          schedule_field?: string | null
          schedule_offset_days?: number
          sort_order?: number
          trigger_on?: string
          updated_at?: string
          watch_field?: string | null
        }
        Relationships: [
        ]
      }
      automation_runs: {
        Row: {
          executed_at: string
          record_id: string
          rule_id: string
          target_date: string
        }
        Insert: {
          executed_at?: string
          record_id: string
          rule_id: string
          target_date: string
        }
        Update: {
          executed_at?: string
          record_id?: string
          rule_id?: string
          target_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
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
          help_text_en: string | null
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          label_en: string | null
          object: string
          option_labels_en: Json
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
          help_text_en?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          label_en?: string | null
          object: string
          option_labels_en?: Json
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
          help_text_en?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          label_en?: string | null
          object?: string
          option_labels_en?: Json
          options?: Json
          show_in_list?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
        ]
      }
      default_team_members: {
        Row: {
          access: string
          case_access: string
          contact_access: string
          created_at: string
          id: string
          object: string
          opportunity_access: string
          owner_id: string
          team_role: string
          user_id: string
        }
        Insert: {
          access?: string
          case_access?: string
          contact_access?: string
          created_at?: string
          id?: string
          object: string
          opportunity_access?: string
          owner_id?: string
          team_role?: string
          user_id: string
        }
        Update: {
          access?: string
          case_access?: string
          contact_access?: string
          created_at?: string
          id?: string
          object?: string
          opportunity_access?: string
          owner_id?: string
          team_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "default_team_members_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "default_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      external_links: {
        Row: {
          external_id: string
          external_updated_at: string | null
          id: string
          kind: string
          object: string
          origin: string
          provider: string
          record_id: string
          synced_at: string
          user_id: string
          web_url: string | null
        }
        Insert: {
          external_id: string
          external_updated_at?: string | null
          id?: string
          kind: string
          object: string
          origin?: string
          provider?: string
          record_id: string
          synced_at?: string
          user_id?: string
          web_url?: string | null
        }
        Update: {
          external_id?: string
          external_updated_at?: string | null
          id?: string
          kind?: string
          object?: string
          origin?: string
          provider?: string
          record_id?: string
          synced_at?: string
          user_id?: string
          web_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_links_user_id_fkey"
            columns: ["user_id"]
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
      forecast_adjustments: {
        Row: {
          adjusted_by: string | null
          amount: number
          created_at: string
          id: string
          note: string | null
          period_start: string
          period_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          adjusted_by?: string | null
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          period_start: string
          period_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          adjusted_by?: string | null
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          period_start?: string
          period_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_adjustments_adjusted_by_fkey"
            columns: ["adjusted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_adjustments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      forecast_snapshots: {
        Row: {
          adjustment: number | null
          best_case: number
          closed: number
          commit_amount: number
          id: string
          open_count: number
          period_start: string
          period_type: string
          pipeline: number
          quota: number | null
          taken_at: string
          taken_on: string
          user_id: string
        }
        Insert: {
          adjustment?: number | null
          best_case?: number
          closed?: number
          commit_amount?: number
          id?: string
          open_count?: number
          period_start: string
          period_type: string
          pipeline?: number
          quota?: number | null
          taken_at?: string
          taken_on: string
          user_id: string
        }
        Update: {
          adjustment?: number | null
          best_case?: number
          closed?: number
          commit_amount?: number
          id?: string
          open_count?: number
          period_start?: string
          period_type?: string
          pipeline?: number
          quota?: number | null
          taken_at?: string
          taken_on?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_snapshots_user_id_fkey"
            columns: ["user_id"]
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
      mcp_activity: {
        Row: {
          created_at: string
          id: number
          is_change: boolean
          object: string | null
          record_id: string | null
          summary: string | null
          token_id: string | null
          tool: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          is_change?: boolean
          object?: string | null
          record_id?: string | null
          summary?: string | null
          token_id?: string | null
          tool: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: number
          is_change?: boolean
          object?: string | null
          record_id?: string | null
          summary?: string | null
          token_id?: string | null
          tool?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_activity_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "mcp_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_confirmations: {
        Row: {
          args_hash: string
          created_at: string
          expires_at: string
          id: string
          summary: string
          token_id: string | null
          tool: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          args_hash: string
          created_at?: string
          expires_at?: string
          id?: string
          summary: string
          token_id?: string | null
          tool: string
          used_at?: string | null
          user_id?: string
        }
        Update: {
          args_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          summary?: string
          token_id?: string | null
          tool?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_confirmations_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "mcp_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_confirmations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          created_at: string
          expires_at: string | null
          grant_id: string | null
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scope: string
          token_hash: string
          token_prefix: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          grant_id?: string | null
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scope?: string
          token_hash: string
          token_prefix: string
          user_id?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          grant_id?: string | null
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scope?: string
          token_hash?: string
          token_prefix?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_tokens_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "oauth_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mcp_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ms365_connections: {
        Row: {
          access_token_enc: string
          connected_at: string
          display_name: string | null
          email: string | null
          expires_at: string
          last_sync_at: string | null
          last_sync_summary: string | null
          ms_user_id: string | null
          refresh_token_enc: string
          scopes: string | null
          settings: Json
          user_id: string
        }
        Insert: {
          access_token_enc: string
          connected_at?: string
          display_name?: string | null
          email?: string | null
          expires_at: string
          last_sync_at?: string | null
          last_sync_summary?: string | null
          ms_user_id?: string | null
          refresh_token_enc: string
          scopes?: string | null
          settings?: Json
          user_id?: string
        }
        Update: {
          access_token_enc?: string
          connected_at?: string
          display_name?: string | null
          email?: string | null
          expires_at?: string
          last_sync_at?: string | null
          last_sync_summary?: string | null
          ms_user_id?: string | null
          refresh_token_enc?: string
          scopes?: string | null
          settings?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ms365_connections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      oauth_clients: {
        Row: {
          created_at: string
          id: string
          name: string
          redirect_uris: string[]
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          redirect_uris: string[]
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          redirect_uris?: string[]
        }
        Relationships: [
        ]
      }
      oauth_codes: {
        Row: {
          client_id: string
          code_challenge: string
          code_hash: string
          expires_at: string
          redirect_uri: string
          resource: string | null
          scope: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_hash: string
          expires_at?: string
          redirect_uri: string
          resource?: string | null
          scope: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_hash?: string
          expires_at?: string
          redirect_uri?: string
          resource?: string | null
          scope?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_codes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_grants: {
        Row: {
          client_id: string
          created_at: string
          id: string
          last_used_at: string | null
          revoked_at: string | null
          scope: string
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          scope: string
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          revoked_at?: string | null
          scope?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_grants_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "oauth_clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oauth_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_refresh_tokens: {
        Row: {
          created_at: string
          expires_at: string
          grant_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string
          grant_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          grant_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "oauth_refresh_tokens_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "oauth_grants"
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
      opportunity_snapshots: {
        Row: {
          amount: number | null
          close_date: string | null
          forecast_category: string | null
          is_closed: boolean | null
          is_won: boolean | null
          opportunity_id: string
          owner_id: string | null
          stage_id: string | null
          taken_on: string
        }
        Insert: {
          amount?: number | null
          close_date?: string | null
          forecast_category?: string | null
          is_closed?: boolean | null
          is_won?: boolean | null
          opportunity_id: string
          owner_id?: string | null
          stage_id?: string | null
          taken_on: string
        }
        Update: {
          amount?: number | null
          close_date?: string | null
          forecast_category?: string | null
          is_closed?: boolean | null
          is_won?: boolean | null
          opportunity_id?: string
          owner_id?: string | null
          stage_id?: string | null
          taken_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_snapshots_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_splits: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          opportunity_id: string
          percent: number
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          opportunity_id: string
          percent: number
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          opportunity_id?: string
          percent?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_splits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_splits_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_splits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      opportunity_team_members: {
        Row: {
          access: string
          created_at: string
          created_by: string | null
          id: string
          opportunity_id: string
          team_role: string
          user_id: string
        }
        Insert: {
          access?: string
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id: string
          team_role?: string
          user_id: string
        }
        Update: {
          access?: string
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id?: string
          team_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_team_members_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_team_members_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          description: string | null
          discount: number
          id: string
          line_total: number | null
          order_id: string
          product_id: string | null
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount?: number
          id?: string
          line_total?: never
          order_id: string
          product_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          discount?: number
          id?: string
          line_total?: never
          order_id?: string
          product_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          account_id: string
          activated_at: string | null
          bill_to_name: string | null
          billing_address: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          custom_fields: Json
          customer_po: string | null
          delivered_at: string | null
          delivery_terms: string | null
          description: string | null
          discount_total: number
          grand_total: number
          id: string
          is_demo: boolean
          name: string
          net_total: number
          opportunity_id: string | null
          order_date: string
          order_number: string
          owner_id: string | null
          payment_terms: string | null
          price_book_id: string | null
          quote_id: string | null
          requested_delivery_date: string | null
          shipping: number
          shipping_address: string | null
          status: string
          subtotal: number
          tax: number
          tax_rate: number
          updated_at: string
        }
        Insert: {
          account_id: string
          activated_at?: string | null
          bill_to_name?: string | null
          billing_address?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          customer_po?: string | null
          delivered_at?: string | null
          delivery_terms?: string | null
          description?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          is_demo?: boolean
          name: string
          net_total?: number
          opportunity_id?: string | null
          order_date?: string
          order_number?: string
          owner_id?: string | null
          payment_terms?: string | null
          price_book_id?: string | null
          quote_id?: string | null
          requested_delivery_date?: string | null
          shipping?: number
          shipping_address?: string | null
          status?: string
          subtotal?: number
          tax?: number
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          account_id?: string
          activated_at?: string | null
          bill_to_name?: string | null
          billing_address?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          custom_fields?: Json
          customer_po?: string | null
          delivered_at?: string | null
          delivery_terms?: string | null
          description?: string | null
          discount_total?: number
          grand_total?: number
          id?: string
          is_demo?: boolean
          name?: string
          net_total?: number
          opportunity_id?: string | null
          order_date?: string
          order_number?: string
          owner_id?: string | null
          payment_terms?: string | null
          price_book_id?: string | null
          quote_id?: string | null
          requested_delivery_date?: string | null
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
            foreignKeyName: "orders_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_price_book_id_fkey"
            columns: ["price_book_id"]
            isOneToOne: false
            referencedRelation: "price_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: true
            referencedRelation: "quotes"
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
          label_en: string | null
          object: string
          sort_order: number
          value: string
        }
        Insert: {
          created_at?: string
          field: string
          id?: string
          is_active?: boolean
          label_en?: string | null
          object: string
          sort_order?: number
          value: string
        }
        Update: {
          created_at?: string
          field?: string
          id?: string
          is_active?: boolean
          label_en?: string | null
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
          name_en: string | null
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
          name_en?: string | null
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
          name_en?: string | null
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
          name_en: string | null
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
          name_en?: string | null
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
          name_en?: string | null
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
          discount_percent: number | null
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
          discount_percent?: never
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
          discount_percent?: never
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
      sales_goals: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          metric: string
          period_start: string
          period_type: string
          target: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          metric: string
          period_start: string
          period_type: string
          target: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          metric?: string
          period_start?: string
          period_type?: string
          target?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_goals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      teams_channels: {
        Row: {
          created_at: string
          id: string
          name: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          webhook_url: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          webhook_url?: string
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
      add_default_team: {
        Args: {
          p_object: string
          p_id: string
        }
        Returns: number
      }
      advance_approval: {
        Args: {
          p_request: string
          p_previous_approver: string
        }
        Returns: boolean
      }
      apply_field_updates: {
        Args: {
          p_table: string
          p_id: string
          p_updates: Json
        }
        Returns: undefined
      }
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
      can_edit_team_record: {
        Args: {
          p_object: string
          p_owner: string
          p_id: string
        }
        Returns: boolean
      }
      can_manage_goal: {
        Args: {
          p_user: string
        }
        Returns: boolean
      }
      can_manage_team: {
        Args: {
          p_object: string
          p_id: string
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
      can_read_team_record: {
        Args: {
          p_object: string
          p_owner: string
          p_id: string
        }
        Returns: boolean
      }
      can_see_goal: {
        Args: {
          p_user: string
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
      condition_matches: {
        Args: {
          p_row: Json
          c: Json
        }
        Returns: boolean
      }
      conditions_match: {
        Args: {
          p_row: Json
          p_conditions: Json
        }
        Returns: boolean
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
      copy_default_team: {
        Args: {
          p_object: string
          p_id: string
          p_owner: string
        }
        Returns: number
      }
      create_order_from_quote: {
        Args: {
          p_quote: string
        }
        Returns: string
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
      decide_approval: {
        Args: {
          p_request: string
          p_approve: boolean
          p_comment?: string
        }
        Returns: undefined
      }
      demo_data_counts: {
        Args: never
        Returns: Json
      }
      execute_automation_actions: {
        Args: {
          p_rule: string
          p_row: Json
        }
        Returns: undefined
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
      forecast_summary: {
        Args: {
          p_period_type: string
          p_period_start: string
        }
        Returns: {
          user_id: string
          user_name: string
          closed: number
          commit_amount: number
          best_case: number
          pipeline: number
          open_count: number
          quota: number
          adjustment: number
          adjustment_note: string
          can_adjust: boolean
        }[]
      }
      forecast_trend: {
        Args: {
          p_period_type: string
          p_period_start: string
          p_user?: string
        }
        Returns: {
          taken_on: string
          closed: number
          commit_amount: number
          best_case: number
          pipeline: number
          quota: number
          forecast: number
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
      goal_period_end: {
        Args: {
          p_type: string
          p_start: string
        }
        Returns: string
      }
      goal_progress: {
        Args: {
          p_period_type: string
          p_period_start: string
        }
        Returns: {
          goal_id: string
          user_id: string
          user_name: string
          metric: string
          target: number
          actual: number
          period_end: string
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
      is_record_locked: {
        Args: {
          p_object: string
          p_id: string
        }
        Returns: boolean
      }
      jsonb_to_date: {
        Args: {
          p: Json
        }
        Returns: string
      }
      mark_automation_run: {
        Args: {
          p_rule: string
        }
        Returns: undefined
      }
      mcp_resolve_token: {
        Args: {
          p_hash: string
        }
        Returns: {
          token_id: string
          user_id: string
          email: string
          scope: string
        }[]
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
      oauth_client_info: {
        Args: {
          p_client: string
        }
        Returns: {
          name: string
          redirect_uris: string[]
        }[]
      }
      oauth_create_code: {
        Args: {
          p_client: string
          p_redirect_uri: string
          p_code_challenge: string
          p_scope: string
          p_resource: string
          p_code_hash: string
        }
        Returns: undefined
      }
      oauth_exchange_code: {
        Args: {
          p_code_hash: string
          p_client: string
          p_redirect_uri: string
          p_challenge: string
          p_access_hash: string
          p_access_prefix: string
          p_refresh_hash: string
        }
        Returns: {
          scope: string
          expires_in: number
        }[]
      }
      oauth_refresh: {
        Args: {
          p_refresh_hash: string
          p_client: string
          p_access_hash: string
          p_access_prefix: string
          p_new_refresh_hash: string
        }
        Returns: {
          scope: string
          expires_in: number
        }[]
      }
      oauth_register_client: {
        Args: {
          p_name: string
          p_redirect_uris: string[]
        }
        Returns: string
      }
      pipeline_changes: {
        Args: {
          p_since: string
          p_period_type: string
          p_period_start: string
        }
        Returns: {
          opportunity_id: string
          name: string
          owner_id: string
          is_new: boolean
          amount_before: number
          amount_after: number
          close_before: string
          close_after: string
          stage_before: string
          stage_after: string
          category_before: string
          category_after: string
          was_closed: boolean
          is_closed: boolean
          is_won: boolean
        }[]
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
      purge_demo_data: {
        Args: never
        Returns: Json
      }
      recalc_order: {
        Args: {
          p_order: string
        }
        Returns: undefined
      }
      recalc_quote: {
        Args: {
          p_quote: string
        }
        Returns: undefined
      }
      recall_approval: {
        Args: {
          p_request: string
        }
        Returns: undefined
      }
      record_label: {
        Args: {
          p_row: Json
        }
        Returns: string
      }
      record_path: {
        Args: {
          p_object: string
        }
        Returns: string
      }
      run_scheduled_automations: {
        Args: never
        Returns: number
      }
      set_opportunity_splits: {
        Args: {
          p_opportunity: string
          p_splits: Json
        }
        Returns: undefined
      }
      sharing_access: {
        Args: {
          p_object: string
        }
        Returns: string
      }
      submit_approval: {
        Args: {
          p_process: string
          p_record: string
          p_comment?: string
        }
        Returns: string
      }
      sync_quote: {
        Args: {
          p_quote: string
        }
        Returns: undefined
      }
      take_forecast_snapshot: {
        Args: never
        Returns: number
      }
      team_access: {
        Args: {
          p_object: string
          p_id: string
        }
        Returns: string
      }
      try_numeric: {
        Args: {
          p: string
        }
        Returns: number
      }
      user_has_system_perm: {
        Args: {
          p_user: string
          p_action: string
        }
        Returns: boolean
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
