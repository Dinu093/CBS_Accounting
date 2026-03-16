import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FormField, ModalInput, ModalSelect, ModalError, ModalActions, BtnPrimary, BtnSecondary } from '../components/FormField'

const TYPE_COLORS = { wholesale: 'badge-blue', retail: 'badge-green', influencer: 'badge-amber', internal: 'badge-gray' }
const STATUS_COLORS = { active: 'badge-green', inactive: 'badge-gray', on_hold: 'badge-red' }
const EMPTY_FORM = { name: '', type: 'wholesale', email: '', phone: '', payment_terms_days: 30, notes: '' }

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

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
    setOpen(false)
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
          <button className="btn-primary" onClick={() => { setOpen(true); setError(null); setForm(EMPTY_FORM) }}>
            + New Customer
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="chip" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          <option value="wholesale">Wholesale</option>
          <option value="retail">Retail</option>
          <option value="influencer">Influencer</option>
          <option value="internal">Internal</option>
        </select>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New Customer" subtitle="Add a distributor, retailer or contact">
        <form onSubmit={handleSubmit}>
          <ModalError message={error} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Name" required>
                <ModalInput value={form.name} onChange={e => f('name', e.target.value)} placeholder="Acme Beauty Retail" required />
              </FormField>
            </div>
            <FormField label="Type" required>
              <ModalSelect value={form.type} onChange={e => f('type', e.target.value)}>
                <option value="wholesale">Wholesale</option>
                <option value="retail">Retail</option>
                <option value="influencer">Influencer</option>
                <option value="internal">Internal</option>
              </ModalSelect>
            </FormField>
            <FormField label="Payment Terms (days)">
              <ModalInput type="number" value={form.payment_terms_days} onChange={e => f('payment_terms_days', parseInt(e.target.value))} />
            </FormField>
            <FormField label="Email">
              <ModalInput type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="buyer@store.com" />
            </FormField>
            <FormField label="Phone">
              <ModalInput value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="+1 555 000 0000" />
            </FormField>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Notes">
                <ModalInput value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Internal notes..." />
              </FormField>
            </div>
          </div>
          <ModalActions>
            <BtnSecondary onClick={() => setOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Customer'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>

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
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No customers yet.</td></tr>
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
