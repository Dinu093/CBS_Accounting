import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { data: invoices, error } = await supabase
    .from('invoices')
    .select('*, customer:customers(id, name, email)')
    .not('status', 'in', '("paid","void")')
    .order('due_date', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const rows = (invoices || []).map(inv => {
    const due = new Date(inv.due_date)
    const balance = Number(inv.total_due) - Number(inv.amount_paid)
    const daysOverdue = Math.floor((today - due) / (1000 * 60 * 60 * 24))

    let bucket
    if (daysOverdue <= 0) bucket = 'current'
    else if (daysOverdue <= 30) bucket = '1-30'
    else if (daysOverdue <= 60) bucket = '31-60'
    else if (daysOverdue <= 90) bucket = '61-90'
    else bucket = '90+'

    return {
      invoice_id: inv.id,
      invoice_number: inv.invoice_number,
      customer_id: inv.customer?.id,
      customer_name: inv.customer?.name,
      customer_email: inv.customer?.email,
      issue_date: inv.issue_date,
      due_date: inv.due_date,
      total_due: Number(inv.total_due),
      amount_paid: Number(inv.amount_paid),
      balance_due: balance,
      days_overdue: daysOverdue,
      bucket,
      status: inv.status,
    }
  })

  // Totaux par bucket
  const buckets = ['current', '1-30', '31-60', '61-90', '90+']
  const summary = {}
  buckets.forEach(b => {
    summary[b] = rows
      .filter(r => r.bucket === b)
      .reduce((s, r) => s + r.balance_due, 0)
  })
  summary.total = rows.reduce((s, r) => s + r.balance_due, 0)

  // Totaux par customer
  const byCustomer = {}
  rows.forEach(r => {
    if (!byCustomer[r.customer_id]) {
      byCustomer[r.customer_id] = {
        customer_id: r.customer_id,
        customer_name: r.customer_name,
        current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0, total: 0
      }
    }
    byCustomer[r.customer_id][r.bucket] += r.balance_due
    byCustomer[r.customer_id].total += r.balance_due
  })

  return res.status(200).json({
    rows,
    summary,
    by_customer: Object.values(byCustomer).sort((a, b) => b.total - a.total),
  })
}
