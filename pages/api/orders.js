import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  // ─── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { status, channel, customer_id, limit, search } = req.query

    let query = supabase
      .from('sales_orders')
      .select(`
        *,
        customer:customers(id, name, type, email, discount_pct),
        ship_to:customer_locations(id, name, address_line1, city, state, zip),
        price_list:price_lists(id, name),
        lines:sales_order_lines(
          id, sku, product_name,
          quantity_ordered, quantity_fulfilled, quantity_returned,
          unit_price, line_total, cogs_unit_cost, cogs_total, notes
        )
      `)
      .order('order_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (status)      query = query.eq('status', status)
    if (channel)     query = query.eq('channel', channel)
    if (customer_id) query = query.eq('customer_id', customer_id)
    if (limit)       query = query.limit(parseInt(limit))

    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })

    // Filtre search côté serveur sur order_number ou nom client
    let result = data || []
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(o =>
        o.order_number?.toLowerCase().includes(q) ||
        o.customer?.name?.toLowerCase().includes(q) ||
        o.shopify_order_number?.toLowerCase().includes(q)
      )
    }

    return res.status(200).json(result)
  }

  // ─── POST — créer une commande wholesale ────────────────────────────────────
  if (req.method === 'POST') {
    const {
      customer_id, ship_to_location_id, price_list_id,
      order_date, payment_terms_days, notes, lines,
    } = req.body

    if (!customer_id || !lines?.length)
      return res.status(400).json({ error: 'customer_id et au moins une ligne obligatoires' })

    // Récupère le customer pour appliquer la remise
    const { data: customer } = await supabase
      .from('customers')
      .select('discount_pct, payment_terms_days')
      .eq('id', customer_id)
      .single()

    const discount = Number(customer?.discount_pct || 0)

    // Calcule les totaux
    const computedLines = lines.map(l => {
      const unitPrice = Number(l.unit_price) * (1 - discount / 100)
      const lineTotal = unitPrice * Number(l.quantity_ordered)
      return { ...l, unit_price: unitPrice, line_total: lineTotal }
    })

    const subtotal = computedLines.reduce((s, l) => s + l.line_total, 0)
    const total_amount = subtotal // pas de tax wholesale pour l'instant

    // Génère le numéro de commande
    const { data: seqRow } = await supabase.rpc('nextval', { seq: 'seq_sales_order_wholesale' }).single()
    const order_number = `CBS-WS-${String(seqRow || Date.now()).padStart(5, '0')}`

    // Crée la commande
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .insert({
        order_number,
        channel: 'wholesale',
        status: 'draft',
        order_date: order_date || new Date().toISOString().split('T')[0],
        customer_id,
        ship_to_location_id: ship_to_location_id || null,
        price_list_id: price_list_id || null,
        subtotal,
        tax_amount: 0,
        total_amount,
        payment_terms_days: payment_terms_days || customer?.payment_terms_days || 30,
        notes: notes || null,
      })
      .select()
      .single()

    if (orderErr) return res.status(500).json({ error: orderErr.message })

    // Crée les lignes
    const lineRows = computedLines.map(l => ({
      sales_order_id: order.id,
      product_id: l.product_id,
      sku: l.sku,
      product_name: l.product_name,
      quantity_ordered: l.quantity_ordered,
      quantity_fulfilled: 0,
      quantity_returned: 0,
      unit_price: l.unit_price,
      line_total: l.line_total,
      notes: l.notes || null,
    }))

    const { error: linesErr } = await supabase.from('sales_order_lines').insert(lineRows)
    if (linesErr) return res.status(500).json({ error: linesErr.message })

    return res.status(201).json(order)
  }

  // ─── PATCH — mise à jour du statut (confirm, fulfill, cancel) ───────────────
  if (req.method === 'PATCH') {
    const { id, status, cancelled_reason } = req.body
    if (!id || !status) return res.status(400).json({ error: 'id et status obligatoires' })

    // Récupère l'ordre courant
    const { data: order } = await supabase
      .from('sales_orders')
      .select('*, lines:sales_order_lines(*), customer:customers(id)')
      .eq('id', id)
      .single()

    if (!order) return res.status(404).json({ error: 'Commande non trouvée' })

    const now = new Date().toISOString()
    const updates = { status, updated_at: now }
    if (status === 'cancelled') {
      updates.cancelled_at = now
      updates.cancelled_reason = cancelled_reason || null
    }

    // ── Confirm → alloue le stock + crée l'invoice ──────────────────────────
    if (status === 'confirmed' && order.status === 'draft') {
      for (const line of order.lines) {
        await supabase.from('inventory_movements').insert({
          product_id: line.product_id,
          movement_type: 'allocation',
          quantity: -line.quantity_ordered,
          reference_type: 'sales_order',
          reference_id: order.id,
          moved_at: now,
        })
      }

      // Génère une invoice
      const { data: invSeq } = await supabase.rpc('nextval', { seq: 'seq_invoice' }).single()
      const invoice_number = `CBS-INV-${String(invSeq || Date.now()).padStart(5, '0')}`
      const due_date = new Date()
      due_date.setDate(due_date.getDate() + (order.payment_terms_days || 30))

      const { data: invoice } = await supabase
        .from('invoices')
        .insert({
          invoice_number,
          sales_order_id: order.id,
          customer_id: order.customer_id,
          issue_date: now.split('T')[0],
          due_date: due_date.toISOString().split('T')[0],
          status: 'draft',
          subtotal: order.subtotal,
          tax_amount: order.tax_amount,
          total_due: order.total_amount,
          amount_paid: 0,
          channel: 'wholesale',
        })
        .select()
        .single()

      if (invoice) {
        updates.invoice_id = invoice.id

        // Lignes d'invoice
        const invLines = order.lines.map(l => ({
          invoice_id: invoice.id,
          sales_order_line_id: l.id,
          product_id: l.product_id,
          sku: l.sku,
          product_name: l.product_name,
          quantity: l.quantity_ordered,
          unit_price: l.unit_price,
          line_total: l.line_total,
        }))
        await supabase.from('invoice_lines').insert(invLines)
      }
    }

    // ── Fulfill → décrémente le stock réel + COGS ────────────────────────────
    if (status === 'fulfilled' && ['confirmed', 'partially_fulfilled'].includes(order.status)) {
      for (const line of order.lines) {
        const qtyToFulfill = line.quantity_ordered - line.quantity_fulfilled
        if (qtyToFulfill <= 0) continue

        // Récupère le WACOG actuel
        const { data: product } = await supabase
          .from('products')
          .select('unit_cost_avg')
          .eq('id', line.product_id)
          .single()

        const unitCost = Number(product?.unit_cost_avg || 0)

        // Mouvement stock : fulfillment
        await supabase.from('inventory_movements').insert({
          product_id: line.product_id,
          movement_type: 'fulfillment',
          quantity: -qtyToFulfill,
          reference_type: 'sales_order',
          reference_id: order.id,
          unit_cost: unitCost,
          moved_at: now,
        })

        // Update COGS sur la ligne
        await supabase
          .from('sales_order_lines')
          .update({
            quantity_fulfilled: line.quantity_ordered,
            cogs_unit_cost: unitCost,
            cogs_total: unitCost * qtyToFulfill,
          })
          .eq('id', line.id)
      }

      // Journal entry : DR COGS / CR Inventory
      const totalCogs = order.lines.reduce((s, l) => {
        const { data: p } = supabase.from('products').select('unit_cost_avg').eq('id', l.product_id)
        return s + (Number(p?.[0]?.unit_cost_avg || 0) * l.quantity_ordered)
      }, 0)

      if (totalCogs > 0) {
        const { data: accounts } = await supabase
          .from('chart_of_accounts')
          .select('id, code')
          .in('code', ['5000', '1200'])

        const accMap = Object.fromEntries((accounts || []).map(a => [a.code, a.id]))
        const jeNumber = `CBS-JE-COGS-${Date.now()}`

        const { data: je } = await supabase.from('journal_entries').insert({
          entry_number: jeNumber,
          entry_date: now.split('T')[0],
          status: 'posted',
          source: 'fulfillment',
          description: `COGS — Order ${order.order_number}`,
          reference_type: 'sales_order',
          reference_id: order.id,
        }).select().single()

        if (je) {
          await supabase.from('journal_entry_lines').insert([
            { journal_entry_id: je.id, account_id: accMap['5000'], debit: totalCogs, credit: 0 },
            { journal_entry_id: je.id, account_id: accMap['1200'], debit: 0, credit: totalCogs },
          ])
        }
      }
    }

    // ── Cancel → libère le stock alloué ─────────────────────────────────────
    if (status === 'cancelled' && order.status === 'confirmed') {
      for (const line of order.lines) {
        await supabase.from('inventory_movements').insert({
          product_id: line.product_id,
          movement_type: 'allocation_release',
          quantity: line.quantity_ordered,
          reference_type: 'sales_order',
          reference_id: order.id,
          moved_at: now,
        })
      }
    }

    // Applique les updates sur la commande
    const { data, error } = await supabase
      .from('sales_orders')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
