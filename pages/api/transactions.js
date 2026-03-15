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
      if (!forceInsert) {
        // Duplicate check: same date + amount + description + note (bank ref)
        // Using note field to store bank reference for Mercury imports
        if (tx.date && tx.amount && tx.description) {
          const query = supabase
            .from('transactions')
            .select('id, date, description, amount, note')
            .eq('date', tx.date)
            .eq('amount', +tx.amount)
            .eq('description', tx.description.trim())
          // If we have a bank ref (note), include it in the check
          if (tx.note) {
            const { data: ex } = await query.eq('note', tx.note.trim())
            if (ex?.length > 0) { results.push({ duplicate: true, tx, existing: ex[0] }); continue }
          } else {
            const { data: ex } = await query
            if (ex?.length > 0) { results.push({ duplicate: true, tx, existing: ex[0] }); continue }
          }
        }
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
