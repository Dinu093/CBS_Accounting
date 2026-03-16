import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { customer_id, status } = req.query
    let query = supabase
      .from('credit_notes')
      .select(`
        *,
        customer:customers(id, name),
        original_invoice:invoices!credit_notes_original_invoice_id_fkey(invoice_number, total_due),
        applied_invoice:invoices!credit_notes_applied_to_invoice_id_fkey(invoice_number)
      `)
      .order('created_at', { ascending: false })
    if (customer_id) query = query.eq('customer_id', customer_id)
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { original_invoice_id, reason, amount, notes } = req.body
    if (!original_invoice_id || !reason || !amount)
      return res.status(400).json({ error: 'original_invoice_id, reason, amount obligatoires' })

    // Récupère l'invoice originale
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*, customer_id')
      .eq('id', original_invoice_id)
      .single()
    if (!invoice) return res.status(404).json({ error: 'Invoice non trouvée' })

    if (Number(amount) > Number(invoice.total_due))
      return res.status(422).json({ error: `Le montant ne peut pas dépasser ${invoice.total_due}` })

    const { count } = await supabase
      .from('credit_notes')
      .select('*', { count: 'exact', head: true })
    const credit_note_number = `CBS-CN-${String((count || 0) + 1).padStart(5, '0')}`

    const { data, error } = await supabase
      .from('credit_notes')
      .insert({
        credit_note_number,
        original_invoice_id,
        customer_id: invoice.customer_id,
        reason,
        amount,
        status: 'draft',
        notes,
      })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  // PATCH — appliquer un avoir sur une invoice ouverte
  if (req.method === 'PATCH') {
    const { id, apply_to_invoice_id } = req.body
    if (!id || !apply_to_invoice_id)
      return res.status(400).json({ error: 'id et apply_to_invoice_id obligatoires' })

    const { data: cn } = await supabase
      .from('credit_notes')
      .select('*')
      .eq('id', id)
      .single()
    if (!cn) return res.status(404).json({ error: 'Credit note non trouvée' })
    if (cn.status !== 'draft') return res.status(422).json({ error: 'Credit note déjà appliquée' })

    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', apply_to_invoice_id)
      .single()
    if (!invoice) return res.status(404).json({ error: 'Invoice cible non trouvée' })

    // Réduit le montant dû sur l'invoice cible
    const newPaid = Math.min(Number(invoice.amount_paid) + Number(cn.amount), Number(invoice.total_due))
    const newStatus = newPaid >= Number(invoice.total_due) ? 'paid' : 'partially_paid'

    await supabase
      .from('invoices')
      .update({ amount_paid: newPaid, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', apply_to_invoice_id)

    const { data, error } = await supabase
      .from('credit_notes')
      .update({ status: 'applied', applied_to_invoice_id: apply_to_invoice_id, applied_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
