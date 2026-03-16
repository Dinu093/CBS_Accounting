import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FormField, ModalInput, ModalSelect, ModalError, ModalActions, BtnPrimary, BtnSecondary } from '../components/FormField'

const TYPE_COLORS = { wholesale: 'badge-blue', retail: 'badge-green', influencer: 'badge-amber', internal: 'badge-gray' }
const STATUS_COLORS = { active: 'badge-green', inactive: 'badge-gray', on_hold: 'badge-red' }

const EMPTY_CUSTOMER = {
  name: '', type: 'wholesale', email: '', phone: '',
  contact_name: '', contact_title: '',
  payment_terms_days: 30, discount_pct: 0,
  default_price_list_id: '', notes: '',
}

const EMPTY_LOCATION = {
  name: '', address_line1: '', city: '', state: '', zip: '',
  contact_name: '', contact_email: '', contact_phone: '',
  is_shipping_default: false, notes: '',
}

function DetailPanel({ customer, onClose, onRefresh, priceLists }) {
  const [locOpen, setLocOpen] = useState(false)
  const [locForm, setLocForm] = useState(EMPTY_LOCATION)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const lf = (k, v) => setLocForm(p => ({ ...p, [k]: v }))

  async function addLocation(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...locForm, customer_id: customer.id })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setLocOpen(false)
    setLocForm(EMPTY_LOCATION)
    onRefresh()
    setSaving(false)
  }

  async function removeLocation(id) {
    if (!confirm('Remove this location?')) return
    await fetch(`/api/locations?id=${id}`, { method: 'DELETE' })
    onRefresh()
  }

  const priceList = priceLists.find(p => p.id === customer.default_price_list_id)

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 480,
      background: 'var(--bg-2, #fff)',
      borderLeft: '1px solid var(--border, #e5e7eb)',
      boxShadow: '-8px 0 40px rgba(0,0,0,0.08)',
      zIndex: 500, overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '1.5rem 1.75rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span className={`badge ${TYPE_COLORS[customer.type] || 'badge-gray'}`}>{customer.type}</span>
            <span className={`badge ${STATUS_COLORS[customer.status] || 'badge-gray'}`}>{customer.status}</span>
          </div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>{customer.name}</h2>
        </div>
        <button onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: 'var(--text-2)' }}>×</button>
      </div>

      <div style={{ padding: '1.5rem 1.75rem', flex: 1 }}>

        {/* Infos de contact */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Contact</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Name', customer.contact_name || '—'],
              ['Title', customer.contact_title || '—'],
              ['Email', customer.email || '—'],
              ['Phone', customer.phone || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 2, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 14 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Infos commerciales */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Commercial Terms</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Payment Terms', `Net ${customer.payment_terms_days}`],
              ['Discount', customer.discount_pct ? `${customer.discount_pct}%` : '—'],
              ['Price List', priceList?.name || '—'],
              ['Notes', customer.notes || '—'],
            ].map(([label, value]) => (
              <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 2, fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: 14 }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Locations */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Locations / Stores ({customer.locations?.filter(l => l.is_active !== false).length || 0})
            </div>
            <button
              className="btn-primary"
              style={{ padding: '0.25rem 0.75rem', fontSize: 12 }}
              onClick={() => { setLocOpen(true); setError(null); setLocForm(EMPTY_LOCATION) }}
            >
              + Add
            </button>
          </div>

          {(!customer.locations || customer.locations.filter(l => l.is_active !== false).length === 0) ? (
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '1rem', textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
              No locations yet
            </div>
          ) : customer.locations.filter(l => l.is_active !== false).map(loc => (
            <div key={loc.id} style={{ background: 'var(--bg)', borderRadius: 10, padding: '1rem 1.1rem', marginBottom: 8, border: loc.is_shipping_default ? '1.5px solid var(--accent, #e94560)' : '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>
                    {loc.name}
                    {loc.is_shipping_default && <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>DEFAULT</span>}
                  </div>
                  {loc.address_line1 && <div style={{ fontSize: 13, color: 'var(--text-2)' }}>{loc.address_line1}{loc.city ? `, ${loc.city}` : ''}{loc.state ? `, ${loc.state}` : ''} {loc.zip}</div>}
                  {loc.contact_name && (
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-2)' }}>
                      👤 {loc.contact_name}
                      {loc.contact_email && <span> · {loc.contact_email}</span>}
                      {loc.contact_phone && <span> · {loc.contact_phone}</span>}
                    </div>
                  )}
                  {loc.notes && <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-2)', fontStyle: 'italic' }}>{loc.notes}</div>}
                </div>
                <button onClick={() => removeLocation(loc.id)} style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal add location */}
      <Modal open={locOpen} onClose={() => setLocOpen(false)} title="Add Location" subtitle={`Store or ship-to address for ${customer.name}`}>
        <form onSubmit={addLocation}>
          <ModalError message={error} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <FormField label="Location Name" required hint="e.g. NYC Flagship, Warehouse East">
              <ModalInput value={locForm.name} onChange={e => lf('name', e.target.value)} placeholder="Downtown Store" required />
            </FormField>
            <FormField label="Address">
              <ModalInput value={locForm.address_line1} onChange={e => lf('address_line1', e.target.value)} placeholder="123 Main St" />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px', gap: '0.75rem' }}>
              <FormField label="City">
                <ModalInput value={locForm.city} onChange={e => lf('city', e.target.value)} />
              </FormField>
              <FormField label="State">
                <ModalInput value={locForm.state} onChange={e => lf('state', e.target.value.toUpperCase())} placeholder="NY" maxLength={2} />
              </FormField>
              <FormField label="ZIP">
                <ModalInput value={locForm.zip} onChange={e => lf('zip', e.target.value)} />
              </FormField>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.875rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Location Contact
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormField label="Contact Name">
                <ModalInput value={locForm.contact_name} onChange={e => lf('contact_name', e.target.value)} placeholder="Jane Smith" />
              </FormField>
              <FormField label="Contact Phone">
                <ModalInput value={locForm.contact_phone} onChange={e => lf('contact_phone', e.target.value)} placeholder="+1 555 000 0000" />
              </FormField>
            </div>
            <FormField label="Contact Email">
              <ModalInput type="email" value={locForm.contact_email} onChange={e => lf('contact_email', e.target.value)} placeholder="orders@store.com" />
            </FormField>
            <FormField label="Notes">
              <ModalInput value={locForm.notes} onChange={e => lf('notes', e.target.value)} placeholder="Receiving hours, special instructions..." />
            </FormField>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={locForm.is_shipping_default} onChange={e => lf('is_shipping_default', e.target.checked)} />
              Set as default ship-to for this customer
            </label>
          </div>
          <ModalActions>
            <BtnSecondary onClick={() => setLocOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Add Location'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>
    </div>
  )
}

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [priceLists, setPriceLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY_CUSTOMER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { fetchCustomers() }, [search, typeFilter])
  useEffect(() => {
    fetch('/api/price-lists').then(r => r.json()).then(d => setPriceLists(Array.isArray(d) ? d.filter(p => p.type === 'wholesale') : []))
  }, [])

  async function fetchCustomers() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    if (typeFilter) params.append('type', typeFilter)
    const res = await fetch(`/api/customers?${params}`)
    const data = await res.json()
    setCustomers(Array.isArray(data) ? data : [])
    setLoading(false)
    // Refresh selected si ouvert
    if (selected) {
      const refreshed = (Array.isArray(data) ? data : []).find(c => c.id === selected.id)
      if (refreshed) setSelected(refreshed)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, default_price_list_id: form.default_price_list_id || null })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setCreateOpen(false)
    setForm(EMPTY_CUSTOMER)
    fetchCustomers()
    setSaving(false)
  }

  return (
    <Layout>
      {/* Overlay quand panel ouvert */}
      {selected && (
        <div
          onClick={() => setSelected(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 490, background: 'rgba(0,0,0,0.15)' }}
        />
      )}

      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p className="page-sub">{customers.length} customer{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setCreateOpen(true); setError(null); setForm(EMPTY_CUSTOMER) }}>
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

      {/* Modal création customer */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Customer" subtitle="Add a distributor, retailer or contact" width={580}>
        <form onSubmit={handleCreate}>
          <ModalError message={error} />

          <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Company</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Company Name" required>
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
            <FormField label="Default Price List">
              <ModalSelect value={form.default_price_list_id} onChange={e => f('default_price_list_id', e.target.value)}>
                <option value="">None (manual)</option>
                {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
              </ModalSelect>
            </FormField>
          </div>

          <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contact</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Contact Name">
              <ModalInput value={form.contact_name} onChange={e => f('contact_name', e.target.value)} placeholder="Jane Smith" />
            </FormField>
            <FormField label="Title">
              <ModalInput value={form.contact_title} onChange={e => f('contact_title', e.target.value)} placeholder="Buyer" />
            </FormField>
            <FormField label="Email">
              <ModalInput type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="jane@store.com" />
            </FormField>
            <FormField label="Phone">
              <ModalInput value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="+1 555 000 0000" />
            </FormField>
          </div>

          <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Terms</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Payment Terms (days)">
              <ModalInput type="number" value={form.payment_terms_days} onChange={e => f('payment_terms_days', parseInt(e.target.value))} />
            </FormField>
            <FormField label="Discount %" hint="Applied to all wholesale orders">
              <ModalInput type="number" step="0.1" min="0" max="100" value={form.discount_pct} onChange={e => f('discount_pct', parseFloat(e.target.value))} placeholder="0" />
            </FormField>
          </div>

          <FormField label="Notes">
            <ModalInput value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="Internal notes..." />
          </FormField>

          <ModalActions>
            <BtnSecondary onClick={() => setCreateOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Customer'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>

      {/* Table */}
      <div className="card" style={{ marginRight: selected ? 496 : 0, transition: 'margin-right 0.2s' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Contact</th>
              <th>Email</th>
              <th>Terms</th>
              <th>Discount</th>
              <th>Price List</th>
              <th>Locations</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No customers yet.</td></tr>
            ) : customers.map(c => (
              <tr
                key={c.id}
                onClick={() => setSelected(selected?.id === c.id ? null : c)}
                style={{ cursor: 'pointer', background: selected?.id === c.id ? 'var(--bg)' : 'inherit' }}
              >
                <td><strong>{c.name}</strong></td>
                <td><span className={`badge ${TYPE_COLORS[c.type] || 'badge-gray'}`}>{c.type}</span></td>
                <td style={{ fontSize: 13 }}>{c.contact_name || '—'}</td>
                <td style={{ fontSize: 13 }}>{c.email || '—'}</td>
                <td>Net {c.payment_terms_days}</td>
                <td>{c.discount_pct > 0 ? <span className="badge badge-amber">{c.discount_pct}%</span> : '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.default_price_list?.name || '—'}</td>
                <td>{c.locations?.filter(l => l.is_active !== false).length || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Panel détail */}
      {selected && (
        <DetailPanel
          customer={selected}
          priceLists={priceLists}
          onClose={() => setSelected(null)}
          onRefresh={fetchCustomers}
        />
      )}
    </Layout>
  )
}
