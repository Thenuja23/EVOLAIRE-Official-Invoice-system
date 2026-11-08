import { getSupabase } from '@/lib/supabase'
import type { Payment, PaymentInput } from '@/types/models'

export const paymentService = {
  async list(invoiceId: string): Promise<Payment[]> {
    const client = getSupabase()
    const { data, error } = await client
      .from('payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('paid_on', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Payment[]
  },

  async create(input: PaymentInput): Promise<Payment> {
    const client = getSupabase()
    const { data, error } = await client
      .from('payments')
      .insert({
        invoice_id: input.invoice_id,
        amount: input.amount,
        paid_on: input.paid_on,
        method: input.method,
        note: input.note?.trim() || null,
      })
      .select('*')
      .single()
    if (error) throw error
    return data as Payment
  },

  async update(id: string, input: PaymentInput): Promise<Payment> {
    const client = getSupabase()
    const { data, error } = await client
      .from('payments')
      .update({
        amount: input.amount,
        paid_on: input.paid_on,
        method: input.method,
        note: input.note?.trim() || null,
      })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as Payment
  },

  async remove(id: string): Promise<void> {
    const client = getSupabase()
    const { error } = await client.from('payments').delete().eq('id', id)
    if (error) throw error
  },
}
