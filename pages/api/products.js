import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { status, family, search } = req.query
    let query = supabase
      .from('products')
      .select('*, stock:stock_levels(*)')
      .order('sku')
    if (status) query = query.eq('status', status)
    if (family) query = query.eq('family', family)
    if (search) query = query.or(`sku.ilike.%${search}%,name.ilike.%${search}%`)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { sku, name, family, description, replenishment_lead_days, reorder_point_units } = req.body
    if (!sku || !name) return res.status(400).json({ error: 'sku et name sont obligatoires' })
    const { data, error } = await supabase
      .from('products')
      .insert({ sku, name, family, description, replenishment_lead_days, reorder_point_units, status: 'active' })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body
    if (!id) return res.status(400).json({ error: 'id obligatoire' })
    const { data, error } = await supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
