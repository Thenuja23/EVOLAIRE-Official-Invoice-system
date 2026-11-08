import { addDaysISO, addMonthsISO, toNumber, todayISO } from '@/lib/format'
import { roundMoney } from '@/lib/invoice'
import { getSupabase } from '@/lib/supabase'
import {
  fetchAllPages,
  fetchInvoiceSummariesFallback,
  isSchemaCacheMissingError,
  isSchemaFeatureAvailable,
  markSchemaFeatureUnavailable,
} from '@/services/serviceUtils'
import type {
  DashboardMetrics,
  Invoice,
  InvoiceSummary,
  MonthlyRevenuePoint,
  Payment,
} from '@/types/models'

async function computeMetricsFallback(): Promise<DashboardMetrics> {
  const client = getSupabase()
  const [finalInvoices, payments] = await Promise.all([
    fetchAllPages<Pick<Invoice, 'id' | 'total' | 'invoice_date' | 'due_date'>>((from, to) =>
      client
        .from('invoices')
        .select('id, total, invoice_date, due_date')
        .eq('status', 'final')
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<Pick<Payment, 'invoice_id' | 'amount' | 'paid_on'>>((from, to) =>
      client
        .from('payments')
        .select('invoice_id, amount, paid_on')
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])

  const finalInvoiceIds = new Set(finalInvoices.map((inv) => inv.id))
  const paidByInvoice = new Map<string, number>()
  const today = todayISO()
  const monthPrefix = today.slice(0, 7)

  let receivedThisMonth = 0
  for (const payment of payments) {
    if (!finalInvoiceIds.has(payment.invoice_id)) continue
    const amount = toNumber(payment.amount)
    paidByInvoice.set(
      payment.invoice_id,
      roundMoney((paidByInvoice.get(payment.invoice_id) ?? 0) + amount),
    )
    if (payment.paid_on.slice(0, 7) === monthPrefix) {
      receivedThisMonth = roundMoney(receivedThisMonth + amount)
    }
  }

  let billedThisMonth = 0
  let totalOutstanding = 0
  let overdueCount = 0

  for (const inv of finalInvoices) {
    const total = toNumber(inv.total)
    const paid = paidByInvoice.get(inv.id) ?? 0
    const balance = roundMoney(total - paid)

    if (inv.invoice_date.slice(0, 7) === monthPrefix) {
      billedThisMonth = roundMoney(billedThisMonth + total)
    }
    totalOutstanding = roundMoney(totalOutstanding + balance)
    if (inv.due_date < today && balance > 0) {
      overdueCount += 1
    }
  }

  return {
    billed_this_month: billedThisMonth,
    received_this_month: receivedThisMonth,
    total_outstanding: totalOutstanding,
    overdue_count: overdueCount,
  }
}

async function computeMonthlyRevenueFallback(): Promise<MonthlyRevenuePoint[]> {
  const client = getSupabase()
  const [finalInvoices, payments] = await Promise.all([
    fetchAllPages<Pick<Invoice, 'id' | 'total' | 'invoice_date'>>((from, to) =>
      client
        .from('invoices')
        .select('id, total, invoice_date')
        .eq('status', 'final')
        .is('deleted_at', null)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllPages<Pick<Payment, 'invoice_id' | 'amount' | 'paid_on'>>((from, to) =>
      client
        .from('payments')
        .select('invoice_id, amount, paid_on')
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])

  const currentMonthStart = `${todayISO().slice(0, 7)}-01`
  const months: string[] = []
  for (let i = 11; i >= 0; i -= 1) {
    months.push(addMonthsISO(currentMonthStart, -i))
  }

  const billedByMonth = new Map<string, number>()
  const receivedByMonth = new Map<string, number>()
  const finalInvoiceIds = new Set<string>()

  for (const inv of finalInvoices) {
    finalInvoiceIds.add(inv.id)
    const monthKey = `${inv.invoice_date.slice(0, 7)}-01`
    billedByMonth.set(monthKey, roundMoney((billedByMonth.get(monthKey) ?? 0) + toNumber(inv.total)))
  }

  for (const payment of payments) {
    if (!finalInvoiceIds.has(payment.invoice_id)) continue
    const monthKey = `${payment.paid_on.slice(0, 7)}-01`
    receivedByMonth.set(
      monthKey,
      roundMoney((receivedByMonth.get(monthKey) ?? 0) + toNumber(payment.amount)),
    )
  }

  return months.map((month) => ({
    month,
    billed: billedByMonth.get(month) ?? 0,
    received: receivedByMonth.get(month) ?? 0,
  }))
}

export const dashboardService = {
  async metrics(): Promise<DashboardMetrics> {
    if (isSchemaFeatureAvailable('dashboard_metrics')) {
      const client = getSupabase()
      const { data, error } = await client.rpc('dashboard_metrics')
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data
        return {
          billed_this_month: Number(row?.billed_this_month ?? 0),
          received_this_month: Number(row?.received_this_month ?? 0),
          total_outstanding: Number(row?.total_outstanding ?? 0),
          overdue_count: Number(row?.overdue_count ?? 0),
        }
      }
      if (!isSchemaCacheMissingError(error)) throw error
      markSchemaFeatureUnavailable('dashboard_metrics')
    }

    return computeMetricsFallback()
  },

  async monthlyRevenue(): Promise<MonthlyRevenuePoint[]> {
    if (isSchemaFeatureAvailable('monthly_revenue')) {
      const client = getSupabase()
      const { data, error } = await client.rpc('monthly_revenue')
      if (!error) {
        return ((data ?? []) as MonthlyRevenuePoint[]).map((point) => ({
          month: point.month,
          billed: Number(point.billed ?? 0),
          received: Number(point.received ?? 0),
        }))
      }
      if (!isSchemaCacheMissingError(error)) throw error
      markSchemaFeatureUnavailable('monthly_revenue')
    }

    return computeMonthlyRevenueFallback()
  },

  async recentInvoices(limit = 6): Promise<InvoiceSummary[]> {
    if (isSchemaFeatureAvailable('invoice_summary')) {
      const client = getSupabase()
      const { data, error } = await client
        .from('invoice_summary')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (!error) return (data ?? []) as InvoiceSummary[]
      if (!isSchemaCacheMissingError(error)) throw error
      markSchemaFeatureUnavailable('invoice_summary')
    }

    const rows = await fetchInvoiceSummariesFallback()
    return rows
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
  },

  async overdueInvoices(limit = 5): Promise<InvoiceSummary[]> {
    if (isSchemaFeatureAvailable('invoice_summary')) {
      const client = getSupabase()
      const { data, error } = await client
        .from('invoice_summary')
        .select('*')
        .is('deleted_at', null)
        .eq('payment_status', 'Overdue')
        .order('due_date', { ascending: true })
        .limit(limit)
      if (!error) return (data ?? []) as InvoiceSummary[]
      if (!isSchemaCacheMissingError(error)) throw error
      markSchemaFeatureUnavailable('invoice_summary')
    }

    const rows = await fetchInvoiceSummariesFallback()
    return rows
      .filter((row) => row.payment_status === 'Overdue')
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, limit)
  },

  async upcomingInvoices(days = 7, limit = 5): Promise<InvoiceSummary[]> {
    const today = todayISO()
    const until = addDaysISO(today, days)

    if (isSchemaFeatureAvailable('invoice_summary')) {
      const client = getSupabase()
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
      if (!error) return (data ?? []) as InvoiceSummary[]
      if (!isSchemaCacheMissingError(error)) throw error
      markSchemaFeatureUnavailable('invoice_summary')
    }

    const rows = await fetchInvoiceSummariesFallback()
    return rows
      .filter(
        (row) =>
          row.status === 'final' &&
          (row.payment_status === 'Unpaid' || row.payment_status === 'Partially Paid') &&
          row.due_date >= today &&
          row.due_date <= until,
      )
      .sort((a, b) => a.due_date.localeCompare(b.due_date))
      .slice(0, limit)
  },
}
