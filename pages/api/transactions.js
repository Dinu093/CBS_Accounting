import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase.from('transactions').select('*').order('date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }
  if (req.method === 'POST') {
    const { transactions, forceInsert } = req.body
    const results = []
    for (const tx of transactions) {
      if (!forceInsert && tx.description) {
        const { data: ex } = await supabase.from('transactions').select('id').eq('date', tx.date).eq('amount', +tx.amount).eq('description', tx.description)
        if (ex?.length > 0) { results.push({ duplicate: true, tx }); continue }
      }
      const { data, error } = await supabase.from('transactions').insert([tx]).select()
      if (error) results.push({ error: error.message, tx })
      else results.push({ success: true, data: data[0] })
    }
    return res.json({ results, duplicates: results.filter(r => r.duplicate) })
  }
  if (req.method === 'PUT') {
    const { id, ...updates } = req.body
    const { data, error } = await supabase.from('transactions').update(updates).eq('id', id).select()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data[0])
  }
  if (req.method === 'DELETE') {
    const { id } = req.query
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }
  res.status(405).end()
}
