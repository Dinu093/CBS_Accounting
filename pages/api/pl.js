import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { from, to } = req.query
  const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  const dateTo = to || new Date().toISOString().split('T')[0]

  // Revenus wholesale — invoices payées ou partiellement payées
  const { data: wholesaleInvoices } = await supabase
    .from('invoices')
    .select('total_due, amount_paid, sales_order:sales_orders(channel, order_date)')
    .in('status', ['paid', 'partially_paid', 'sent'])
    .gte('issue_date', dateFrom)
    .lte('issue_date', dateTo)

  // Revenus ecommerce — orders fulfillées
  const { data: ecomOrders } = await supabase
    .from('sales_orders')
    .select('subtotal, total_amount, order_date')
    .eq('channel', 'ecommerce')
    .eq('status', 'fulfilled')
    .gte('order_date', dateFrom)
    .lte('order_date', dateTo)

  // COGS — depuis les lignes fulfillées
  const { data: cogsLines } = await supabase
    .from('sales_order_lines')
    .select('cogs_total, sales_order:sales_orders!inner(status, order_date)')
    .eq('sales_order.status', 'fulfilled')
    .gte('sales_order.order_date', dateFrom)
    .lte('sales_order.order_date', dateTo)
    .not('cogs_total', 'is', null)

  // Calculs
  const revenueWholesale = (wholesaleInvoices || [])
    .filter(i => i.sales_order?.channel === 'wholesale')
    .reduce((s, i) => s + Number(i.amount_paid || i.total_due), 0)

  const revenueEcommerce = (ecomOrders || [])
    .reduce((s, o) => s + Number(o.total_amount), 0)

  const totalRevenue = revenueWholesale + revenueEcommerce

  const totalCogs = (cogsLines || [])
    .reduce((s, l) => s + Number(l.cogs_total || 0), 0)

  const grossProfit = totalRevenue - totalCogs
  const grossMarginPct = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

  // Revenus par mois pour le graphe
  const monthlyMap = {}
  ;(wholesaleInvoices || []).forEach(i => {
    const month = i.issue_date?.slice(0, 7) || i.sales_order?.order_date?.slice(0, 7)
    if (!month) return
    if (!monthlyMap[month]) monthlyMap[month] = { month, wholesale: 0, ecommerce: 0, cogs: 0 }
    monthlyMap[month].wholesale += Number(i.amount_paid || i.total_due)
  })
  ;(ecomOrders || []).forEach(o => {
    const month = o.order_date?.slice(0, 7)
    if (!month) return
    if (!monthlyMap[month]) monthlyMap[month] = { month, wholesale: 0, ecommerce: 0, cogs: 0 }
    monthlyMap[month].ecommerce += Number(o.total_amount)
  })
  ;(cogsLines || []).forEach(l => {
    const month = l.sales_order?.order_date?.slice(0, 7)
    if (!month) return
    if (!monthlyMap[month]) monthlyMap[month] = { month, wholesale: 0, ecommerce: 0, cogs: 0 }
    monthlyMap[month].cogs += Number(l.cogs_total || 0)
  })

  const monthly = Object.values(monthlyMap).sort((a, b) => a.month.localeCompare(b.month))

  return res.status(200).json({
    period: { from: dateFrom, to: dateTo },
    revenue: {
      wholesale: revenueWholesale,
      ecommerce: revenueEcommerce,
      total: totalRevenue,
    },
    cogs: totalCogs,
    gross_profit: grossProfit,
    gross_margin_pct: Math.round(grossMarginPct * 10) / 10,
    ebitda: grossProfit, // simplifié pour le MVP — sans OpEx détaillé
    monthly,
  })
}
