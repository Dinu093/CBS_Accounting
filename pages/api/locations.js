import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'POST') {
    const { customer_id, name, address_line1, city, state, zip, contact_name, contact_email, contact_phone, is_shipping_default, notes } = req.body
    if (!customer_id || !name) return res.status(400).json({ error: 'customer_id et name obligatoires' })
    const { data, error } = await supabase
      .from('customer_locations')
      .insert({ customer_id, name, address_line1, city, state, zip, country: 'US', contact_name, contact_email, contact_phone, is_shipping_default: is_shipping_default || false, notes })
      .select().single()
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
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id obligatoire' })
    await supabase.from('customer_locations').update({ is_active: false }).eq('id', id)
    return res.status(200).json({ success: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
