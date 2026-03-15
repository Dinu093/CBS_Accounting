import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('distributors')
      .select('*, distributor_locations(*), distributor_targets(*)')
      .order('name')
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }
  if (req.method === 'POST') {
    const { locations, ...dist } = req.body
    const { data, error } = await supabase.from('distributors').insert([dist]).select()
    if (error) return res.status(500).json({ error: error.message })
    if (locations?.length) {
      await supabase.from('distributor_locations').insert(locations.map(l => ({ ...l, distributor_id: data[0].id })))
    }
    return res.json(data[0])
  }
  if (req.method === 'PUT') {
    const { id, ...updates } = req.body
    const { data, error } = await supabase.from('distributors').update(updates).eq('id', id).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }
  if (req.method === 'DELETE') {
    const { id } = req.query
    const { error } = await supabase.from('distributors').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }
  res.status(405).end()
}
