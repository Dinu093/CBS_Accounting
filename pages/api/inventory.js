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
      .from('inventory')
      .select('*')
      .order('product_name')
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const product = req.body
    const { data, error } = await supabase.from('inventory').insert([product]).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body
    const { data, error } = await supabase.from('inventory').update(updates).eq('id', id).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    const { error } = await supabase.from('inventory').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  res.status(405).end()
}
