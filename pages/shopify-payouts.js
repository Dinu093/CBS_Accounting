import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const STATUS_COLORS = {
  pending: 'badge-amber',
  paid: 'badge-blue',
  reconciled: 'badge-green',
}

const EMPTY_FORM = {
  shopify_payout_id: '',
  payout_date: new Date().toISOString().split('T')[0],
  gross_amount: '',
  fees_amount: '',
  period_start: '',
  period_end: '',
}

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function ShopifyPayouts() {
  const [payouts, setPayouts] = useState([])
  const [unmatchedTxns, setUnmatchedTxns] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [reconciling, setReconciling] = useState(null) // payout en cours de réconciliation
  const [selectedTxn, setSelectedTxn] = useState('')

  useEffect(() => {
    fetchPayouts()
    fetchUnmatchedTxns()
  }, [])

  async function fetchPayouts() {
    setLoading(true)
    const res = await fetch('/api/shopify-payouts')
    const data = await res.json()
    setPayouts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchUnmatchedTxns() {
    const res = await fetch('/api/bank-transactions?status=unmatched')
    const data = await res.json()
    // Seulement les transactions positives (entrées)
    setUnmatchedTxns(Array.isArray(data) ? data.filter(t => Number(t.amount) > 0) : [])
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/shopify-payouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchPayouts()
    setSaving(false)
  }

  async function handleReconcile(payoutId) {
    if (!selectedTxn) return
    setSaving(true)
    const res = await fetch('/api/shopify-payouts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payout_id: payoutId, bank_transaction_id: selectedTxn })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setReconciling(null)
    setSelectedTxn('')
    fetchPayouts()
    fetchUnmatchedTxns()
    setSaving(false)
  }

  const netRevenue = payouts.reduce((s, p) => s + Number(p.gross_amount || 0), 0)
  const totalFees = payouts.reduce((s, p) => s + Number(p.fees_amount || 0), 0)
  const pending = payouts.filter(p => p.status !== 'reconciled').length

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Shopify Payouts</h1>
          <p className="page-sub">
            {pending} pending &nbsp;·&nbsp;
            Revenue: <strong>{fmt(netRevenue)}</strong> &nbsp;·&nbsp;
            Fees: <strong style={{ color: '#c00' }}>{fmt(totalFees)}</strong>
          </p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm(true); setError(null) }}>
            + Add Payout
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>New Shopify Payout</h3></div>
          <div className="card-body">
            {error && <div style={{ background: '#fee', color: '#c00', padding: '0.5rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="grid-2">
                <div>
                  <label>Shopify Payout ID *</label>
                  <input value={form.shopify_payout_id} onChange={e => setForm({...form, shopify_payout_id: e.target.value})} required placeholder="payout_xxx" />
                </div>
                <div>
                  <label>Payout Date *</label>
                  <input type="date" value={form.payout_date} onChange={e => setForm({...form, payout_date: e.target.value})} required />
                </div>
                <div>
                  <label>Gross Amount ($) *</label>
                  <input type="number" step="0.01" value={form.gross_amount} onChange={e => setForm({...form, gross_amount: e.target.value})} required placeholder="5000.00" />
                </div>
                <div>
                  <label>Fees Amount ($) *</label>
                  <input type="number" step="0.01" value={form.fees_amount} onChange={e => setForm({...form, fees_amount: e.target.value})} required placeholder="150.00" />
                </div>
                <div>
                  <label>Period Start</label>
                  <input type="date" value={form.period_start} onChange={e => setForm({...form, period_start: e.target.value})} />
                </div>
                <div>
                  <label>Period End</label>
                  <input type="date" value={form.period_end} onChange={e => setForm({...form, period_end: e.target.value})} />
                </div>
              </div>
              {form.gross_amount && form.fees_amount && (
                <div style={{ marginTop: '0.75rem', fontSize: 13, color: 'var(--text-2)' }}>
                  Net amount (lands in bank): <strong style={{ color: 'var(--green)' }}>
                    {fmt(Number(form.gross_amount) - Number(form.fees_amount))}
                  </strong>
                </div>
              )}
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add Payout'}</button>
                <button type="button" className="btn-outline" onClick={() => { setShowForm(false); setError(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Panel réconciliation */}
      {reconciling && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--accent)' }}>
          <div className="card-header">
            <div>
              <h3>Reconcile Payout — {reconciling.shopify_payout_id}</h3>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                Net: <strong>{fmt(reconciling.net_amount)}</strong> · Fees: {fmt(reconciling.fees_amount)}
              </div>
            </div>
            <button className="btn-outline" style={{ padding: '0.2rem 0.6rem', fontSize: 12 }} onClick={() => setReconciling(null)}>✕</button>
          </div>
          <div className="card-body">
            {error && <div style={{ background: '#fee', color: '#c00', padding: '0.5rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>{error}</div>}
            <div style={{ marginBottom: '1rem' }}>
              <label>Match with Bank Transaction *</label>
              <select value={selectedTxn} onChange={e => setSelectedTxn(e.target.value)} required>
                <option value="">Select a bank transaction...</option>
                {unmatchedTxns.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.transaction_date} — {t.description} — {fmt(t.amount)}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="btn-primary"
                disabled={!selectedTxn || saving}
                onClick={() => handleReconcile(reconciling.id)}
              >
                {saving ? 'Reconciling...' : '✓ Reconcile'}
              </button>
              <button className="btn-outline" onClick={() => { setReconciling(null); setError(null) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Payout ID</th>
              <th>Date</th>
              <th>Period</th>
              <th style={{ textAlign: 'right' }}>Gross</th>
              <th style={{ textAlign: 'right' }}>Fees</th>
              <th style={{ textAlign: 'right' }}>Net</th>
              <th>Bank Transaction</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : payouts.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No payouts yet.</td></tr>
            ) : payouts.map(p => (
              <tr key={p.id}>
                <td><strong style={{ fontSize: 12 }}>{p.shopify_payout_id}</strong></td>
                <td>{p.payout_date}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {p.period_start && p.period_end ? `${p.period_start} → ${p.period_end}` : '—'}
                </td>
                <td style={{ textAlign: 'right' }}>{fmt(p.gross_amount)}</td>
                <td style={{ textAlign: 'right', color: '#c00' }}>{fmt(p.fees_amount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>{fmt(p.net_amount)}</td>
                <td style={{ fontSize: 12 }}>
                  {p.bank_transaction
                    ? <span className="badge badge-green">{p.bank_transaction.transaction_date}</span>
                    : <span style={{ color: 'var(--text-2)' }}>—</span>
                  }
                </td>
                <td><span className={`badge ${STATUS_COLORS[p.status] || 'badge-gray'}`}>{p.status}</span></td>
                <td>
                  {p.status !== 'reconciled' && (
                    <button
                      className="btn-primary"
                      style={{ padding: '0.2rem 0.6rem', fontSize: 11 }}
                      onClick={() => { setReconciling(p); setSelectedTxn(''); setError(null) }}
                    >
                      Reconcile
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
