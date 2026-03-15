import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { data, error } = await supabase.from('distributor_locations').insert([req.body]).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }
  if (req.method === 'PUT') {
    const { id, ...updates } = req.body
    const { data, error } = await supabase.from('distributor_locations').update(updates).eq('id', id).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }
  if (req.method === 'DELETE') {
    const { id } = req.query
    const { error } = await supabase.from('distributor_locations').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }
  res.status(405).end()
}
