import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { type, from, to } = req.query
  const dateFrom = from || new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]
  const dateTo = to || new Date().toISOString().split('T')[0]

  // ─── Par distributeur ─────────────────────────────────────────────────────
  if (type === 'by_customer') {
    const { data: orders } = await supabase
      .from('sales_orders')
      .select(`
        total_amount, subtotal, channel, order_date,
        customer:customers(id, name, type),
        lines:sales_order_lines(quantity_fulfilled, unit_price, line_total, cogs_total, sku, product_name)
      `)
      .in('status', ['confirmed', 'partially_fulfilled', 'fulfilled'])
      .eq('channel', 'wholesale')
      .gte('order_date', dateFrom)
      .lte('order_date', dateTo)

    const byCustomer = {}
    ;(orders || []).forEach(o => {
      const id = o.customer?.id || 'unknown'
      if (!byCustomer[id]) {
        byCustomer[id] = {
          customer_id: id,
          customer_name: o.customer?.name || 'Unknown',
          order_count: 0,
          revenue: 0,
          cogs: 0,
          units: 0,
        }
      }
      byCustomer[id].order_count++
      byCustomer[id].revenue += Number(o.total_amount)
      ;(o.lines || []).forEach(l => {
        byCustomer[id].cogs += Number(l.cogs_total || 0)
        byCustomer[id].units += Number(l.quantity_fulfilled || 0)
      })
    })

    const result = Object.values(byCustomer).map(c => ({
      ...c,
      gross_profit: c.revenue - c.cogs,
      margin_pct: c.revenue > 0 ? ((c.revenue - c.cogs) / c.revenue * 100).toFixed(1) : '0.0'
    })).sort((a, b) => b.revenue - a.revenue)

    return res.status(200).json({ type: 'by_customer', period: { from: dateFrom, to: dateTo }, rows: result })
  }

  // ─── Par SKU ──────────────────────────────────────────────────────────────
  if (type === 'by_sku') {
    const { data: lines } = await supabase
      .from('sales_order_lines')
      .select(`
        sku, product_name, quantity_fulfilled, unit_price, line_total, cogs_total,
        sales_order:sales_orders!inner(status, order_date, channel)
      `)
      .in('sales_order.status', ['confirmed', 'partially_fulfilled', 'fulfilled'])
      .gte('sales_order.order_date', dateFrom)
      .lte('sales_order.order_date', dateTo)

    const bySku = {}
    ;(lines || []).forEach(l => {
      const key = l.sku
      if (!bySku[key]) {
        bySku[key] = {
          sku: l.sku,
          product_name: l.product_name,
          units_sold: 0,
          revenue: 0,
          cogs: 0,
          wholesale_units: 0,
          ecommerce_units: 0,
        }
      }
      bySku[key].units_sold += Number(l.quantity_fulfilled || 0)
      bySku[key].revenue += Number(l.line_total || 0)
      bySku[key].cogs += Number(l.cogs_total || 0)
      if (l.sales_order?.channel === 'wholesale') bySku[key].wholesale_units += Number(l.quantity_fulfilled || 0)
      if (l.sales_order?.channel === 'ecommerce') bySku[key].ecommerce_units += Number(l.quantity_fulfilled || 0)
    })

    const result = Object.values(bySku).map(s => ({
      ...s,
      gross_profit: s.revenue - s.cogs,
      margin_pct: s.revenue > 0 ? ((s.revenue - s.cogs) / s.revenue * 100).toFixed(1) : '0.0',
      avg_unit_price: s.units_sold > 0 ? (s.revenue / s.units_sold).toFixed(2) : '0.00',
    })).sort((a, b) => b.revenue - a.revenue)

    return res.status(200).json({ type: 'by_sku', period: { from: dateFrom, to: dateTo }, rows: result })
  }

  // ─── Par canal (channel) ─────────────────────────────────────────────────
  if (type === 'by_channel') {
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('channel, total_amount, subtotal, order_date, lines:sales_order_lines(cogs_total)')
      .in('status', ['confirmed', 'partially_fulfilled', 'fulfilled'])
      .gte('order_date', dateFrom)
      .lte('order_date', dateTo)

    const byChannel = {}
    ;(orders || []).forEach(o => {
      if (!byChannel[o.channel]) byChannel[o.channel] = { channel: o.channel, order_count: 0, revenue: 0, cogs: 0 }
      byChannel[o.channel].order_count++
      byChannel[o.channel].revenue += Number(o.total_amount)
      ;(o.lines || []).forEach(l => { byChannel[o.channel].cogs += Number(l.cogs_total || 0) })
    })

    const result = Object.values(byChannel).map(c => ({
      ...c,
      gross_profit: c.revenue - c.cogs,
      margin_pct: c.revenue > 0 ? ((c.revenue - c.cogs) / c.revenue * 100).toFixed(1) : '0.0'
    })).sort((a, b) => b.revenue - a.revenue)

    return res.status(200).json({ type: 'by_channel', period: { from: dateFrom, to: dateTo }, rows: result })
  }

  return res.status(400).json({ error: 'type must be by_customer, by_sku, or by_channel' })
}
