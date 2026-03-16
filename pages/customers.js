import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const TYPE_COLORS = {
  wholesale: 'badge-blue',
  retail: 'badge-green',
  influencer: 'badge-amber',
  internal: 'badge-gray',
}
const STATUS_COLORS = {
  active: 'badge-green',
  inactive: 'badge-gray',
  on_hold: 'badge-red',
}

const EMPTY_FORM = {
  name: '', type: 'wholesale', email: '',
  phone: '', payment_terms_days: 30, notes: ''
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchCustomers() }, [search, typeFilter])

  async function fetchCustomers() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (typeFilter) params.append('type', typeFilter)
    const res = await fetch(`/api/customers?${params}`)
    const data = await res.json()
    setCustomers(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchCustomers()
    setSaving(false)
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p className="page-sub">{customers.length} customer{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm(true); setError(null) }}>
            + New Customer
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="filter-bar">
        <input
          className="search-input"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="chip" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="wholesale">Wholesale</option>
          <option value="retail">Retail</option>
          <option value="influencer">Influencer</option>
          <option value="internal">Internal</option>
        </select>
      </div>

      {/* Formulaire */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header">
            <h3>New Customer</h3>
          </div>
          <div className="card-body">
            {error && <div className="badge-red" style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', borderRadius: 6 }}>{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div>
                  <label>Name *</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
                </div>
                <div>
                  <label>Type *</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    <option value="wholesale">Wholesale</option>
                    <option value="retail">Retail</option>
                    <option value="influencer">Influencer</option>
                    <option value="internal">Internal</option>
                  </select>
                </div>
                <div>
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} />
                </div>
                <div>
                  <label>Phone</label>
                  <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
                </div>
                <div>
                  <label>Payment Terms (days)</label>
                  <input type="number" value={form.payment_terms_days} onChange={e => setForm({...form, payment_terms_days: parseInt(e.target.value)})} />
                </div>
                <div>
                  <label>Notes</label>
                  <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} />
                </div>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save Customer'}
                </button>
                <button type="button" className="btn-outline" onClick={() => { setShowForm(false); setError(null) }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Email</th>
              <th>Payment Terms</th>
              <th>Locations</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>
                No customers yet — create your first one.
              </td></tr>
            ) : customers.map(c => (
              <tr key={c.id}>
                <td><strong>{c.name}</strong></td>
                <td><span className={`badge ${TYPE_COLORS[c.type] || 'badge-gray'}`}>{c.type}</span></td>
                <td><span className={`badge ${STATUS_COLORS[c.status] || 'badge-gray'}`}>{c.status}</span></td>
                <td>{c.email || '—'}</td>
                <td>Net {c.payment_terms_days}</td>
                <td>{c.locations?.length || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
