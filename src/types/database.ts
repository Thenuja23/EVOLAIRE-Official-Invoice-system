export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      customers: {
        Row: {
          address: string | null
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number
          position: number
          price: number
          unit: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          invoice_id: string
          line_total?: number
          position: number
          price?: number
          unit?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number
          position?: number
          price?: number
          unit?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          business_snapshot: Json
          created_at: string
          customer_id: string | null
          customer_name: string
          deleted_at: string | null
          discount_amount: number
          due_date: string
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          payment_terms: string | null
          project_name: string | null
          status: string
          subtotal: number
          tax_rate: number
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          business_snapshot?: Json
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          deleted_at?: string | null
          discount_amount?: number
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          payment_terms?: string | null
          project_name?: string | null
          status?: string
          subtotal?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          business_snapshot?: Json
          created_at?: string
          customer_id?: string | null
          customer_name?: string
          deleted_at?: string | null
          discount_amount?: number
          due_date?: string
          id?: string
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          payment_terms?: string | null
          project_name?: string | null
          status?: string
          subtotal?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          method: string
          note: string | null
          paid_on: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          method?: string
          note?: string | null
          paid_on?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          method?: string
          note?: string | null
          paid_on?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          address: string | null
          advance_percent: number
          bank_account_name: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          business_name: string
          created_at: string
          currency: string
          default_due_days: number
          default_payment_terms: string
          discount_enabled: boolean
          email: string | null
          id: string
          invoice_format: string
          invoice_prefix: string
          logo_path: string | null
          next_invoice_seq: number
          phone: string | null
          tax_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          advance_percent?: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          business_name?: string
          created_at?: string
          currency?: string
          default_due_days?: number
          default_payment_terms?: string
          discount_enabled?: boolean
          email?: string | null
          id?: string
          invoice_format?: string
          invoice_prefix?: string
          logo_path?: string | null
          next_invoice_seq?: number
          phone?: string | null
          tax_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          address?: string | null
          advance_percent?: number
          bank_account_name?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          business_name?: string
          created_at?: string
          currency?: string
          default_due_days?: number
          default_payment_terms?: string
          discount_enabled?: boolean
          email?: string | null
          id?: string
          invoice_format?: string
          invoice_prefix?: string
          logo_path?: string | null
          next_invoice_seq?: number
          phone?: string | null
          tax_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      invoice_summary: {
        Row: {
          balance: number
          business_snapshot: Json
          created_at: string
          customer_id: string | null
          customer_name: string
          deleted_at: string | null
          discount_amount: number
          due_date: string
          id: string
          invoice_date: string
          invoice_number: string
          notes: string | null
          paid: number
          payment_status: string
          payment_terms: string | null
          project_name: string | null
          status: string
          subtotal: number
          tax_rate: number
          total: number
          updated_at: string
          user_id: string
        }
        Relationships: []
      }
    }
    Functions: {
      customer_stats: {
        Args: { p_customer_id: string }
        Returns: {
          invoice_count: number
          billed: number
          paid: number
          outstanding: number
        }[]
      }
      dashboard_metrics: {
        Args: Record<PropertyKey, never>
        Returns: {
          billed_this_month: number
          received_this_month: number
          total_outstanding: number
          overdue_count: number
        }[]
      }
      generate_invoice_number: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      load_sample_data: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      monthly_revenue: {
        Args: Record<PropertyKey, never>
        Returns: {
          month: string
          billed: number
          received: number
        }[]
      }
      restore_backup: {
        Args: { payload: Json }
        Returns: Json
      }
      save_invoice: {
        Args: { payload: Json }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
