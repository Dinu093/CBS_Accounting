import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// POST /api/sync — removes orphan revenue transactions that have no matching sale order
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
  if (req.method !== 'POST') return res.status(405).end()

  try {
    // Get all revenue transactions
    const { data: revTxs } = await supabase
      .from('transactions')
      .select('id, note, description')
      .eq('category', 'Sales — products')

    // Get all sales order IDs
    const { data: orders } = await supabase
      .from('sales_orders')
      .select('id, reference')

    const orderIds = new Set((orders || []).map(o => o.id))
    const orderRefs = new Set((orders || []).filter(o => o.reference).map(o => o.reference))

    // Find orphan transactions (note contains an order ID that no longer exists)
    const orphans = (revTxs || []).filter(tx => {
      // If note is a UUID (order ID) and that order no longer exists
      if (tx.note && tx.note.match(/^[0-9a-f-]{36}$/)) {
        return !orderIds.has(tx.note)
      }
      return false
    })

    let deleted = 0
    for (const tx of orphans) {
      await supabase.from('transactions').delete().eq('id', tx.id)
      deleted++
    }

    return res.json({ 
      success: true, 
      deleted,
      message: deleted > 0 ? `Removed ${deleted} orphan transaction(s)` : 'Already in sync'
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
