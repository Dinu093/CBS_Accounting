import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('price_lists')
      .select('*, items:price_list_items(*, product:products(id, sku, name, unit_cost_avg))')
      .eq('is_active', true)
      .order('name')
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { name, type, effective_date, is_default, items } = req.body
    if (!name || !type || !effective_date)
      return res.status(400).json({ error: 'name, type et effective_date obligatoires' })

    // Si is_default, retire le default des autres
    if (is_default) {
      await supabase
        .from('price_lists')
        .update({ is_default: false })
        .eq('type', type)
    }

    const { data: priceList, error: plErr } = await supabase
      .from('price_lists')
      .insert({ name, type, effective_date, is_default: is_default || false, currency: 'USD' })
      .select()
      .single()

    if (plErr) return res.status(500).json({ error: plErr.message })

    // Insère les items si fournis
    if (items?.length) {
      const rows = items.map(i => ({
        price_list_id: priceList.id,
        product_id: i.product_id,
        unit_price: i.unit_price,
      }))
      const { error: itemsErr } = await supabase.from('price_list_items').insert(rows)
      if (itemsErr) return res.status(500).json({ error: itemsErr.message })
    }

    return res.status(201).json(priceList)
  }

  // PATCH — ajouter/mettre à jour un prix dans une liste
  if (req.method === 'PATCH') {
    const { price_list_id, product_id, unit_price } = req.body
    if (!price_list_id || !product_id || unit_price === undefined)
      return res.status(400).json({ error: 'price_list_id, product_id et unit_price obligatoires' })

    const { data, error } = await supabase
      .from('price_list_items')
      .upsert({ price_list_id, product_id, unit_price }, { onConflict: 'price_list_id,product_id' })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
