import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('sales_orders')
      .select(`*, distributors(name, channel), sale_items(*, inventory(product_name, sku))`)
      .order('date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { order, items } = req.body

    const totalAmount = items.reduce((a, i) => a + (parseFloat(i.quantity) * parseFloat(i.unit_price)), 0)

    // Insert order
    const { data: ord, error: ordErr } = await supabase
      .from('sales_orders')
      .insert([{ ...order, total_amount: totalAmount }])
      .select()
    if (ordErr) return res.status(500).json({ error: ordErr.message })

    const orderId = ord[0].id

    // Process line items
    const lineItems = []
    for (const item of items) {
      const qty = parseFloat(item.quantity)
      const unitPrice = parseFloat(item.unit_price)
      const unitCost = parseFloat(item.unit_cost || 0)
      const totalPrice = qty * unitPrice
      const margin = totalPrice - (qty * unitCost)

      lineItems.push({
        order_id: orderId,
        product_id: item.product_id,
        quantity: qty,
        unit_price: unitPrice,
        unit_cost: unitCost,
        total_price: Math.round(totalPrice * 100) / 100,
        margin: Math.round(margin * 100) / 100
      })

      // Deduct from inventory
      const { data: prod } = await supabase
        .from('inventory')
        .select('quantity_on_hand')
        .eq('id', item.product_id)
        .single()

      if (prod) {
        const newQty = Math.max(0, parseFloat(prod.quantity_on_hand) - qty)
        await supabase.from('inventory').update({ quantity_on_hand: newQty }).eq('id', item.product_id)
      }
    }

    const { error: itemsErr } = await supabase.from('sale_items').insert(lineItems)
    if (itemsErr) return res.status(500).json({ error: itemsErr.message })

    // Record revenue transaction
    await supabase.from('transactions').insert([{
      date: order.date,
      description: `Vente ${order.reference || orderId.slice(0, 8)} — ${order.channel}`,
      category: 'Sales — products',
      type: 'revenue',
      amount: Math.round(totalAmount * 100) / 100,
      note: order.note || null
    }])

    return res.json({ success: true, order_id: orderId })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    // Restore inventory before deleting
    const { data: order } = await supabase
      .from('sales_orders')
      .select('sale_items(*)')
      .eq('id', id)
      .single()

    if (order?.sale_items) {
      for (const item of order.sale_items) {
        const { data: prod } = await supabase
          .from('inventory')
          .select('quantity_on_hand')
          .eq('id', item.product_id)
          .single()
        if (prod) {
          await supabase.from('inventory')
            .update({ quantity_on_hand: parseFloat(prod.quantity_on_hand) + parseFloat(item.quantity) })
            .eq('id', item.product_id)
        }
      }
    }

    const { error } = await supabase.from('sales_orders').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  res.status(405).end()
}
