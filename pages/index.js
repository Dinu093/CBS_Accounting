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
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { transactions, forceInsert } = req.body
    const inserted = []
    const duplicates = []

    for (const tx of transactions) {
      const amount = parseFloat(tx.amount) || 0

      if (!forceInsert) {
        // Check duplicate: same date + amount + category
        const { data: found } = await supabase
          .from('transactions')
          .select('id, date, amount, description, category')
          .eq('date', tx.date)
          .eq('amount', amount)
          .eq('category', tx.category)

        if (found && found.length > 0) {
          duplicates.push({
            newTx: tx,
            existingTx: found[0],
            reason: 'Même date, montant et catégorie'
          })
          continue
        }
      }

      inserted.push({
        date: tx.date,
        description: tx.description,
        category: tx.category,
        type: tx.type || tx.category,
        amount: parseFloat(tx.amount) || 0,
        note: tx.note || null,
      })
    }

    let savedRows = []
    if (inserted.length > 0) {
      const { data, error } = await supabase.from('transactions').insert(inserted).select()
      if (error) return res.status(500).json({ error: error.message })
      savedRows = data
    }

    return res.json({
      inserted: savedRows,
      duplicates,
      message: duplicates.length > 0
        ? savedRows.length + ' transaction(s) enregistrée(s). ' + duplicates.length + ' doublon(s) détecté(s).'
        : savedRows.length + ' transaction(s) enregistrée(s).'
    })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    const { error } = await supabase.from('transactions').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  res.status(405).end()
}
