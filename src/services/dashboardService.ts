import { addDaysISO, todayISO } from '@/lib/format'
import { getSupabase } from '@/lib/supabase'
import type {
  DashboardMetrics,
  InvoiceSummary,
  MonthlyRevenuePoint,
} from '@/types/models'

export const dashboardService = {
  async metrics(): Promise<DashboardMetrics> {
    const client = getSupabase()
    const { data, error } = await client.rpc('dashboard_metrics')
    if (error) throw error
    const row = Array.isArray(data) ? data[0] : data
    return {
      billed_this_month: Number(row?.billed_this_month ?? 0),
      received_this_month: Number(row?.received_this_month ?? 0),
      total_outstanding: Number(row?.total_outstanding ?? 0),
      overdue_count: Number(row?.overdue_count ?? 0),
    }
  },

  async monthlyRevenue(): Promise<MonthlyRevenuePoint[]> {
    const client = getSupabase()
    const { data, error } = await client.rpc('monthly_revenue')
    if (error) throw error
    return ((data ?? []) as MonthlyRevenuePoint[]).map((point) => ({
      month: point.month,
      billed: Number(point.billed ?? 0),
      received: Number(point.received ?? 0),
    }))
  },

  async recentInvoices(limit = 6): Promise<InvoiceSummary[]> {
    const client = getSupabase()
    const { data, error } = await client
      .from('invoice_summary')
      .select('*')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as InvoiceSummary[]
  },

  async overdueInvoices(limit = 5): Promise<InvoiceSummary[]> {
    const client = getSupabase()
    const { data, error } = await client
      .from('invoice_summary')
      .select('*')
      .is('deleted_at', null)
      .eq('payment_status', 'Overdue')
      .order('due_date', { ascending: true })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as InvoiceSummary[]
  },

  async upcomingInvoices(days = 7, limit = 5): Promise<InvoiceSummary[]> {
    const client = getSupabase()
    const today = todayISO()
    const until = addDaysISO(today, days)
    const { data, error } = await client
      .from('invoice_summary')
      .select('*')
      .is('deleted_at', null)
      .eq('status', 'final')
      .in('payment_status', ['Unpaid', 'Partially Paid'])
      .gte('due_date', today)
      .lte('due_date', until)
      .order('due_date', { ascending: true })
      .limit(limit)
    if (error) throw error
    return (data ?? []) as InvoiceSummary[]
  },
}
