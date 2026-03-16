import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { type, status, search } = req.query
    let query = supabase
      .from('customers')
      .select('*, locations:customer_locations(*)')
      .order('name')
    if (type) query = query.eq('type', type)
    if (status) query = query.eq('status', status)
    if (search) query = query.ilike('name', `%${search}%`)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { name, type, email, phone, payment_terms_days, notes } = req.body
    if (!name || !type) return res.status(400).json({ error: 'name et type sont obligatoires' })
    const { data, error } = await supabase
      .from('customers')
      .insert({ name, type, email, phone, payment_terms_days: payment_terms_days || 30, notes })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body
    if (!id) return res.status(400).json({ error: 'id obligatoire' })
    const { data, error } = await supabase
      .from('customers')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
