import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const EMPTY_FORM = {
  customer_id: '',
  name: '',
  address_line1: '',
  city: '',
  state: '',
  zip: '',
  country: 'US',
  is_billing_address: false,
  is_shipping_default: false,
}

export default function Locations() {
  const [locations, setLocations] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [customerFilter, setCustomerFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchLocations() }, [customerFilter])
  useEffect(() => { fetchCustomers() }, [])

  async function fetchLocations() {
    setLoading(true)
    const params = new URLSearchParams()
    if (customerFilter) params.append('customer_id', customerFilter)
    const res = await fetch(`/api/locations?${params}`)
    const data = await res.json()
    setLocations(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchCustomers() {
    const res = await fetch('/api/customers?type=wholesale')
    const data = await res.json()
    setCustomers(Array.isArray(data) ? data : [])
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchLocations()
    setSaving(false)
  }

  async function deleteLocation(id) {
    if (!confirm('Deactivate this location?')) return
    await fetch(`/api/locations?id=${id}`, { method: 'DELETE' })
    fetchLocations()
  }

  // Groupe par customer
  const grouped = locations.reduce((acc, loc) => {
    const key = loc.customer?.id || 'unknown'
    if (!acc[key]) acc[key] = { name: loc.customer?.name || 'Unknown', locations: [] }
    acc[key].locations.push(loc)
    return acc
  }, {})

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Customer Locations</h1>
          <p className="page-sub">{locations.length} store{locations.length !== 1 ? 's' : ''} / ship-to address{locations.length !== 1 ? 'es' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm(true); setError(null) }}>
            + New Location
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <select className="chip" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
          <option value="">All customers</option>
          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>New Location</h3></div>
          <div className="card-body">
            {error && (
              <div style={{ background: '#fee', color: '#c00', padding: '0.5rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="grid-2" style={{ marginBottom: '1rem' }}>
                <div>
                  <label>Customer *</label>
                  <select value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} required>
                    <option value="">Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Location Name * (ex: NYC Store, Warehouse East)</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required placeholder="Downtown Store" />
                </div>
                <div>
                  <label>Address</label>
                  <input value={form.address_line1} onChange={e => setForm({...form, address_line1: e.target.value})} placeholder="123 Main St" />
                </div>
                <div>
                  <label>City</label>
                  <input value={form.city} onChange={e => setForm({...form, city: e.target.value})} />
                </div>
                <div>
                  <label>State</label>
                  <input value={form.state} onChange={e => setForm({...form, state: e.target.value})} placeholder="NY" maxLength={2} style={{ textTransform: 'uppercase' }} />
                </div>
                <div>
                  <label>ZIP</label>
                  <input value={form.zip} onChange={e => setForm({...form, zip: e.target.value})} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_billing_address} onChange={e => setForm({...form, is_billing_address: e.target.checked})} />
                  Billing address
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_shipping_default} onChange={e => setForm({...form, is_shipping_default: e.target.checked})} />
                  Default ship-to
                </label>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Location'}</button>
                <button type="button" className="btn-outline" onClick={() => { setShowForm(false); setError(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-2)' }}>
          No locations yet — add your first store or ship-to address.
        </div>
      ) : Object.entries(grouped).map(([customerId, group]) => (
        <div key={customerId} style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: '0.5rem', color: 'var(--text-1)' }}>
            {group.name}
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-2)', marginLeft: 8 }}>
              {group.locations.length} location{group.locations.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>State</th>
                  <th>ZIP</th>
                  <th>Billing</th>
                  <th>Ship-to default</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {group.locations.map(loc => (
                  <tr key={loc.id}>
                    <td><strong>{loc.name}</strong></td>
                    <td style={{ fontSize: 13 }}>{loc.address_line1 || '—'}</td>
                    <td style={{ fontSize: 13 }}>{loc.city || '—'}</td>
                    <td style={{ fontSize: 13 }}>{loc.state || '—'}</td>
                    <td style={{ fontSize: 13 }}>{loc.zip || '—'}</td>
                    <td>{loc.is_billing_address ? <span className="badge badge-blue">Billing</span> : '—'}</td>
                    <td>{loc.is_shipping_default ? <span className="badge badge-green">Default</span> : '—'}</td>
                    <td>
                      <button
                        className="btn-outline"
                        style={{ padding: '0.2rem 0.5rem', fontSize: 11, color: '#c00', borderColor: '#c00' }}
                        onClick={() => deleteLocation(loc.id)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Layout>
  )
}
