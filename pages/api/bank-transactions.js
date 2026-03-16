import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { status } = req.query
    let query = supabase
      .from('bank_transactions')
      .select('*, reconciliations(*, invoice:invoices(invoice_number))')
      .order('transaction_date', { ascending: false })
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // POST — import manuel d'une transaction
  if (req.method === 'POST') {
    const { mercury_transaction_id, transaction_date, description, amount, transaction_type, mercury_counterparty } = req.body
    if (!mercury_transaction_id || !transaction_date || !description || amount === undefined)
      return res.status(400).json({ error: 'mercury_transaction_id, transaction_date, description, amount obligatoires' })

    const { data, error } = await supabase
      .from('bank_transactions')
      .insert({ mercury_transaction_id, transaction_date, description, amount, transaction_type: transaction_type || (amount > 0 ? 'credit' : 'debit'), mercury_counterparty, status: 'unmatched' })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Transaction déjà importée (duplicate)' })
      return res.status(500).json({ error: error.message })
    }
    return res.status(201).json(data)
  }

  // PATCH — exclure ou changer statut
  if (req.method === 'PATCH') {
    const { id, status, excluded_reason } = req.body
    if (!id) return res.status(400).json({ error: 'id obligatoire' })
    const { data, error } = await supabase
      .from('bank_transactions')
      .update({ status, excluded_reason })
      .eq('id', id)
      .select()
      .single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  res.status(405).json({ error: 'Method not allowed' })
}
