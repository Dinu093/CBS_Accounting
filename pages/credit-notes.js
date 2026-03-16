import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const STATUS_COLORS = {
  draft: 'badge-amber',
  applied: 'badge-green',
  refunded: 'badge-blue',
  void: 'badge-gray',
}

const REASON_LABELS = {
  return: 'Return',
  price_adjustment: 'Price Adjustment',
  damage: 'Damage',
  cancellation: 'Cancellation',
}

const EMPTY_FORM = {
  original_invoice_id: '',
  reason: 'return',
  amount: '',
  notes: '',
}

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function CreditNotes() {
  const [creditNotes, setCreditNotes] = useState([])
  const [invoices, setInvoices] = useState([]) // toutes les invoices pour création
  const [openInvoices, setOpenInvoices] = useState([]) // invoices ouvertes pour application
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [applying, setApplying] = useState(null) // credit note en cours d'application
  const [applyToInvoice, setApplyToInvoice] = useState('')

  useEffect(() => {
    fetchCreditNotes()
    fetchInvoices()
  }, [])

  async function fetchCreditNotes() {
    setLoading(true)
    const res = await fetch('/api/credit-notes')
    const data = await res.json()
    setCreditNotes(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchInvoices() {
    const res = await fetch('/api/invoices')
    const data = await res.json()
    const all = Array.isArray(data) ? data : []
    setInvoices(all)
    setOpenInvoices(all.filter(i => ['sent', 'partially_paid'].includes(i.status)))
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/credit-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchCreditNotes()
    setSaving(false)
  }

  async function handleApply(cnId) {
    if (!applyToInvoice) return
    setSaving(true)
    setError(null)
    const res = await fetch('/api/credit-notes', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: cnId, apply_to_invoice_id: applyToInvoice })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setApplying(null)
    setApplyToInvoice('')
    fetchCreditNotes()
    fetchInvoices()
    setSaving(false)
  }

  const totalDraft = creditNotes
    .filter(cn => cn.status === 'draft')
    .reduce((s, cn) => s + Number(cn.amount), 0)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Credit Notes</h1>
          <p className="page-sub">
            {creditNotes.length} total &nbsp;·&nbsp;
            Pending: <strong style={{ color: '#c00' }}>{fmt(totalDraft)}</strong>
          </p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm(true); setError(null) }}>
            + New Credit Note
          </button>
        </div>
      </div>

      {/* Formulaire création */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>New Credit Note</h3></div>
          <div className="card-body">
            {error && <div style={{ background: '#fee', color: '#c00', padding: '0.5rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="grid-2">
                <div>
                  <label>Original Invoice *</label>
                  <select value={form.original_invoice_id} onChange={e => {
                    const inv = invoices.find(i => i.id === e.target.value)
                    setForm({...form, original_invoice_id: e.target.value, amount: inv ? inv.total_due : ''})
                  }} required>
                    <option value="">Select invoice...</option>
                    {invoices.map(i => (
                      <option key={i.id} value={i.id}>
                        {i.invoice_number} — {i.customer?.name} — {fmt(i.total_due)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Reason *</label>
                  <select value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}>
                    <option value="return">Return</option>
                    <option value="price_adjustment">Price Adjustment</option>
                    <option value="damage">Damage</option>
                    <option value="cancellation">Cancellation</option>
                  </select>
                </div>
                <div>
                  <label>Amount ($) *</label>
                  <input type="number" step="0.01" min="0" value={form.amount}
                    onChange={e => setForm({...form, amount: e.target.value})} required />
                </div>
                <div>
                  <label>Notes</label>
                  <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
                </div>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create Credit Note'}</button>
                <button type="button" className="btn-outline" onClick={() => { setShowForm(false); setError(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Panel application */}
      {applying && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--accent)' }}>
          <div className="card-header">
            <div>
              <h3>Apply {applying.credit_note_number}</h3>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>
                Amount: <strong>{fmt(applying.amount)}</strong> · {REASON_LABELS[applying.reason]}
              </div>
            </div>
            <button className="btn-outline" style={{ padding: '0.2rem 0.6rem', fontSize: 12 }} onClick={() => setApplying(null)}>✕</button>
          </div>
          <div className="card-body">
            {error && <div style={{ background: '#fee', color: '#c00', padding: '0.5rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>{error}</div>}
            <div style={{ marginBottom: '1rem' }}>
              <label>Apply to Invoice *</label>
              <select value={applyToInvoice} onChange={e => setApplyToInvoice(e.target.value)} required>
                <option value="">Select open invoice...</option>
                {openInvoices.map(i => {
                  const balance = (Number(i.total_due) - Number(i.amount_paid)).toFixed(2)
                  return (
                    <option key={i.id} value={i.id}>
                      {i.invoice_number} — {i.customer?.name} — ${balance} due
                    </option>
                  )
                })}
              </select>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-primary" disabled={!applyToInvoice || saving}
                onClick={() => handleApply(applying.id)}>
                {saving ? 'Applying...' : '✓ Apply Credit Note'}
              </button>
              <button className="btn-outline" onClick={() => { setApplying(null); setError(null) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Credit Note #</th>
              <th>Customer</th>
              <th>Original Invoice</th>
              <th>Reason</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th>Applied To</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : creditNotes.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No credit notes yet.</td></tr>
            ) : creditNotes.map(cn => (
              <tr key={cn.id}>
                <td><strong>{cn.credit_note_number}</strong></td>
                <td>{cn.customer?.name || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{cn.original_invoice?.invoice_number}</td>
                <td><span className="badge badge-gray">{REASON_LABELS[cn.reason] || cn.reason}</span></td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#c00' }}>{fmt(cn.amount)}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  {cn.applied_invoice?.invoice_number || '—'}
                </td>
                <td><span className={`badge ${STATUS_COLORS[cn.status] || 'badge-gray'}`}>{cn.status}</span></td>
                <td>
                  {cn.status === 'draft' && (
                    <button
                      className="btn-primary"
                      style={{ padding: '0.2rem 0.6rem', fontSize: 11 }}
                      onClick={() => { setApplying(cn); setApplyToInvoice(''); setError(null) }}
                    >
                      Apply
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
