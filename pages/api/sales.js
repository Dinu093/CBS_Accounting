import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  res.setHeader('Pragma', 'no-cache')

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*, distributors(name, channel), sale_items(*, inventory(product_name, sku))')
      .order('date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { order, items, forceInsert } = req.body
    const totalAmount = items.reduce((a, i) => a + (parseFloat(i.quantity) * parseFloat(i.unit_price)), 0)

    if (!forceInsert) {
      // Check duplicate by reference + date
      if (order.reference) {
        const { data: existing } = await supabase
          .from('sales_orders')
          .select('id, reference, date, total_amount')
          .eq('reference', order.reference.trim())
          .eq('date', order.date)

        if (existing && existing.length > 0) {
          return res.status(409).json({
            error: 'La facture "' + order.reference + '" du ' + order.date + ' est déjà enregistrée (' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(existing[0].total_amount) + ').',
            duplicate: true,
            existing: existing[0]
          })
        }
      }

      // Check duplicate by date + total + channel
      const { data: existingAmount } = await supabase
        .from('sales_orders')
        .select('id, reference, date, total_amount')
        .eq('date', order.date)
        .eq('total_amount', Math.round(totalAmount * 100) / 100)
        .eq('channel', order.channel)

      if (existingAmount && existingAmount.length > 0) {
        return res.status(409).json({
          error: 'Une vente de ' + new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(totalAmount) + ' sur "' + order.channel + '" le ' + order.date + ' existe déjà' + (existingAmount[0].reference ? ' (réf: ' + existingAmount[0].reference + ')' : '') + '.',
          duplicate: true,
          existing: existingAmount[0]
        })
      }
    }

    // Insert order
    const { data: ord, error: ordErr } = await supabase
      .from('sales_orders')
      .insert([{ ...order, total_amount: Math.round(totalAmount * 100) / 100 }])
      .select()
    if (ordErr) return res.status(500).json({ error: ordErr.message })

    const orderId = ord[0].id
    const lineItems = []

    for (const item of items) {
      const qty = parseFloat(item.quantity)
      const unitPrice = parseFloat(item.unit_price)
      const unitCost = parseFloat(item.unit_cost || 0)
      lineItems.push({
        order_id: orderId,
        product_id: item.product_id,
        quantity: qty,
        unit_price: unitPrice,
        unit_cost: unitCost,
        total_price: Math.round(qty * unitPrice * 100) / 100,
        margin: Math.round((qty * unitPrice - qty * unitCost) * 100) / 100
      })

      // Deduct from inventory
      const { data: prod } = await supabase.from('inventory').select('quantity_on_hand').eq('id', item.product_id).single()
      if (prod) {
        await supabase.from('inventory').update({ quantity_on_hand: Math.max(0, parseFloat(prod.quantity_on_hand) - qty) }).eq('id', item.product_id)
      }
    }

    await supabase.from('sale_items').insert(lineItems)

    await supabase.from('transactions').insert([{
      date: order.date,
      description: 'Vente ' + (order.reference || orderId.slice(0, 8)) + ' — ' + order.channel,
      category: 'Sales — products',
      type: 'revenue',
      amount: Math.round(totalAmount * 100) / 100,
      note: order.note || null
    }])

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
    const { data: order } = await supabase.from('sales_orders').select('sale_items(*)').eq('id', id).single()

    if (order?.sale_items) {
      for (const item of order.sale_items) {
        const { data: prod } = await supabase.from('inventory').select('quantity_on_hand').eq('id', item.product_id).single()
        if (prod) {
          await supabase.from('inventory').update({ quantity_on_hand: parseFloat(prod.quantity_on_hand) + parseFloat(item.quantity) }).eq('id', item.product_id)
        }
      }
    }

    await supabase.from('sales_orders').delete().eq('id', id)
    return res.json({ success: true })
  }

  res.status(405).end()
}
