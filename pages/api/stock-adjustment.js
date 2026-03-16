import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { product_id, warehouse_id, quantity, notes } = req.body
  if (!product_id || !warehouse_id || !quantity)
    return res.status(400).json({ error: 'product_id, warehouse_id, quantity obligatoires' })

  const qty = parseInt(quantity)
  if (qty === 0) return res.status(400).json({ error: 'Quantity cannot be zero' })

  const { error } = await supabase.from('inventory_movements').insert({
    product_id,
    warehouse_id,
    movement_type: 'adjustment',
    quantity: qty,
    reference_type: 'adjustment',
    reference_id: product_id, // self-reference pour les adjustments
    notes: notes || 'Manual adjustment',
    moved_at: new Date().toISOString(),
  })

  if (error) return res.status(500).json({ error: error.message })
  return res.status(201).json({ success: true })
}
