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
      .from('gifted_items')
      .select('*, gifted_item_lines(*, inventory(product_name, unit_cost))')
      .order('date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { gifted, lines } = req.body
    const { data: g, error: gErr } = await supabase.from('gifted_items').insert([gifted]).select()
    if (gErr) return res.status(500).json({ error: gErr.message })

    const giftedId = g[0].id
    const lineRows = lines.map(l => ({
      gifted_id: giftedId,
      product_id: l.product_id,
      quantity: parseFloat(l.quantity) || 0,
      unit_cost: parseFloat(l.unit_cost) || 0
    }))
    const { error: lErr } = await supabase.from('gifted_item_lines').insert(lineRows)
    if (lErr) return res.status(500).json({ error: lErr.message })

    // Deduct from inventory
    for (const l of lineRows) {
      const { data: prod } = await supabase.from('inventory').select('quantity_on_hand').eq('id', l.product_id).single()
      if (prod) {
        await supabase.from('inventory').update({
          quantity_on_hand: Math.max(0, parseFloat(prod.quantity_on_hand) - l.quantity)
        }).eq('id', l.product_id)
      }
    }

    return res.json({ success: true, id: giftedId })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    const { data: item } = await supabase.from('gifted_items').select('gifted_item_lines(*)').eq('id', id).single()
    if (item?.gifted_item_lines) {
      for (const l of item.gifted_item_lines) {
        const { data: prod } = await supabase.from('inventory').select('quantity_on_hand').eq('id', l.product_id).single()
        if (prod) {
          await supabase.from('inventory').update({
            quantity_on_hand: parseFloat(prod.quantity_on_hand) + parseFloat(l.quantity)
          }).eq('id', l.product_id)
        }
      }
    }
    await supabase.from('gifted_items').delete().eq('id', id)
    return res.json({ success: true })
  }

  if (req.method === 'PUT') {
    const { distributor_id, period, target_amount } = req.body
    const { data, error } = await supabase
      .from('distributor_targets')
      .upsert([{ distributor_id, period, target_amount }], { onConflict: 'distributor_id,period' })
      .select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }

  res.status(405).end()
}
