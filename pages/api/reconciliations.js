import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'POST') {
    const { bank_transaction_id, matched_invoice_id, amount_applied, difference_amount, difference_note, notes } = req.body

    if (!bank_transaction_id || !matched_invoice_id || !amount_applied)
      return res.status(400).json({ error: 'bank_transaction_id, matched_invoice_id, amount_applied obligatoires' })

    // Vérifie la transaction bancaire
    const { data: txn } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('id', bank_transaction_id)
      .single()

    if (!txn) return res.status(404).json({ error: 'Transaction bancaire non trouvée' })
    if (txn.status === 'reconciled') return res.status(422).json({ error: 'Transaction déjà réconciliée' })

    // Vérifie l'invoice
    const { data: invoice } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', matched_invoice_id)
      .single()

    if (!invoice) return res.status(404).json({ error: 'Invoice non trouvée' })
    if (invoice.status === 'void') return res.status(422).json({ error: 'Impossible de réconcilier une invoice void' })

    const balanceDue = Number(invoice.total_due) - Number(invoice.amount_paid)
    if (Number(amount_applied) > balanceDue)
      return res.status(422).json({ error: `Montant ${amount_applied} dépasse le solde de ${balanceDue.toFixed(2)}` })

    // Crée la réconciliation
    const { data: recon, error: reconErr } = await supabase
      .from('reconciliations')
      .insert({
        bank_transaction_id,
        match_type: 'invoice',
        matched_invoice_id,
        amount_applied: Number(amount_applied),
        difference_amount: Number(difference_amount || 0),
        difference_note,
        notes,
        reconciled_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (reconErr) return res.status(500).json({ error: reconErr.message })

    // Met à jour l'invoice (montant payé)
    const newPaid = Number(invoice.amount_paid) + Number(amount_applied)
    const newStatus = newPaid >= Number(invoice.total_due) ? 'paid' : 'partially_paid'
    await supabase
      .from('invoices')
      .update({ amount_paid: newPaid, status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', matched_invoice_id)

    // Met à jour la transaction bancaire
    await supabase
      .from('bank_transactions')
      .update({ status: 'reconciled' })
      .eq('id', bank_transaction_id)

    return res.status(201).json(recon)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
