import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { reorder_only, warehouse_id } = req.query
    let query = supabase.from('v_stock_overview').select('*').order('sku')
    if (warehouse_id) query = query.eq('warehouse_id', warehouse_id)
    if (reorder_only === 'true') query = query.eq('reorder_alert', true)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }
  res.status(405).json({ error: 'Method not allowed' })
}
