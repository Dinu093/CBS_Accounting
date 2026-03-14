import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { distributor_id } = req.query
    let query = supabase.from('distributor_locations').select('*').order('is_primary', { ascending: false }).order('name')
    if (distributor_id) query = query.eq('distributor_id', distributor_id)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

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
