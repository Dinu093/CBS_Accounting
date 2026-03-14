import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { prices, product_id } = req.query

    if (prices) {
      const query = supabase
        .from('distributor_prices')
        .select(`*, distributors(name, channel), inventory(product_name, unit_cost)`)
      if (product_id) query.eq('product_id', product_id)
      const { data, error } = await query
      if (error) return res.status(500).json({ error: error.message })
      return res.json(data)
    }

    const { data, error } = await supabase
      .from('distributors')
      .select('*')
      .order('name')
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'PUT') {
    const { type, id, ...updates } = req.body
    const table = type === 'price' ? 'distributor_prices' : 'distributors'
    const { data, error } = await supabase.from(table).update(updates).eq('id', id).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }

  if (req.method === 'POST') {
    const { type, ...body } = req.body

    if (type === 'distributor') {
      const { data, error } = await supabase.from('distributors').insert([body]).select()
      if (error) return res.status(500).json({ error: error.message })
      return res.json(data[0])
    }

    if (type === 'price') {
      const { data, error } = await supabase
        .from('distributor_prices')
        .upsert([body], { onConflict: 'distributor_id,product_id' })
        .select()
      if (error) return res.status(500).json({ error: error.message })
      return res.json(data[0])
    }
  }

  if (req.method === 'DELETE') {
    const { id, type } = req.query
    const table = type === 'price' ? 'distributor_prices' : 'distributors'
    const { error } = await supabase.from(table).delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  res.status(405).end()
}
