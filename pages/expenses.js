import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const CATEGORIES = [
  { value: 'marketing',   label: 'Marketing & Advertising', color: 'badge-blue' },
  { value: 'payroll',     label: 'Payroll & Contractors',   color: 'badge-green' },
  { value: 'software',    label: 'Software & Subscriptions',color: 'badge-amber' },
  { value: 'shipping',    label: 'Shipping & Fulfillment',  color: 'badge-blue' },
  { value: 'legal',       label: 'Legal & Professional',    color: 'badge-gray' },
  { value: 'rent',        label: 'Rent & Facilities',       color: 'badge-gray' },
  { value: 'travel',      label: 'Travel & Entertainment',  color: 'badge-amber' },
  { value: 'shopify_fee', label: 'Shopify / Payment Fees',  color: 'badge-red' },
  { value: 'bank_fee',    label: 'Bank Fees',               color: 'badge-red' },
  { value: 'other',       label: 'Other',                   color: 'badge-gray' },
]

const EMPTY_FORM = {
  expense_date: new Date().toISOString().split('T')[0],
  description: '',
  category: 'marketing',
  amount: '',
  vendor: '',
  notes: '',
}

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Expenses() {
  const [expenses, setExpenses] = useState([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const currentYear = new Date().getFullYear()
  const [dateFrom, setDateFrom] = useState(`${currentYear}-01-01`)
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { fetchExpenses() }, [categoryFilter, dateFrom, dateTo])

  async function fetchExpenses() {
    setLoading(true)
    const params = new URLSearchParams()
    if (categoryFilter) params.append('category', categoryFilter)
    if (dateFrom) params.append('from', dateFrom)
    if (dateTo) params.append('to', dateTo)
    const res = await fetch(`/api/expenses?${params}`)
    const data = await res.json()
    setExpenses(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: parseFloat(form.amount) })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchExpenses()
    setSaving(false)
  }

  async function deleteExpense(id) {
    if (!confirm('Delete this expense?')) return
    await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' })
    fetchExpenses()
  }

  // Totaux par catégorie
  const byCategory = CATEGORIES.map(cat => ({
    ...cat,
    total: expenses
      .filter(e => e.category === cat.value)
      .reduce((s, e) => s + Number(e.amount), 0)
  })).filter(c => c.total > 0)

  const grandTotal = expenses.reduce((s, e) => s + Number(e.amount), 0)

  const getCatLabel = (val) => CATEGORIES.find(c => c.value === val)?.label || val
  const getCatColor = (val) => CATEGORIES.find(c => c.value === val)?.color || 'badge-gray'

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Operating Expenses</h1>
          <p className="page-sub">Total: <strong>{fmt(grandTotal)}</strong></p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm(true); setError(null) }}>
            + Add Expense
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="filter-bar">
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="chip" />
        <span style={{ color: 'var(--text-2)', fontSize: 13 }}>→</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="chip" />
        <select className="chip" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* Summary par catégorie */}
      {byCategory.length > 0 && (
        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {byCategory.map(cat => (
            <div key={cat.value} className="card" style={{ flex: 1, minWidth: 140, padding: '0.75rem 1rem' }}>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {cat.label}
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#c00' }}>{fmt(cat.total)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Formulaire */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>New Expense</h3></div>
          <div className="card-body">
            {error && <div style={{ background: '#fee', color: '#c00', padding: '0.5rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div>
                  <label>Date *</label>
                  <input type="date" value={form.expense_date} onChange={e => setForm({...form, expense_date: e.target.value})} required />
                </div>
                <div>
                  <label>Category *</label>
                  <select value={form.category} onChange={e => setForm({...form, category: e.target.value})}>
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label>Description *</label>
                  <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} required placeholder="Facebook Ads, Klaviyo subscription..." />
                </div>
                <div>
                  <label>Amount ($) *</label>
                  <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} required placeholder="0.00" />
                </div>
                <div>
                  <label>Vendor</label>
                  <input value={form.vendor} onChange={e => setForm({...form, vendor: e.target.value})} placeholder="Meta, Shopify, UPS..." />
                </div>
                <div>
                  <label>Notes</label>
                  <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
                </div>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Expense'}</button>
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
              <th>Category</th>
              <th>Vendor</th>
              <th style={{ textAlign: 'right' }}>Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : expenses.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No expenses yet.</td></tr>
            ) : expenses.map(e => (
              <tr key={e.id}>
                <td>{e.expense_date}</td>
                <td>{e.description}</td>
                <td><span className={`badge ${getCatColor(e.category)}`}>{getCatLabel(e.category)}</span></td>
                <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{e.vendor || '—'}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: '#c00' }}>{fmt(e.amount)}</td>
                <td>
                  <button
                    onClick={() => deleteExpense(e.id)}
                    style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 16 }}
                  >×</button>
                </td>
              </tr>
            ))}
            {expenses.length > 0 && (
              <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                <td colSpan={4}><strong>Total OpEx</strong></td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#c00', fontSize: 15 }}>{fmt(grandTotal)}</td>
                <td></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
