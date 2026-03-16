import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const {
    customer_id, channel, order_date, order_number_override,
    payment_status,
    notes, lines,
    shopify_order_id, shopify_order_number,
  } = req.body

  if (!customer_id || !order_date || !lines?.length)
    return res.status(400).json({ error: 'customer_id, order_date et lignes obligatoires' })

  const now = new Date().toISOString()

  // Calcule les totaux
  const computedLines = lines.map(l => ({
    ...l,
    unit_price: parseFloat(l.unit_price),
    quantity_ordered: parseInt(l.quantity_ordered),
    line_total: parseFloat(l.unit_price) * parseInt(l.quantity_ordered),
  }))

  const subtotal = computedLines.reduce((s, l) => s + l.line_total, 0)
  const total_amount = subtotal

  // Numéro de commande
  let order_number = order_number_override
  if (!order_number) {
    const prefix = channel === 'ecommerce' ? 'CBS-EC' : 'CBS-WS'
    order_number = `${prefix}-IMP-${Date.now()}`
  }

  // Crée la commande
  const { data: order, error: orderErr } = await supabase
    .from('sales_orders')
    .insert({
      order_number,
      channel: channel || 'wholesale',
      status: 'fulfilled',
      order_date,
      customer_id,
      subtotal,
      tax_amount: 0,
      total_amount,
      notes: notes || 'Imported past order',
      shopify_order_id: shopify_order_id || null,
      shopify_order_number: shopify_order_number || null,
    })
    .select()
    .single()

  if (orderErr) {
    if (orderErr.code === '23505') return res.status(409).json({ error: 'Cette commande est déjà importée' })
    return res.status(500).json({ error: orderErr.message })
  }

  // Récupère le warehouse par défaut (premier disponible)
  const { data: warehouses } = await supabase
    .from('warehouses')
    .select('id')
    .limit(1)
  const defaultWarehouseId = warehouses?.[0]?.id

  // Crée les lignes + mouvements de stock + COGS
  for (const line of computedLines) {
    // Récupère le WACOG du produit si product_id fourni
    let unitCost = 0
    let cogsTotal = 0

    if (line.product_id) {
      const { data: product } = await supabase
        .from('products')
        .select('unit_cost_avg')
        .eq('id', line.product_id)
        .single()
      unitCost = Number(product?.unit_cost_avg || 0)
      cogsTotal = unitCost * line.quantity_ordered
    }

    // Ligne de commande
    await supabase.from('sales_order_lines').insert({
      sales_order_id: order.id,
      product_id: line.product_id || null,
      sku: line.sku || '',
      product_name: line.product_name || '',
      quantity_ordered: line.quantity_ordered,
      quantity_fulfilled: line.quantity_ordered,
      quantity_returned: 0,
      unit_price: line.unit_price,
      line_total: line.line_total,
      cogs_unit_cost: unitCost,
      cogs_total: cogsTotal,
    })

    // Mouvement stock — uniquement si product_id connu et warehouse disponible
    if (line.product_id && defaultWarehouseId) {
      await supabase.from('inventory_movements').insert({
        product_id: line.product_id,
        warehouse_id: defaultWarehouseId,
        movement_type: 'fulfillment',
        quantity: -line.quantity_ordered,
        unit_cost: unitCost,
        reference_type: 'sales_order',
        reference_id: order.id,
        moved_at: order_date + 'T12:00:00Z',
        notes: `Import: ${order_number}`,
      })
    }
  }

  // Crée l'invoice
  const invNumber = `CBS-INV-IMP-${Date.now()}`
  const { data: invoice } = await supabase
    .from('invoices')
    .insert({
      invoice_number: invNumber,
      sales_order_id: order.id,
      customer_id,
      issue_date: order_date,
      due_date: order_date,
      status: payment_status === 'paid' ? 'paid' : 'sent',
      subtotal,
      tax_amount: 0,
      total_due: total_amount,
      amount_paid: payment_status === 'paid' ? total_amount : 0,
      channel: channel || 'wholesale',
    })
    .select().single()

  if (invoice) {
    await supabase.from('invoice_lines').insert(
      computedLines.map(l => ({
        invoice_id: invoice.id,
        product_id: l.product_id || null,
        sku: l.sku || null,
        product_name: l.product_name || '',
        quantity: l.quantity_ordered,
        unit_price: l.unit_price,
        line_total: l.line_total,
      }))
    )
  }

  return res.status(201).json({ order, invoice })
}
