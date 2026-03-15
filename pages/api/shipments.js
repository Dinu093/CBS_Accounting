import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('shipments')
      .select(`*, shipment_items(*, inventory(product_name, sku))`)
      .order('date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { shipment, items } = req.body

    // Total units in shipment for cost allocation
    const totalUnits = items.reduce((a, i) => a + parseFloat(i.quantity), 0)
    const totalExtra = parseFloat(shipment.freight_cost || 0) +
      parseFloat(shipment.customs_cost || 0) +
      parseFloat(shipment.packaging_cost || 0) +
      parseFloat(shipment.other_cost || 0)

    // Insert shipment
    const { data: ship, error: shipErr } = await supabase
      .from('shipments')
      .insert([{ ...shipment, status: 'confirmed' }])
      .select()
    if (shipErr) return res.status(500).json({ error: shipErr.message })

    const shipId = ship[0].id

    // Process each item - allocate costs proportionally by quantity
    const lineItems = items.map(item => {
      const qty = parseFloat(item.quantity)
      const unitPurchase = parseFloat(item.unit_purchase_price)
      const proportion = totalUnits > 0 ? qty / totalUnits : 0
      const allocatedExtra = totalExtra * proportion
      const totalUnitCost = unitPurchase + (qty > 0 ? allocatedExtra / qty : 0)

      return {
        shipment_id: shipId,
        product_id: item.product_id,
        quantity: qty,
        unit_purchase_price: unitPurchase,
        allocated_freight: parseFloat(shipment.freight_cost || 0) * proportion,
        allocated_customs: parseFloat(shipment.customs_cost || 0) * proportion,
        allocated_packaging: parseFloat(shipment.packaging_cost || 0) * proportion,
        total_unit_cost: Math.round(totalUnitCost * 100) / 100
      }
    })

    const { error: itemsErr } = await supabase.from('shipment_items').insert(lineItems)
    if (itemsErr) return res.status(500).json({ error: itemsErr.message })

    // Update inventory: add stock + update unit cost (weighted average)
    for (const item of lineItems) {
      const { data: prod } = await supabase
        .from('inventory')
        .select('quantity_on_hand, unit_cost')
        .eq('id', item.product_id)
        .single()

      if (prod) {
        const oldQty = parseFloat(prod.quantity_on_hand) || 0
        const oldCost = parseFloat(prod.unit_cost) || 0
        const newQty = oldQty + item.quantity
        const newCost = newQty > 0
          ? ((oldQty * oldCost) + (item.quantity * item.total_unit_cost)) / newQty
          : item.total_unit_cost

        await supabase.from('inventory').update({
          quantity_on_hand: newQty,
          unit_cost: Math.round(newCost * 100) / 100
        }).eq('id', item.product_id)
      }
    }

    // No auto-transaction — payments are recorded via bank import
    return res.json({ success: true, shipment_id: shipId })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query

    // Get shipment items before deleting
    const { data: ship } = await supabase
      .from('shipments')
      .select('*, shipment_items(product_id, quantity, total_unit_cost)')
      .eq('id', id)
      .single()

    // Delete shipment (cascade deletes shipment_items)
    const { error } = await supabase.from('shipments').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })

    // Recalculate stock for each affected product from scratch
    if (ship?.shipment_items) {
      const productIds = [...new Set(ship.shipment_items.map(i => i.product_id))]
      for (const productId of productIds) {
        // Sum all remaining shipment quantities
        const { data: remaining } = await supabase
          .from('shipment_items')
          .select('quantity, total_unit_cost')
          .eq('product_id', productId)
        
        // Sum all sales quantities
        const { data: sold } = await supabase
          .from('sale_items')
          .select('quantity')
          .eq('product_id', productId)

        const totalIn = (remaining || []).reduce((a, i) => a + parseFloat(i.quantity || 0), 0)
        const totalOut = (sold || []).reduce((a, i) => a + parseFloat(i.quantity || 0), 0)
        const newStock = totalIn - totalOut

        // Recalculate weighted average cost from remaining shipments
        const totalCostQty = (remaining || []).reduce((a, i) => a + parseFloat(i.quantity || 0) * parseFloat(i.total_unit_cost || 0), 0)
        const newCost = totalIn > 0 ? totalCostQty / totalIn : 0

        await supabase.from('inventory').update({
          quantity_on_hand: newStock,
          unit_cost: Math.round(newCost * 100) / 100
        }).eq('id', productId)
      }
    }

    return res.json({ success: true })
  }

  res.status(405).end()
}
