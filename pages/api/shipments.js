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

    // Record as transaction
    const totalValue = lineItems.reduce((a, i) => a + (i.quantity * i.unit_purchase_price), 0)
    await supabase.from('transactions').insert([{
      date: shipment.date,
      description: `Shipment ${shipment.reference} — ${items.length} produit(s)`,
      category: 'Inventory / product cost',
      type: 'cogs',
      amount: totalValue + totalExtra,
      note: shipment.supplier || null
    }])

    return res.json({ success: true, shipment_id: shipId })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    const { error } = await supabase.from('shipments').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.json({ success: true })
  }

  res.status(405).end()
}
