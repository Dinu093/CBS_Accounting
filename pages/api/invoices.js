import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  // ─── GET ────────────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { status, customer_id } = req.query
    let query = supabase
      .from('invoices')
      .select(`
        *,
        customer:customers(id, name),
        sales_order:sales_orders(order_number, channel),
        lines:invoice_lines(*)
      `)
      .order('created_at', { ascending: false })
    if (status) query = query.eq('status', status)
    if (customer_id) query = query.eq('customer_id', customer_id)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // ─── POST ────────────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      sales_order_id, manual,
      customer_id, issue_date, due_date,
      channel, notes, subtotal, total_due, lines,
    } = req.body

    // ── Création manuelle (depuis la page Invoices) ──────────────────────────
    if (manual) {
      if (!customer_id || !issue_date || !total_due)
        return res.status(400).json({ error: 'customer_id, issue_date, total_due obligatoires' })

      const invoice_number = `CBS-INV-${Date.now()}`

      const { data: invoice, error: invErr } = await supabase
        .from('invoices')
        .insert({
          invoice_number,
          sales_order_id: null,
          customer_id,
          issue_date,
          due_date: due_date || null,
          status: 'draft',
          subtotal: subtotal || total_due,
          tax_amount: 0,
          total_due,
          amount_paid: 0,
          channel: channel || 'wholesale',
          notes: notes || null,
        })
        .select()
        .single()

      if (invErr) return res.status(500).json({ error: invErr.message })

      if (lines?.length) {
        await supabase.from('invoice_lines').insert(
          lines.map(l => ({
            invoice_id: invoice.id,
            product_id: l.product_id || null,
            sku: l.sku || null,
            product_name: l.description || l.product_name || null,
            quantity: l.quantity || 1,
            unit_price: l.unit_price,
            line_total: l.line_total || (l.unit_price * (l.quantity || 1)),
          }))
        )
      }

      return res.status(201).json(invoice)
    }

    // ── Création depuis une commande confirmée ───────────────────────────────
    if (!sales_order_id)
      return res.status(400).json({ error: 'sales_order_id obligatoire' })

    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('*, lines:sales_order_lines(*), customer:customers(*)')
      .eq('id', sales_order_id)
      .single()

    if (orderErr || !order) return res.status(404).json({ error: 'Order non trouvée' })
    if (order.status === 'draft') return res.status(422).json({ error: 'Confirme la commande avant de créer une invoice' })
    if (order.invoice_id) return res.status(422).json({ error: 'Une invoice existe déjà pour cette commande' })

    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })

    const invoice_number = `CBS-INV-${String((count || 0) + 1).padStart(5, '0')}`
    const issue_date_auto = new Date().toISOString().split('T')[0]
    const due = new Date()
    due.setDate(due.getDate() + (order.payment_terms_days || 30))
    const due_date_auto = due.toISOString().split('T')[0]

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number,
        sales_order_id,
        customer_id: order.customer_id,
        issue_date: issue_date_auto,
        due_date: due_date_auto,
        subtotal: order.subtotal,
        tax_amount: order.tax_amount,
        total_due: order.total_amount,
        amount_paid: 0,
        status: 'draft',
        channel: order.channel || 'wholesale',
      })
      .select()
      .single()

    if (invErr) return res.status(500).json({ error: invErr.message })

    const invoiceLines = order.lines.map(l => ({
      invoice_id: invoice.id,
      sales_order_line_id: l.id,
      product_id: l.product_id,
      product_name: l.product_name,
      sku: l.sku,
      quantity: l.quantity_ordered,
      unit_price: l.unit_price,
      line_total: l.line_total,
    }))
    await supabase.from('invoice_lines').insert(invoiceLines)

    await supabase
      .from('sales_orders')
      .update({ invoice_id: invoice.id })
      .eq('id', sales_order_id)

    return res.status(201).json(invoice)
  }

  // ─── PATCH ────────────────────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { id, status, payment_amount } = req.body
    if (!id) return res.status(400).json({ error: 'id obligatoire' })

    const updates = { updated_at: new Date().toISOString() }

    if (payment_amount !== undefined) {
      const { data: inv } = await supabase
        .from('invoices')
        .select('total_due, amount_paid')
        .eq('id', id)
        .single()

      const newPaid = Number(inv.amount_paid) + Number(payment_amount)
      updates.amount_paid = newPaid
      updates.status = newPaid >= Number(inv.total_due) ? 'paid'
        : newPaid > 0 ? 'partially_paid'
        : 'sent'
    } else if (status) {
      updates.status = status
    }

    const { data, error } = await supabase
      .from('invoices')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
