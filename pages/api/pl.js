import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { from, to } = req.query
  const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  const dateTo = to || new Date().toISOString().split('T')[0]

  // Revenus wholesale
  const { data: wholesaleInvoices } = await supabase
    .from('invoices')
    .select('total_due, amount_paid, issue_date, sales_order:sales_orders(channel, order_date)')
    .in('status', ['paid', 'partially_paid', 'sent'])
    .gte('issue_date', dateFrom)
    .lte('issue_date', dateTo)

  // Revenus ecommerce
  const { data: ecomOrders } = await supabase
    .from('sales_orders')
    .select('subtotal, total_amount, order_date')
    .eq('channel', 'ecommerce')
    .in('status', ['confirmed', 'partially_fulfilled', 'fulfilled'])
    .gte('order_date', dateFrom)
    .lte('order_date', dateTo)

  // COGS
  const { data: cogsLines } = await supabase
    .from('sales_order_lines')
    .select('cogs_total, sales_order:sales_orders!inner(status, order_date)')
    .eq('sales_order.status', 'fulfilled')
    .gte('sales_order.order_date', dateFrom)
    .lte('sales_order.order_date', dateTo)
    .not('cogs_total', 'is', null)

  // OpEx — depuis la table expenses
  const { data: expensesData } = await supabase
    .from('expenses')
    .select('amount, category, expense_date')
    .gte('expense_date', dateFrom)
    .lte('expense_date', dateTo)

  // Calculs revenus
  const revenueWholesale = (wholesaleInvoices || [])
    .filter(i => i.sales_order?.channel === 'wholesale')
    .reduce((s, i) => s + Number(i.amount_paid || i.total_due), 0)

  const revenueEcommerce = (ecomOrders || [])
    .reduce((s, o) => s + Number(o.total_amount), 0)

  const totalRevenue = revenueWholesale + revenueEcommerce
  const totalCogs = (cogsLines || []).reduce((s, l) => s + Number(l.cogs_total || 0), 0)
  const grossProfit = totalRevenue - totalCogs
  const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // OpEx par catégorie
  const opexByCategory = {}
  ;(expensesData || []).forEach(e => {
    if (!opexByCategory[e.category]) opexByCategory[e.category] = 0
    opexByCategory[e.category] += Number(e.amount)
  })
  const totalOpex = Object.values(opexByCategory).reduce((s, v) => s + v, 0)
  const ebitda = grossProfit - totalOpex
  const ebitdaMarginPct = totalRevenue > 0 ? (ebitda / totalRevenue) * 100 : 0

  // Trend mensuel
  const monthlyMap = {}

  const addToMonth = (month, field, value) => {
    if (!month) return
    if (!monthlyMap[month]) monthlyMap[month] = { month, wholesale: 0, ecommerce: 0, cogs: 0, opex: 0 }
    monthlyMap[month][field] += value
  }

  ;(wholesaleInvoices || []).forEach(i => {
    const month = i.issue_date?.slice(0, 7)
    if (i.sales_order?.channel === 'wholesale') addToMonth(month, 'wholesale', Number(i.amount_paid || i.total_due))
  })
  ;(ecomOrders || []).forEach(o => addToMonth(o.order_date?.slice(0, 7), 'ecommerce', Number(o.total_amount)))
  ;(cogsLines || []).forEach(l => addToMonth(l.sales_order?.order_date?.slice(0, 7), 'cogs', Number(l.cogs_total || 0)))
  ;(expensesData || []).forEach(e => addToMonth(e.expense_date?.slice(0, 7), 'opex', Number(e.amount)))

  const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month))

  return res.status(200).json({
    period: { from: dateFrom, to: dateTo },
    revenue: { wholesale: revenueWholesale, ecommerce: revenueEcommerce, total: totalRevenue },
    cogs: totalCogs,
    gross_profit: grossProfit,
    gross_margin_pct: Math.round(grossMarginPct * 10) / 10,
    opex: { by_category: opexByCategory, total: totalOpex },
    ebitda,
    ebitda_margin_pct: Math.round(ebitdaMarginPct * 10) / 10,
    monthly,
  })
}
