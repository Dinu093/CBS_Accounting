import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('shopify_payouts')
      .select('*, bank_transaction:bank_transactions(id, description, amount, transaction_date)')
      .order('payout_date', { ascending: false })
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  // POST — import manuel d'un payout Shopify
  if (req.method === 'POST') {
    const { shopify_payout_id, payout_date, gross_amount, fees_amount, period_start, period_end } = req.body
    if (!shopify_payout_id || !payout_date || gross_amount === undefined || fees_amount === undefined)
      return res.status(400).json({ error: 'shopify_payout_id, payout_date, gross_amount, fees_amount obligatoires' })

    const net_amount = Number(gross_amount) - Number(fees_amount)

    const { data, error } = await supabase
      .from('shopify_payouts')
      .insert({ shopify_payout_id, payout_date, gross_amount, fees_amount, net_amount, period_start, period_end, status: 'pending' })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') return res.status(409).json({ error: 'Payout déjà importé' })
      return res.status(500).json({ error: error.message })
    }
    return res.status(201).json(data)
  }

  // PATCH — réconcilier un payout avec une bank transaction
  if (req.method === 'PATCH') {
    const { payout_id, bank_transaction_id } = req.body
    if (!payout_id || !bank_transaction_id)
      return res.status(400).json({ error: 'payout_id et bank_transaction_id obligatoires' })

    // Récupère le payout
    const { data: payout } = await supabase
      .from('shopify_payouts')
      .select('*')
      .eq('id', payout_id)
      .single()
    if (!payout) return res.status(404).json({ error: 'Payout non trouvé' })
    if (payout.status === 'reconciled') return res.status(422).json({ error: 'Payout déjà réconcilié' })

    // Vérifie la bank transaction
    const { data: txn } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('id', bank_transaction_id)
      .single()
    if (!txn) return res.status(404).json({ error: 'Transaction bancaire non trouvée' })

    // Crée la réconciliation
    await supabase.from('reconciliations').insert({
      bank_transaction_id,
      match_type: 'shopify_payout',
      matched_payout_id: payout_id,
      amount_applied: Math.abs(Number(txn.amount)),
      difference_amount: Math.abs(Math.abs(Number(txn.amount)) - Number(payout.net_amount)),
      difference_note: 'Shopify payout reconciliation',
      reconciled_at: new Date().toISOString(),
    })

    // Met à jour le payout
    await supabase
      .from('shopify_payouts')
      .update({ status: 'reconciled', bank_transaction_id })
      .eq('id', payout_id)

    // Met à jour la bank transaction
    await supabase
      .from('bank_transactions')
      .update({ status: 'reconciled' })
      .eq('id', bank_transaction_id)

    // Journal entries :
    // DR Bank / CR Shopify Clearing (net amount)
    // DR Shopify Fees / CR Shopify Clearing (fees)
    const { data: accounts } = await supabase
      .from('chart_of_accounts')
      .select('id, code')
      .in('code', ['2000', '1500', '7000'])
    const accMap = Object.fromEntries(accounts.map(a => [a.code, a.id]))

    // Entrée 1 : DR Bank / CR Shopify Clearing pour le net
    const jeNumber1 = `CBS-JE-SP-${Date.now()}`
    const { data: je1 } = await supabase.from('journal_entries').insert({
      entry_number: jeNumber1,
      entry_date: payout.payout_date,
      status: 'posted',
      source: 'shopify_payout',
      description: `Shopify payout ${payout.shopify_payout_id} — net ${payout.net_amount}`,
      reference_type: 'shopify_payout',
      reference_id: payout_id,
    }).select().single()

    await supabase.from('journal_entry_lines').insert([
      { journal_entry_id: je1.id, account_id: accMap['2000'], debit: Number(payout.net_amount), credit: 0, channel: 'ecommerce' },
      { journal_entry_id: je1.id, account_id: accMap['1500'], debit: 0, credit: Number(payout.net_amount), channel: 'ecommerce' },
    ])

    // Entrée 2 : DR Shopify Fees / CR Shopify Clearing pour les frais
    if (Number(payout.fees_amount) > 0) {
      const jeNumber2 = `CBS-JE-SF-${Date.now()}`
      const { data: je2 } = await supabase.from('journal_entries').insert({
        entry_number: jeNumber2,
        entry_date: payout.payout_date,
        status: 'posted',
        source: 'shopify_payout',
        description: `Shopify fees — payout ${payout.shopify_payout_id}`,
        reference_type: 'shopify_payout',
        reference_id: payout_id,
      }).select().single()

      await supabase.from('journal_entry_lines').insert([
        { journal_entry_id: je2.id, account_id: accMap['7000'], debit: Number(payout.fees_amount), credit: 0, channel: 'ecommerce' },
        { journal_entry_id: je2.id, account_id: accMap['1500'], debit: 0, credit: Number(payout.fees_amount), channel: 'ecommerce' },
      ])
    }

    return res.status(200).json({ message: 'Payout réconcilié', payout_id })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
