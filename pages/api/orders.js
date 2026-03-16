import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { status, channel, customer_id, search } = req.query

    let query = supabase
      .from('sales_orders')
      .select(`
        *,
        customer:customers(id, name, type),
        lines:sales_order_lines(*, product:products(sku, name)),
        invoice:invoices(id, invoice_number, status, balance_due)
      `)
      .order('created_at', { ascending: false })

    if (status) query = query.eq('status', status)
    if (channel) query = query.eq('channel', channel)
    if (customer_id) query = query.eq('customer_id', customer_id)
    if (search) query = query.ilike('order_number', `%${search}%`)

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { customer_id, channel, order_date, payment_terms_days, notes, lines } = req.body

    if (!customer_id || !channel || !order_date || !lines?.length)
      return res.status(400).json({ error: 'customer_id, channel, order_date et lines sont obligatoires' })

    // Calcul des totaux
    const subtotal = lines.reduce((sum, l) => sum + (l.quantity_ordered * l.unit_price), 0)

    // Génère le numéro de commande
    const prefix = channel === 'wholesale' ? 'WS' : 'EC'
    const { count } = await supabase
      .from('sales_orders')
      .select('*', { count: 'exact', head: true })
      .eq('channel', channel)
    const order_number = `CBS-${prefix}-${String((count || 0) + 1).padStart(5, '0')}`

    // Crée la commande
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .insert({
        order_number,
        channel,
        status: 'draft',
        order_date,
        customer_id,
        payment_terms_days: payment_terms_days || 30,
        subtotal,
        tax_amount: 0,
        total_amount: subtotal,
        notes,
      })
      .select()
      .single()

    if (orderErr) return res.status(500).json({ error: orderErr.message })

    // Récupère les produits pour dénormaliser sku/name
    const productIds = lines.map(l => l.product_id)
    const { data: products } = await supabase
      .from('products')
      .select('id, sku, name')
      .in('id', productIds)
    const productMap = Object.fromEntries(products.map(p => [p.id, p]))

    // Crée les lignes
    const orderLines = lines.map(l => ({
      sales_order_id: order.id,
      product_id: l.product_id,
      sku: productMap[l.product_id]?.sku || '',
      product_name: productMap[l.product_id]?.name || '',
      quantity_ordered: l.quantity_ordered,
      quantity_fulfilled: 0,
      unit_price: l.unit_price,
      line_total: l.quantity_ordered * l.unit_price,
    }))

    const { error: linesErr } = await supabase
      .from('sales_order_lines')
      .insert(orderLines)

    if (linesErr) return res.status(500).json({ error: linesErr.message })

    return res.status(201).json(order)
  }

  // PATCH — mise à jour du statut
  if (req.method === 'PATCH') {
    const { id, status, cancelled_reason } = req.body
    if (!id) return res.status(400).json({ error: 'id obligatoire' })

    const updates = { status, updated_at: new Date().toISOString() }
    if (cancelled_reason) updates.cancelled_reason = cancelled_reason
    if (status === 'cancelled') updates.cancelled_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('sales_orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
