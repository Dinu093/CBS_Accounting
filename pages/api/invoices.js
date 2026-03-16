import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

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

  // POST — crée une invoice depuis une order confirmée
  if (req.method === 'POST') {
    const { sales_order_id } = req.body
    if (!sales_order_id) return res.status(400).json({ error: 'sales_order_id obligatoire' })

    // Récupère l'order et ses lignes
    const { data: order, error: orderErr } = await supabase
      .from('sales_orders')
      .select('*, lines:sales_order_lines(*), customer:customers(*)')
      .eq('id', sales_order_id)
      .single()

    if (orderErr || !order) return res.status(404).json({ error: 'Order non trouvée' })
    if (order.status === 'draft') return res.status(422).json({ error: 'Confirme la commande avant de créer une invoice' })
    if (order.invoice_id) return res.status(422).json({ error: 'Une invoice existe déjà pour cette commande' })

    // Génère le numéro
    const { count } = await supabase
      .from('invoices')
      .select('*', { count: 'exact', head: true })
    const invoice_number = `CBS-INV-${String((count || 0) + 1).padStart(5, '0')}`

    // Calcule la date d'échéance
    const issue_date = new Date().toISOString().split('T')[0]
    const due = new Date()
    due.setDate(due.getDate() + (order.payment_terms_days || 30))
    const due_date = due.toISOString().split('T')[0]

    // Crée l'invoice
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .insert({
        invoice_number,
        sales_order_id,
        customer_id: order.customer_id,
        issue_date,
        due_date,
        subtotal: order.subtotal,
        tax_amount: order.tax_amount,
        total_due: order.total_amount,
        amount_paid: 0,
        status: 'draft',
      })
      .select()
      .single()

    if (invErr) return res.status(500).json({ error: invErr.message })

    // Crée les lignes d'invoice
    const invoiceLines = order.lines.map(l => ({
      invoice_id: invoice.id,
      sales_order_line_id: l.id,
      product_id: l.product_id,
      description: l.product_name,
      sku: l.sku,
      quantity: l.quantity_ordered,
      unit_price: l.unit_price,
      line_total: l.line_total,
    }))

    await supabase.from('invoice_lines').insert(invoiceLines)

    // Lie l'invoice à l'order
    await supabase
      .from('sales_orders')
      .update({ invoice_id: invoice.id })
      .eq('id', sales_order_id)

    return res.status(201).json(invoice)
  }

  // PATCH — met à jour le statut ou marque comme payée
  if (req.method === 'PATCH') {
    const { id, status, amount_paid } = req.body
    if (!id) return res.status(400).json({ error: 'id obligatoire' })

    const updates = { updated_at: new Date().toISOString() }
    if (status) updates.status = status
    if (amount_paid !== undefined) {
      // Récupère l'invoice pour calculer le nouveau statut
      const { data: inv } = await supabase.from('invoices').select('total_due').eq('id', id).single()
      updates.amount_paid = amount_paid
      updates.status = amount_paid >= inv.total_due ? 'paid' : amount_paid > 0 ? 'partially_paid' : 'sent'
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
