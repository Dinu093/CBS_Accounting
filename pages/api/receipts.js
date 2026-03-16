import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('purchase_receipts')
      .select(`
        *,
        supplier:suppliers(id, name),
        warehouse:warehouses(id, name),
        lines:purchase_receipt_lines(*, product:products(id, sku, name, unit_cost_avg))
      `)
      .order('receipt_date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { supplier_id, warehouse_id, receipt_date, notes, lines } = req.body

    if (!supplier_id || !warehouse_id || !receipt_date || !lines?.length)
      return res.status(400).json({ error: 'supplier_id, warehouse_id, receipt_date et lines obligatoires' })

    // Génère le numéro de réception
    const { count } = await supabase
      .from('purchase_receipts')
      .select('*', { count: 'exact', head: true })
    const receipt_number = `CBS-PR-${String((count || 0) + 1).padStart(5, '0')}`

    // Crée le receipt
    const { data: receipt, error: rcptErr } = await supabase
      .from('purchase_receipts')
      .insert({ receipt_number, supplier_id, warehouse_id, receipt_date, notes })
      .select()
      .single()

    if (rcptErr) return res.status(500).json({ error: rcptErr.message })

    // Traite chaque ligne
    for (const line of lines) {
      const landedCost = Number(line.unit_cost)
        + Number(line.freight_cost_alloc || 0)
        + Number(line.customs_cost_alloc || 0)
      const totalValue = landedCost * Number(line.quantity_received)

      // Insère la ligne de receipt
      await supabase.from('purchase_receipt_lines').insert({
        receipt_id: receipt.id,
        product_id: line.product_id,
        quantity_received: line.quantity_received,
        unit_cost: line.unit_cost,
        freight_cost_alloc: line.freight_cost_alloc || 0,
        customs_cost_alloc: line.customs_cost_alloc || 0,
        total_landed_cost: landedCost,
        total_value: totalValue,
      })

      // Crée le mouvement de stock (entrée)
      await supabase.from('inventory_movements').insert({
        product_id: line.product_id,
        warehouse_id,
        movement_type: 'receipt',
        quantity: line.quantity_received,
        unit_cost_snapshot: landedCost,
        total_cost: totalValue,
        reference_type: 'purchase_receipt',
        reference_id: receipt.id,
        notes: `Receipt ${receipt_number}`,
      })

      // Met à jour le coût moyen pondéré (WACOG)
      const { data: product } = await supabase
        .from('products')
        .select('unit_cost_avg')
        .eq('id', line.product_id)
        .single()

      const { data: stock } = await supabase
        .from('stock_levels')
        .select('qty_on_hand')
        .eq('product_id', line.product_id)

      const currentQty = (stock || []).reduce((s, r) => s + r.qty_on_hand, 0)
      const currentCost = Number(product?.unit_cost_avg || 0)
      const newQty = Number(line.quantity_received)

      const newAvg = currentQty + newQty > 0
        ? ((currentQty * currentCost) + (newQty * landedCost)) / (currentQty + newQty)
        : landedCost

      await supabase
        .from('products')
        .update({ unit_cost_avg: newAvg, updated_at: new Date().toISOString() })
        .eq('id', line.product_id)
    }

    return res.status(201).json(receipt)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
