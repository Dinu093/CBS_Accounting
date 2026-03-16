import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { customer_id } = req.query
    let query = supabase
      .from('customer_locations')
      .select('*, customer:customers(id, name)')
      .eq('is_active', true)
      .order('name')
    if (customer_id) query = query.eq('customer_id', customer_id)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { customer_id, name, address_line1, city, state, zip, country, is_billing_address, is_shipping_default } = req.body
    if (!customer_id || !name) return res.status(400).json({ error: 'customer_id et name obligatoires' })
    const { data, error } = await supabase
      .from('customer_locations')
      .insert({ customer_id, name, address_line1, city, state, zip, country: country || 'US', is_billing_address: is_billing_address || false, is_shipping_default: is_shipping_default || false })
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body
    if (!id) return res.status(400).json({ error: 'id obligatoire' })
    const { data, error } = await supabase
      .from('customer_locations')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id obligatoire' })
    const { error } = await supabase
      .from('customer_locations')
      .update({ is_active: false })
      .eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
