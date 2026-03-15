import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('product_exits').select('*, product_exit_items(*, inventory(product_name, sku))').order('date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }
  if (req.method === 'POST') {
    const { exit: exitData, items } = req.body
    const totalCost = items.reduce((a, i) => a + +i.quantity * +i.unit_cost, 0)
    const { data: ex, error } = await supabase.from('product_exits').insert([exitData]).select()
    if (error) return res.status(500).json({ error: error.message })
    const exitId = ex[0].id
    const lineItems = items.map(i => ({ exit_id: exitId, product_id: i.product_id, quantity: +i.quantity, unit_cost: +i.unit_cost, total_cost: Math.round(+i.quantity * +i.unit_cost * 100) / 100 }))
    await supabase.from('product_exit_items').insert(lineItems)
    // Deduct stock
    for (const item of items) {
      const { data: prod } = await supabase.from('inventory').select('quantity_on_hand').eq('id', item.product_id).single()
      if (prod) await supabase.from('inventory').update({ quantity_on_hand: +prod.quantity_on_hand - +item.quantity }).eq('id', item.product_id)
    }
    // Record transaction
    const catMap = { gifted: 'Gifted products', sample: 'Inventory / product cost', loss: 'Other expense', internal: 'Other expense' }
    await supabase.from('transactions').insert([{ date: exitData.date, description: exitData.exit_type + ' — ' + (exitData.recipient || exitData.campaign || exitData.event || ''), category: catMap[exitData.exit_type] || 'Other expense', type: 'opex', amount: Math.round(totalCost * 100) / 100, note: exitId }])
    return res.json({ success: true, exit_id: exitId })
  }
  if (req.method === 'DELETE') {
    const { id } = req.query
    const { data: ex } = await supabase.from('product_exits').select('*, product_exit_items(*)').eq('id', id).single()
    for (const item of (ex?.product_exit_items || [])) {
      const { data: prod } = await supabase.from('inventory').select('quantity_on_hand').eq('id', item.product_id).single()
      if (prod) await supabase.from('inventory').update({ quantity_on_hand: +prod.quantity_on_hand + +item.quantity }).eq('id', item.product_id)
    }
    await supabase.from('transactions').delete().eq('note', id)
    await supabase.from('product_exits').delete().eq('id', id)
    return res.json({ success: true })
  }
  res.status(405).end()
}
