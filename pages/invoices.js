import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const STATUS_COLORS = {
  draft: 'badge-gray',
  sent: 'badge-blue',
  partially_paid: 'badge-amber',
  paid: 'badge-green',
  overdue: 'badge-red',
  void: 'badge-red',
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchInvoices() }, [statusFilter])

  async function fetchInvoices() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.append('status', statusFilter)
    const res = await fetch(`/api/invoices?${params}`)
    const data = await res.json()
    setInvoices(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function markSent(id) {
    await fetch('/api/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'sent' })
    })
    fetchInvoices()
  }

  async function applyPayment(invoice) {
    if (!payAmount || isNaN(payAmount)) return
    setSaving(true)
    const newPaid = Number(invoice.amount_paid) + Number(payAmount)
    await fetch('/api/invoices', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: invoice.id, amount_paid: newPaid })
    })
    setSelected(null)
    setPayAmount('')
    setSaving(false)
    fetchInvoices()
  }

  const totalAR = invoices
    .filter(i => !['paid', 'void'].includes(i.status))
    .reduce((s, i) => s + (Number(i.total_due) - Number(i.amount_paid)), 0)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p className="page-sub">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''} — AR open: <strong>${totalAR.toFixed(2)}</strong></p>
        </div>
      </div>

      <div className="filter-bar">
        <select className="chip" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="partially_paid">Partially Paid</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
        </select>
      </div>

      {/* Panel paiement */}
      {selected && (
        <div className="card" style={{ marginBottom: '1.5rem', borderLeft: '3px solid var(--accent)' }}>
          <div className="card-header">
            <h3>Apply Payment — {selected.invoice_number}</h3>
            <button className="btn-outline" style={{ padding: '0.2rem 0.6rem', fontSize: 12 }} onClick={() => setSelected(null)}>✕</button>
          </div>
          <div className="card-body">
            <div className="grid-2">
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>Total Due</div>
                <div style={{ fontWeight: 700, fontSize: 18 }}>${Number(selected.total_due).toFixed(2)}</div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 4 }}>Balance Due</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--accent)' }}>
                  ${(Number(selected.total_due) - Number(selected.amount_paid)).toFixed(2)}
                </div>
              </div>
            </div>
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div style={{ flex: 1 }}>
                <label>Amount Received ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder="0.00"
                  autoFocus
                />
              </div>
              <button
                className="btn-primary"
                disabled={saving || !payAmount}
                onClick={() => applyPayment(selected)}
              >
                {saving ? 'Saving...' : 'Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Invoice #</th>
              <th>Customer</th>
              <th>Order</th>
              <th>Issue Date</th>
              <th>Due Date</th>
              <th>Total</th>
              <th>Paid</th>
              <th>Balance</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : invoices.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No invoices yet.</td></tr>
            ) : invoices.map(inv => {
              const balance = Number(inv.total_due) - Number(inv.amount_paid)
              const isOverdue = !['paid', 'void', 'draft'].includes(inv.status) && new Date(inv.due_date) < new Date()
              return (
                <tr key={inv.id} style={isOverdue ? { background: '#fff8f8' } : {}}>
                  <td><strong>{inv.invoice_number}</strong></td>
                  <td>{inv.customer?.name || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{inv.sales_order?.order_number}</td>
                  <td>{inv.issue_date}</td>
                  <td style={isOverdue ? { color: '#c00', fontWeight: 600 } : {}}>{inv.due_date}</td>
                  <td>${Number(inv.total_due).toFixed(2)}</td>
                  <td>${Number(inv.amount_paid).toFixed(2)}</td>
                  <td><strong>${balance.toFixed(2)}</strong></td>
                  <td>
                    <span className={`badge ${isOverdue ? 'badge-red' : STATUS_COLORS[inv.status] || 'badge-gray'}`}>
                      {isOverdue ? 'overdue' : inv.status}
                    </span>
                  </td>
                  <td style={{ display: 'flex', gap: '0.35rem' }}>
                    {inv.status === 'draft' && (
                      <button
                        className="btn-outline"
                        style={{ padding: '0.2rem 0.6rem', fontSize: 11 }}
                        onClick={() => markSent(inv.id)}
                      >
                        Mark Sent
                      </button>
                    )}
                    {['sent', 'partially_paid', 'overdue'].includes(inv.status) && (
                      <button
                        className="btn-primary"
                        style={{ padding: '0.2rem 0.6rem', fontSize: 11 }}
                        onClick={() => { setSelected(inv); setPayAmount('') }}
                      >
                        + Payment
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
