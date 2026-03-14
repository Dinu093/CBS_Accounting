import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { transactions } = req.body

    const results = []
    const duplicates = []

    for (const t of transactions) {
      const amount = parseFloat(t.amount) || 0

      // Check for duplicate: same date + amount + category
      const { data: existing } = await supabase
        .from('transactions')
        .select('id, date, amount, description, note')
        .eq('date', t.date)
        .eq('amount', amount)
        .eq('category', t.category)

      if (existing && existing.length > 0) {
        // Also check note/reference similarity if available
        const sameRef = t.note && existing.some(e =>
          e.note && e.note.toLowerCase().trim() === t.note.toLowerCase().trim()
        )
        const sameDesc = existing.some(e =>
          e.description.toLowerCase().trim() === (t.description || '').toLowerCase().trim()
        )

        if (sameRef || sameDesc) {
          duplicates.push({
            new: t,
            existing: existing[0],
            reason: sameRef ? 'Même référence, date et montant' : 'Même description, date et montant'
          })
          continue // skip inserting this one
        }
      }

      const row = {
        date: t.date,
        description: t.description,
        category: t.category,
        type: t.type || t.category,
        amount,
        note: t.note || null,
      }
      results.push(row)
    }

    let inserted = []
    if (results.length > 0) {
      const { data, error } = await supabase.from('transactions').insert(results).select()
      if (error) return res.status(500).json({ error: error.message })
      inserted = data
    }

    return res.json({
      inserted,
      duplicates,
      message: duplicates.length > 0
        ? `${inserted.length} transaction(s) enregistrée(s). ${duplicates.length} doublon(s) détecté(s) et ignoré(s).`
        : `${inserted.length} transaction(s) enregistrée(s).`
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
