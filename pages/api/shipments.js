import { supabase } from '../../lib/supabase'

async function recalcStock(productIds) {
  for (const pid of productIds) {
    const { data: inItems } = await supabase.from('shipment_items').select('quantity, total_unit_cost').eq('product_id', pid)
    const { data: outItems } = await supabase.from('sale_items').select('quantity').eq('product_id', pid)
    const { data: exitItems } = await supabase.from('product_exit_items').select('quantity').eq('product_id', pid)
    const totalIn = (inItems || []).reduce((a, i) => a + +i.quantity, 0)
    const totalOut = (outItems || []).reduce((a, i) => a + +i.quantity, 0)
    const totalExits = (exitItems || []).reduce((a, i) => a + +i.quantity, 0)
    const qty = totalIn - totalOut - totalExits
    const totalCost = (inItems || []).reduce((a, i) => a + +i.quantity * +i.total_unit_cost, 0)
    const avgCost = totalIn > 0 ? totalCost / totalIn : 0
    await supabase.from('inventory').update({ quantity_on_hand: qty, unit_cost: Math.round(avgCost * 100) / 100 }).eq('id', pid)
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('shipments')
      .select('*, shipment_items(*, inventory(product_name, sku))')
      .order('date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  if (req.method === 'POST') {
    const { shipment, items } = req.body
    const totalProdCost = items.reduce((a, i) => a + +i.quantity * +i.unit_purchase_price, 0)
    const totalCost = totalProdCost + +shipment.freight_cost + +shipment.customs_cost + +shipment.packaging_cost
    const totalUnits = items.reduce((a, i) => a + +i.quantity, 0)

    const { data: ship, error: shipErr } = await supabase.from('shipments').insert([{
      ...shipment,
      total_product_cost: Math.round(totalProdCost * 100) / 100,
      total_cost: Math.round(totalCost * 100) / 100,
    }]).select()
    if (shipErr) return res.status(500).json({ error: shipErr.message })
    const shipId = ship[0].id

    const lineItems = items.map(item => {
      const qty = +item.quantity
      const prodUnit = +item.unit_purchase_price
      const allocatedFreight = totalUnits > 0 ? (+shipment.freight_cost * qty / totalUnits) : 0
      const allocatedCustoms = totalUnits > 0 ? (+shipment.customs_cost * qty / totalUnits) : 0
      const allocatedPkg = totalUnits > 0 ? (+shipment.packaging_cost * qty / totalUnits) : 0
      const totalUnit = prodUnit + (qty > 0 ? (allocatedFreight + allocatedCustoms + allocatedPkg) / qty : 0)
      return {
        shipment_id: shipId, product_id: item.product_id, quantity: qty,
        unit_purchase_price: prodUnit,
        allocated_freight: Math.round(allocatedFreight * 100) / 100,
        allocated_customs: Math.round(allocatedCustoms * 100) / 100,
        total_unit_cost: Math.round(totalUnit * 100) / 100,
      }
    })

    await supabase.from('shipment_items').insert(lineItems)
    await recalcStock(items.map(i => i.product_id))

    // Create AP for unpaid costs
    const apEntries = []
    const ref = shipment.reference || shipId.slice(0, 8)
    if (!shipment.merchandise_paid && totalProdCost > 0) {
      apEntries.push({ vendor: shipment.supplier_name || 'Supplier', amount: totalProdCost, due_date: shipment.merchandise_due_date || null, note: 'Merchandise — ' + ref, status: 'pending', shipment_id: shipId })
    }
    if (!shipment.freight_paid && +shipment.freight_cost > 0) {
      apEntries.push({ vendor: 'Freight / Transport', amount: +shipment.freight_cost, due_date: shipment.freight_due_date || null, note: 'Freight — ' + ref, status: 'pending', shipment_id: shipId })
    }
    if (!shipment.customs_paid && +shipment.customs_cost > 0) {
      apEntries.push({ vendor: 'Customs / Duties', amount: +shipment.customs_cost, due_date: shipment.customs_due_date || null, note: 'Customs — ' + ref, status: 'pending', shipment_id: shipId })
    }
    if (apEntries.length > 0) await supabase.from('payables').insert(apEntries)

    return res.json({ success: true, shipment_id: shipId, ap_created: apEntries.length })
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    const { data: ship } = await supabase.from('shipments').select('*, shipment_items(product_id)').eq('id', id).single()
    const productIds = [...new Set((ship?.shipment_items || []).map(i => i.product_id))]
    await supabase.from('payables').delete().eq('shipment_id', id)
    await supabase.from('shipments').delete().eq('id', id)
    if (productIds.length) await recalcStock(productIds)
    return res.json({ success: true })
  }

  res.status(405).end()
}
