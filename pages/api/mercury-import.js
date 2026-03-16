import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const MERCURY_API_KEY = process.env.MERCURY_API_KEY
  if (!MERCURY_API_KEY)
    return res.status(500).json({ error: 'MERCURY_API_KEY manquant dans les variables d\'environnement' })

  const { days_back = 30, account_id } = req.body

  // Récupère les comptes Mercury si pas d'account_id fourni
  let mercuryAccountId = account_id
  if (!mercuryAccountId) {
    const accountsRes = await fetch('https://api.mercury.com/api/v1/accounts', {
      headers: { Authorization: `Bearer ${MERCURY_API_KEY}` }
    })
    if (!accountsRes.ok) {
      const err = await accountsRes.text()
      return res.status(502).json({ error: `Mercury API error: ${err}` })
    }
    const accountsData = await accountsRes.json()
    const accounts = accountsData.accounts || []
    if (!accounts.length) return res.status(404).json({ error: 'Aucun compte Mercury trouvé' })
    mercuryAccountId = accounts[0].id
  }

  // Calcule la date de début
  const since = new Date()
  since.setDate(since.getDate() - days_back)
  const sinceStr = since.toISOString().split('T')[0]

  // Fetch les transactions Mercury
  const txnRes = await fetch(
    `https://api.mercury.com/api/v1/account/${mercuryAccountId}/transactions?start=${sinceStr}&limit=500`,
    { headers: { Authorization: `Bearer ${MERCURY_API_KEY}` } }
  )

  if (!txnRes.ok) {
    const err = await txnRes.text()
    return res.status(502).json({ error: `Mercury transactions error: ${err}` })
  }

  const txnData = await txnRes.json()
  const transactions = txnData.transactions || []

  const results = { imported: 0, skipped: 0, errors: [] }

  for (const txn of transactions) {
    // Mercury: amount positif = crédit (argent qui rentre), négatif = débit (argent qui sort)
    const amount = txn.kind === 'credit' ? Math.abs(txn.amount) : -Math.abs(txn.amount)

    const { error } = await supabase
      .from('bank_transactions')
      .insert({
        mercury_transaction_id: txn.id,
        transaction_date: txn.postedAt?.split('T')[0] || txn.createdAt?.split('T')[0],
        posted_date: txn.postedAt?.split('T')[0] || null,
        description: txn.bankDescription || txn.externalMemo || 'Mercury transaction',
        amount,
        transaction_type: txn.kind === 'credit' ? 'credit' : 'debit',
        mercury_category: txn.reasonForWire || txn.kind || null,
        mercury_counterparty: txn.counterpartyName || txn.counterpartyNickname || null,
        status: 'unmatched',
      })

    if (error) {
      if (error.code === '23505') {
        results.skipped++ // déjà importé — idempotent
      } else {
        results.errors.push(`${txn.id}: ${error.message}`)
      }
    } else {
      results.imported++
    }
  }

  return res.status(200).json({
    account_id: mercuryAccountId,
    period: `Last ${days_back} days`,
    total_fetched: transactions.length,
    ...results,
  })
}
