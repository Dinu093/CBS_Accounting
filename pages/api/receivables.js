import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('receivables')
      .select('*, sales_orders(reference, channel, date, total_amount)')
      .order('due_date', { ascending: true })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { data, error } = await supabase.from('receivables').insert([req.body]).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }

  if (req.method === 'PUT') {
    const { id, ...updates } = req.body
    if (updates.status === 'paid' && !updates.paid_date) {
      updates.paid_date = new Date().toISOString().split('T')[0]
    }
    const { data, error } = await supabase.from('receivables').update(updates).eq('id', id).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    const { error } = await supabase.from('receivables').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  res.status(405).end()
}
