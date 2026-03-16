import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { status, search } = req.query
    let query = supabase
      .from('products')
      .select(`
        *,
        stock:stock_levels(
          qty_on_hand, qty_committed, warehouse_id,
          warehouse:warehouses(name)
        )
      `)
      .order('sku')
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    let result = data || []
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(p =>
        p.sku?.toLowerCase().includes(q) ||
        p.name?.toLowerCase().includes(q) ||
        p.family?.toLowerCase().includes(q)
      )
    }
    return res.status(200).json(result)
  }

  if (req.method === 'POST') {
    const { sku, name, family, description, retail_price, replenishment_lead_days, reorder_point_units, weight_oz, tags, status } = req.body
    if (!sku || !name) return res.status(400).json({ error: 'sku et name obligatoires' })
    const { data, error } = await supabase
      .from('products')
      .insert({ sku, name, family: family || null, description: description || null, retail_price: retail_price || null, replenishment_lead_days: replenishment_lead_days || 30, reorder_point_units: reorder_point_units || 0, weight_oz: weight_oz || null, tags: tags || [], status: status || 'active' })
      .select().single()
    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: `SKU "${sku}" already exists` })
      return res.status(500).json({ error: error.message })
    }
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body
    if (!id) return res.status(400).json({ error: 'id obligatoire' })
    delete updates.created_at
    delete updates.stock
    const { data, error } = await supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
