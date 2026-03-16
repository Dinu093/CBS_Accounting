import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

export default function Reconciliation() {
  const [unmatched, setUnmatched] = useState([])
  const [openInvoices, setOpenInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null) // transaction sélectionnée
  const [invoiceId, setInvoiceId] = useState('')
  const [amountApplied, setAmountApplied] = useState('')
  const [differenceNote, setDifferenceNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  useEffect(() => {
    fetchUnmatched()
    fetchOpenInvoices()
  }, [])

  async function fetchUnmatched() {
    setLoading(true)
    const res = await fetch('/api/bank-transactions?status=unmatched')
    const data = await res.json()
    setUnmatched(Array.isArray(data) ? data.filter(t => t.amount > 0) : []) // seulement les entrées
    setLoading(false)
  }

  async function fetchOpenInvoices() {
    const res = await fetch('/api/invoices?status=sent')
    const data1 = await res.json()
    const res2 = await fetch('/api/invoices?status=partially_paid')
    const data2 = await res2.json()
    const all = [...(Array.isArray(data1) ? data1 : []), ...(Array.isArray(data2) ? data2 : [])]
    setOpenInvoices(all)
  }

  function selectTransaction(txn) {
    setSelected(txn)
    setInvoiceId('')
    setAmountApplied(Math.abs(txn.amount).toFixed(2))
    setDifferenceNote('')
    setError(null)
    setSuccess(null)
  }

  async function handleReconcile(e) {
    e.preventDefault()
    if (!selected || !invoiceId || !amountApplied) return
    setSaving(true)
    setError(null)

    const invoice = openInvoices.find(i => i.id === invoiceId)
    const balance = Number(invoice.total_due) - Number(invoice.amount_paid)
    const applied = parseFloat(amountApplied)
    const diff = Math.abs(Number(selected.amount)) - applied

    const res = await fetch('/api/reconciliations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bank_transaction_id: selected.id,
        matched_invoice_id: invoiceId,
        amount_applied: applied,
        difference_amount: diff,
        difference_note: differenceNote || null,
      })
    })

    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }

    setSuccess(`✓ ${selected.description} réconcilié avec ${invoice.invoice_number}`)
    setSelected(null)
    fetchUnmatched()
    fetchOpenInvoices()
    setSaving(false)
  }

  const selectedInvoice = openInvoices.find(i => i.id === invoiceId)
  const balanceDue = selectedInvoice
    ? (Number(selectedInvoice.total_due) - Number(selectedInvoice.amount_paid)).toFixed(2)
    : null

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Reconciliation</h1>
          <p className="page-sub">{unmatched.length} transaction{unmatched.length !== 1 ? 's' : ''} to match</p>
        </div>
      </div>

      {success && (
        <div style={{ background: '#f0fff4', color: '#276749', padding: '0.75rem 1rem', borderRadius: 8, marginBottom: '1rem', fontSize: 13, border: '1px solid #c6f6d5' }}>
          {success}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

        {/* Colonne gauche — transactions non matchées */}
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: '0.75rem', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Unmatched Transactions (credits)
          </div>
          {loading ? (
            <div style={{ color: 'var(--text-2)', fontSize: 13 }}>Loading...</div>
          ) : unmatched.length === 0 ? (
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
              🎉 All transactions are reconciled
            </div>
          ) : unmatched.map(t => (
            <div
              key={t.id}
              className="card"
              onClick={() => selectTransaction(t)}
              style={{
                marginBottom: '0.75rem',
                cursor: 'pointer',
                border: selected?.id === t.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                transition: 'border 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{t.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                    {t.transaction_date} {t.mercury_counterparty ? `· ${t.mercury_counterparty}` : ''}
                  </div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 16 }}>
                  +${Number(t.amount).toFixed(2)}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Colonne droite — formulaire de match */}
        <div>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: '0.75rem', color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Match to Invoice
          </div>
          {!selected ? (
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
              ← Select a transaction to match
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <div>
                  <div style={{ fontWeight: 600 }}>{selected.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{selected.transaction_date}</div>
                </div>
                <div style={{ fontWeight: 700, color: 'var(--green)', fontSize: 18 }}>
                  +${Number(selected.amount).toFixed(2)}
                </div>
              </div>
              <div className="card-body">
                {error && <div style={{ background: '#fee', color: '#c00', padding: '0.5rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>{error}</div>}
                <form onSubmit={handleReconcile}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label>Invoice *</label>
                    <select value={invoiceId} onChange={e => setInvoiceId(e.target.value)} required>
                      <option value="">Select an open invoice...</option>
                      {openInvoices.map(inv => {
                        const bal = (Number(inv.total_due) - Number(inv.amount_paid)).toFixed(2)
                        return (
                          <option key={inv.id} value={inv.id}>
                            {inv.invoice_number} — {inv.customer?.name} — ${bal} due
                          </option>
                        )
                      })}
                    </select>
                    {selectedInvoice && (
                      <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>
                        Balance due: <strong>${balanceDue}</strong>
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label>Amount Applied ($) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={amountApplied}
                      onChange={e => setAmountApplied(e.target.value)}
                      required
                    />
                    {amountApplied && Number(amountApplied) < Math.abs(Number(selected.amount)) && (
                      <div style={{ fontSize: 12, color: '#c00', marginTop: 4 }}>
                        Difference: ${(Math.abs(Number(selected.amount)) - Number(amountApplied)).toFixed(2)}
                      </div>
                    )}
                  </div>

                  <div style={{ marginBottom: '1rem' }}>
                    <label>Difference Note (optional)</label>
                    <input
                      value={differenceNote}
                      onChange={e => setDifferenceNote(e.target.value)}
                      placeholder="Bank fees, discount..."
                    />
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="submit" className="btn-primary" disabled={saving}>
                      {saving ? 'Matching...' : '✓ Reconcile'}
                    </button>
                    <button type="button" className="btn-outline" onClick={() => setSelected(null)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}
