import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('purchase_receipts')
      .select(`
        *,
        supplier:suppliers(id, name),
        warehouse:warehouses(id, name),
        lines:purchase_receipt_lines(*, product:products(id, sku, name))
      `)
      .order('created_at', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const {
      supplier_id, warehouse_id, received_date, reference_number,
      notes, lines, payment_terms_days, tariff_amount
    } = req.body

    if (!warehouse_id) return res.status(400).json({ error: 'warehouse_id obligatoire' })
    if (!lines?.length) return res.status(400).json({ error: 'Au moins une ligne obligatoire' })

    // Génère le numéro de receipt
    const { count } = await supabase
      .from('purchase_receipts')
      .select('*', { count: 'exact', head: true })
    const receipt_number = `CBS-PR-${String((count || 0) + 1).padStart(5, '0')}`

    // Date d'échéance paiement fournisseur
    const receiptDate = received_date || new Date().toISOString().split('T')[0]
    const paymentDue = new Date(receiptDate)
    paymentDue.setDate(paymentDue.getDate() + (payment_terms_days || 60))

    // Crée le receipt
    const { data: receipt, error: receiptErr } = await supabase
      .from('purchase_receipts')
      .insert({
        receipt_number,
        supplier_id: supplier_id || null,
        warehouse_id,
        receipt_date: receiptDate,
        reference_number: reference_number || null,
        notes: notes || null,
        payment_status: 'unpaid',
        payment_terms_days: payment_terms_days || 60,
        payment_due_date: paymentDue.toISOString().split('T')[0],
        tariff_amount: tariff_amount || 0,
      })
      .select()
      .single()

    if (receiptErr) return res.status(500).json({ error: receiptErr.message })

    // Crée les lignes + mouvements de stock + WACOG
    for (const line of lines) {
      const qty = parseInt(line.quantity)
      const unitCost = parseFloat(line.unit_cost)
      const freight = parseFloat(line.freight_cost) || 0
      const customs = parseFloat(line.customs_cost) || 0
      const landedUnitCost = unitCost + freight + customs
      const totalLanded = landedUnitCost * qty
      const totalValue = unitCost * qty

      // Insère la ligne
      await supabase.from('purchase_receipt_lines').insert({
        receipt_id: receipt.id,
        product_id: line.product_id,
        quantity_received: qty,
        unit_cost: unitCost,
        freight_cost_alloc: freight,
        customs_cost_alloc: customs,
        total_landed_cost: totalLanded,
        total_value: totalValue,
      })

      // Mouvement de stock — le trigger met à jour stock_levels automatiquement
      await supabase.from('inventory_movements').insert({
        product_id: line.product_id,
        warehouse_id,
        movement_type: 'receipt',
        quantity: qty,
        unit_cost: landedUnitCost,
        reference_type: 'purchase_receipt',
        reference_id: receipt.id,
        moved_at: receiptDate + 'T12:00:00Z',
        notes: `Receipt ${receipt_number}`,
      })

      // Recalcule le WACOG (Weighted Average Cost of Goods)
      const { data: currentStock } = await supabase
        .from('stock_levels')
        .select('qty_on_hand')
        .eq('product_id', line.product_id)
        .eq('warehouse_id', warehouse_id)
        .single()

      const { data: product } = await supabase
        .from('products')
        .select('unit_cost_avg')
        .eq('id', line.product_id)
        .single()

      if (product) {
        const existingQty = Math.max(0, (currentStock?.qty_on_hand || 0))
        const existingCost = Number(product.unit_cost_avg || 0)
        const newTotalQty = existingQty + qty
        const newWacog = newTotalQty > 0
          ? ((existingQty * existingCost) + (qty * landedUnitCost)) / newTotalQty
          : landedUnitCost

        await supabase
          .from('products')
          .update({ unit_cost_avg: Math.round(newWacog * 10000) / 10000 })
          .eq('id', line.product_id)
      }
    }

    return res.status(201).json(receipt)
  }

  // PATCH — marquer un receipt comme payé
  if (req.method === 'PATCH') {
    const { id, payment_status } = req.body
    if (!id) return res.status(400).json({ error: 'id obligatoire' })
    const updates = {
      payment_status: payment_status || 'paid',
      paid_at: payment_status === 'paid' ? new Date().toISOString() : null,
    }
    const { data, error } = await supabase
      .from('purchase_receipts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
