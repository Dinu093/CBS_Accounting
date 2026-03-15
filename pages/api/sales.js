import { supabase } from '../../lib/supabase'

const n = (v) => (v !== undefined && v !== null && v !== '') ? parseFloat(v) : null
const s = (v) => (v && v.toString().trim() !== '' && v !== '0') ? v.toString().trim() : null

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*, distributors(name, channel), distributor_locations(name, city, state), sale_items(*, inventory(product_name, sku))')
      .order('date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { order, items, forceInsert } = req.body
    const totalAmount = items.reduce((a, i) => a + +i.quantity * +i.unit_price, 0)

    // Duplicate check
    if (!forceInsert && order.reference) {
      const { data: existing } = await supabase.from('sales_orders').select('id').eq('reference', order.reference.trim()).eq('date', order.date)
      if (existing?.length > 0) return res.status(409).json({ duplicate: true, error: 'Order ' + order.reference + ' already exists' })
    }

    const clean = {
      date: order.date,
      channel: order.channel || 'E-commerce',
      reference: s(order.reference),
      distributor_id: s(order.distributor_id),
      location_id: s(order.location_id),
      payment_status: order.payment_status || 'paid',
      due_date: s(order.due_date),
      buyer_name: s(order.buyer_name),
      buyer_email: s(order.buyer_email),
      buyer_phone: s(order.buyer_phone),
      buyer_address: s(order.buyer_address),
      buyer_city: s(order.buyer_city),
      buyer_state: s(order.buyer_state),
      buyer_zip: s(order.buyer_zip),
      shipping_cost: n(order.shipping_cost) || 0,
      lat: n(order.lat), lng: n(order.lng),
      notes: s(order.notes),
      source: order.source || 'manual',
    }

    const { data: ord, error: ordErr } = await supabase.from('sales_orders').insert([{ ...clean, total_amount: Math.round(totalAmount * 100) / 100 }]).select()
    if (ordErr) return res.status(500).json({ error: ordErr.message })
    const orderId = ord[0].id

    const lineItems = items.map(i => ({
      order_id: orderId, product_id: i.product_id,
      quantity: +i.quantity, unit_price: +i.unit_price, unit_cost: +i.unit_cost || 0,
      total_price: Math.round(+i.quantity * +i.unit_price * 100) / 100,
      margin: Math.round((+i.quantity * +i.unit_price - +i.quantity * (+i.unit_cost || 0)) * 100) / 100,
    }))
    await supabase.from('sale_items').insert(lineItems)

    // Deduct stock
    for (const item of items) {
      const { data: prod } = await supabase.from('inventory').select('quantity_on_hand').eq('id', item.product_id).single()
      if (prod) await supabase.from('inventory').update({ quantity_on_hand: +prod.quantity_on_hand - +item.quantity }).eq('id', item.product_id)
    }

    // Only record transaction immediately if paid — pending goes to AR, transaction created when paid
    if (order.payment_status === 'paid') {
      const txCat = order.channel === 'Wholesale' ? 'Sales — Wholesale' : 'Sales — E-commerce'
      await supabase.from('transactions').insert([{
        date: order.date, description: (order.reference || orderId.slice(0, 8)) + ' — ' + order.channel,
        category: txCat, type: 'revenue', amount: Math.round(totalAmount * 100) / 100, note: orderId,
      }])
    }

    // Create AR if unpaid wholesale
    if (order.payment_status === 'pending' && +totalAmount > 0) {
      await supabase.from('receivables').insert([{
        customer: order.buyer_name || 'Customer', amount: Math.round(totalAmount * 100) / 100,
        due_date: s(order.due_date), note: order.reference || orderId.slice(0, 8), status: 'pending', order_id: orderId,
      }])
    }

    return res.json({ success: true, order_id: orderId })
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body
    const { data, error } = await supabase.from('sales_orders').update(updates).eq('id', id).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    const { data: order } = await supabase.from('sales_orders').select('*, sale_items(*)').eq('id', id).single()
    // Restore stock
    for (const item of (order?.sale_items || [])) {
      const { data: prod } = await supabase.from('inventory').select('quantity_on_hand').eq('id', item.product_id).single()
      if (prod) await supabase.from('inventory').update({ quantity_on_hand: +prod.quantity_on_hand + +item.quantity }).eq('id', item.product_id)
    }
    // Remove linked transaction and AR
    await supabase.from('transactions').delete().eq('note', id)
    await supabase.from('receivables').delete().eq('order_id', id)
    await supabase.from('sales_orders').delete().eq('id', id)
    return res.json({ success: true })
  }

  res.status(405).end()
}
