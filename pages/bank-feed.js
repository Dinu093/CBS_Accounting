import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const STATUS_COLORS = {
  unmatched: 'badge-amber',
  matched: 'badge-blue',
  reconciled: 'badge-green',
  excluded: 'badge-gray',
}

const EMPTY_FORM = {
  mercury_transaction_id: '',
  transaction_date: new Date().toISOString().split('T')[0],
  description: '',
  amount: '',
  mercury_counterparty: '',
}

export default function BankFeed() {
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchTransactions() }, [statusFilter])

  async function fetchTransactions() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.append('status', statusFilter)
    const res = await fetch(`/api/bank-transactions?${params}`)
    const data = await res.json()
    setTransactions(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/bank-transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchTransactions()
    setSaving(false)
  }

  async function excludeTransaction(id) {
    await fetch('/api/bank-transactions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'excluded', excluded_reason: 'Excluded manually' })
    })
    fetchTransactions()
  }

  const unmatched = transactions.filter(t => t.status === 'unmatched').length
  const totalIn = transactions.filter(t => t.amount > 0).reduce((s, t) => s + Number(t.amount), 0)
  const totalOut = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Number(t.amount), 0)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Bank Feed</h1>
          <p className="page-sub">
            {unmatched} unmatched &nbsp;·&nbsp;
            In: <strong style={{ color: 'var(--green)' }}>${totalIn.toFixed(2)}</strong> &nbsp;·&nbsp;
            Out: <strong style={{ color: '#c00' }}>${Math.abs(totalOut).toFixed(2)}</strong>
          </p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm(true); setError(null) }}>
            + Add Transaction
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <select className="chip" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All</option>
          <option value="unmatched">Unmatched</option>
          <option value="reconciled">Reconciled</option>
          <option value="excluded">Excluded</option>
        </select>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>Add Transaction</h3></div>
          <div className="card-body">
            {error && <div style={{ background: '#fee', color: '#c00', padding: '0.5rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div>
                  <label>Mercury Transaction ID *</label>
                  <input value={form.mercury_transaction_id} onChange={e => setForm({...form, mercury_transaction_id: e.target.value})} required placeholder="txn_abc123" />
                </div>
                <div>
                  <label>Date *</label>
                  <input type="date" value={form.transaction_date} onChange={e => setForm({...form, transaction_date: e.target.value})} required />
                </div>
                <div>
                  <label>Description *</label>
                  <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} required />
                </div>
                <div>
                  <label>Amount * (positif = entrée, négatif = sortie)</label>
                  <input type="number" step="0.01" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required placeholder="1500.00" />
                </div>
                <div>
                  <label>Counterparty</label>
                  <input value={form.mercury_counterparty} onChange={e => setForm({...form, mercury_counterparty: e.target.value})} placeholder="Company name" />
                </div>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Add'}</button>
                <button type="button" className="btn-outline" onClick={() => { setShowForm(false); setError(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Counterparty</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Matched To</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : transactions.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No transactions yet.</td></tr>
            ) : transactions.map(t => (
              <tr key={t.id}>
                <td>{t.transaction_date}</td>
                <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{t.mercury_counterparty || '—'}</td>
                <td style={{ fontWeight: 600, color: Number(t.amount) > 0 ? 'var(--green)' : '#c00' }}>
                  {Number(t.amount) > 0 ? '+' : ''}${Number(t.amount).toFixed(2)}
                </td>
                <td><span className={`badge ${STATUS_COLORS[t.status]}`}>{t.status}</span></td>
                <td style={{ fontSize: 12 }}>
                  {t.reconciliations?.length > 0
                    ? t.reconciliations.map(r => r.invoice?.invoice_number).join(', ')
                    : '—'}
                </td>
                <td>
                  {t.status === 'unmatched' && (
                    <button
                      className="btn-outline"
                      style={{ padding: '0.2rem 0.5rem', fontSize: 11, color: '#888' }}
                      onClick={() => excludeTransaction(t.id)}
                    >
                      Exclude
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
