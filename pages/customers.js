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
  default_price_list_id: '', notes: '', status: 'active',
}

const EMPTY_LOCATION = {
  name: '', address_line1: '', city: '', state: '', zip: '',
  contact_name: '', contact_email: '', contact_phone: '',
  is_shipping_default: false, notes: '',
}

function EditCustomerModal({ open, onClose, customer, priceLists, onSaved }) {
  const [form, setForm] = useState(EMPTY_CUSTOMER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (customer) setForm({
      name: customer.name || '',
      type: customer.type || 'wholesale',
      email: customer.email || '',
      phone: customer.phone || '',
      contact_name: customer.contact_name || '',
      contact_title: customer.contact_title || '',
      payment_terms_days: customer.payment_terms_days || 30,
      discount_pct: customer.discount_pct || 0,
      default_price_list_id: customer.default_price_list_id || '',
      notes: customer.notes || '',
      status: customer.status || 'active',
    })
  }, [customer])

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/customers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: customer.id, ...form, default_price_list_id: form.default_price_list_id || null })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    onSaved()
    setSaving(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Customer" subtitle={customer?.name} width={580}>
      <form onSubmit={handleSubmit}>
        <ModalError message={error} />
        <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Company</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Company Name" required>
              <ModalInput value={form.name} onChange={e => f('name', e.target.value)} required />
            </FormField>
          </div>
          <FormField label="Type">
            <ModalSelect value={form.type} onChange={e => f('type', e.target.value)}>
              <option value="wholesale">Wholesale</option>
              <option value="retail">Retail</option>
              <option value="influencer">Influencer</option>
              <option value="internal">Internal</option>
            </ModalSelect>
          </FormField>
          <FormField label="Status">
            <ModalSelect value={form.status} onChange={e => f('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="on_hold">On Hold</option>
            </ModalSelect>
          </FormField>
          <FormField label="Default Price List">
            <ModalSelect value={form.default_price_list_id} onChange={e => f('default_price_list_id', e.target.value)}>
              <option value="">None (manual)</option>
              {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </ModalSelect>
          </FormField>
          <FormField label="Discount %">
            <ModalInput type="number" step="0.1" min="0" max="100" value={form.discount_pct} onChange={e => f('discount_pct', parseFloat(e.target.value))} />
          </FormField>
        </div>
        <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contact</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
          <FormField label="Contact Name">
            <ModalInput value={form.contact_name} onChange={e => f('contact_name', e.target.value)} />
          </FormField>
          <FormField label="Title">
            <ModalInput value={form.contact_title} onChange={e => f('contact_title', e.target.value)} />
          </FormField>
          <FormField label="Email">
            <ModalInput type="email" value={form.email} onChange={e => f('email', e.target.value)} />
          </FormField>
          <FormField label="Phone">
            <ModalInput value={form.phone} onChange={e => f('phone', e.target.value)} />
          </FormField>
        </div>
        <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Terms</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
          <FormField label="Payment Terms (days)">
            <ModalInput type="number" value={form.payment_terms_days} onChange={e => f('payment_terms_days', parseInt(e.target.value))} />
          </FormField>
        </div>
        <FormField label="Notes">
          <ModalInput value={form.notes} onChange={e => f('notes', e.target.value)} />
        </FormField>
        <ModalActions>
          <BtnSecondary onClick={onClose}>Cancel</BtnSecondary>
          <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</BtnPrimary>
        </ModalActions>
      </form>
    </Modal>
  )
}

function DetailPanel({ customer, onClose, onRefresh, priceLists, onEdit }) {
  const [locOpen, setLocOpen] = useState(false)
  const [editingLoc, setEditingLoc] = useState(null)
  const [locForm, setLocForm] = useState(EMPTY_LOCATION)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const lf = (k, v) => setLocForm(p => ({ ...p, [k]: v }))

  function openNewLoc() { setEditingLoc(null); setLocForm(EMPTY_LOCATION); setError(null); setLocOpen(true) }
  function openEditLoc(loc) {
    setEditingLoc(loc)
    setLocForm({
      name: loc.name || '', address_line1: loc.address_line1 || '',
      city: loc.city || '', state: loc.state || '', zip: loc.zip || '',
      contact_name: loc.contact_name || '', contact_email: loc.contact_email || '',
      contact_phone: loc.contact_phone || '', is_shipping_default: loc.is_shipping_default || false,
      notes: loc.notes || '',
    })
    setError(null)
    setLocOpen(true)
  }

  async function saveLocation(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    if (editingLoc) {
      // Edit
      const res = await fetch('/api/locations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingLoc.id, ...locForm })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setSaving(false); return }
    } else {
      // New
      const res = await fetch('/api/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...locForm, customer_id: customer.id })
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); setSaving(false); return }
    }
    setLocOpen(false)
    setEditingLoc(null)
    onRefresh()
    setSaving(false)
  }

  async function removeLocation(id) {
    if (!confirm('Remove this location?')) return
    await fetch(`/api/locations?id=${id}`, { method: 'DELETE' })
    onRefresh()
  }

  const priceList = priceLists.find(p => p.id === customer.default_price_list_id)
  const activeLocs = customer.locations?.filter(l => l.is_active !== false) || []

  return (
    <div style={{
      position: 'fixed', right: 0, top: 0, bottom: 0, width: 480,
      background: 'var(--bg-2, #fff)',
      borderLeft: '1px solid var(--border)',
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
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn-outline" style={{ padding: '0.25rem 0.75rem', fontSize: 12 }} onClick={onEdit}>
            ✏️ Edit
          </button>
          <button onClick={onClose} style={{ background: 'var(--bg)', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 18, color: 'var(--text-2)' }}>×</button>
        </div>
      </div>

      <div style={{ padding: '1.5rem 1.75rem', flex: 1 }}>

        {/* Contact */}
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

        {/* Terms */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Commercial Terms</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['Payment Terms', `Net ${customer.payment_terms_days}`],
              ['Discount', customer.discount_pct > 0 ? `${customer.discount_pct}%` : '—'],
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
              Locations ({activeLocs.length})
            </div>
            <button className="btn-primary" style={{ padding: '0.25rem 0.75rem', fontSize: 12 }} onClick={openNewLoc}>
              + Add
            </button>
          </div>

          {activeLocs.length === 0 ? (
            <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '1rem', textAlign: 'center', color: 'var(--text-2)', fontSize: 13 }}>
              No locations yet
            </div>
          ) : activeLocs.map(loc => (
            <div key={loc.id} style={{ background: 'var(--bg)', borderRadius: 10, padding: '1rem 1.1rem', marginBottom: 8, border: loc.is_shipping_default ? '1.5px solid var(--accent, #e94560)' : '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
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
                </div>
                <div style={{ display: 'flex', gap: 4, marginLeft: 8 }}>
                  <button onClick={() => openEditLoc(loc)} style={{ background: 'none', border: 'none', color: 'var(--text-2)', cursor: 'pointer', fontSize: 14, padding: '0 4px' }}>✏️</button>
                  <button onClick={() => removeLocation(loc.id)} style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Modal location */}
      <Modal open={locOpen} onClose={() => setLocOpen(false)} title={editingLoc ? 'Edit Location' : 'Add Location'} subtitle={customer.name}>
        <form onSubmit={saveLocation}>
          <ModalError message={error} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <FormField label="Location Name" required>
              <ModalInput value={locForm.name} onChange={e => lf('name', e.target.value)} placeholder="Downtown Store" required />
            </FormField>
            <FormField label="Address">
              <ModalInput value={locForm.address_line1} onChange={e => lf('address_line1', e.target.value)} placeholder="123 Main St" />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px', gap: '0.75rem' }}>
              <FormField label="City"><ModalInput value={locForm.city} onChange={e => lf('city', e.target.value)} /></FormField>
              <FormField label="State"><ModalInput value={locForm.state} onChange={e => lf('state', e.target.value.toUpperCase())} placeholder="NY" /></FormField>
              <FormField label="ZIP"><ModalInput value={locForm.zip} onChange={e => lf('zip', e.target.value)} /></FormField>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.875rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormField label="Contact Name"><ModalInput value={locForm.contact_name} onChange={e => lf('contact_name', e.target.value)} /></FormField>
              <FormField label="Phone"><ModalInput value={locForm.contact_phone} onChange={e => lf('contact_phone', e.target.value)} /></FormField>
            </div>
            <FormField label="Email"><ModalInput type="email" value={locForm.contact_email} onChange={e => lf('contact_email', e.target.value)} /></FormField>
            <FormField label="Notes"><ModalInput value={locForm.notes} onChange={e => lf('notes', e.target.value)} /></FormField>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={locForm.is_shipping_default} onChange={e => lf('is_shipping_default', e.target.checked)} />
              Set as default ship-to
            </label>
          </div>
          <ModalActions>
            <BtnSecondary onClick={() => setLocOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : editingLoc ? 'Save Changes' : 'Add Location'}</BtnPrimary>
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
  const [tab, setTab] = useState('wholesale') // wholesale | ecommerce
  const [createOpen, setCreateOpen] = useState(false)
  const [editCustomer, setEditCustomer] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY_CUSTOMER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => { fetchCustomers() }, [search, tab])
  useEffect(() => {
    fetch('/api/price-lists').then(r => r.json()).then(d => setPriceLists(Array.isArray(d) ? d.filter(p => p.type === 'wholesale') : []))
  }, [])

  async function fetchCustomers() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    // Wholesale tab = wholesale + influencer + internal, Ecommerce tab = retail
    if (tab === 'wholesale') params.append('exclude_type', 'retail')
    else params.append('type', 'retail')
    const res = await fetch(`/api/customers?${params}`)
    const data = await res.json()
    let result = Array.isArray(data) ? data : []
    // Filter client-side for wholesale tab (exclude retail)
    if (tab === 'wholesale') result = result.filter(c => c.type !== 'retail')
    setCustomers(result)
    setLoading(false)
    if (selected) {
      const refreshed = result.find(c => c.id === selected.id)
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

  // Comptages pour les onglets
  const wholesaleCount = customers.filter(c => c.type !== 'retail').length
  const ecomCount = customers.filter(c => c.type === 'retail').length

  return (
    <Layout>
      {selected && <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, zIndex: 490, background: 'rgba(0,0,0,0.15)' }} />}

      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p className="page-sub">{customers.length} customer{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setCreateOpen(true); setError(null); setForm({ ...EMPTY_CUSTOMER, type: tab === 'ecommerce' ? 'retail' : 'wholesale' }) }}>
            + New Customer
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: 0 }}>
        {[
          { key: 'wholesale', label: 'Wholesale & Partners' },
          { key: 'ecommerce', label: 'E-commerce Customers' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setSelected(null) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '0.6rem 1rem', fontSize: 14, fontWeight: tab === t.key ? 600 : 400,
              color: tab === t.key ? 'var(--text-1)' : 'var(--text-2)',
              borderBottom: tab === t.key ? '2px solid var(--text-1)' : '2px solid transparent',
              marginBottom: -1,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Recherche */}
      <div className="filter-bar">
        <input className="search-input" placeholder="Search by name..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Modal création */}
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
                <option value="retail">Retail / E-commerce</option>
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
            <FormField label="Contact Name"><ModalInput value={form.contact_name} onChange={e => f('contact_name', e.target.value)} placeholder="Jane Smith" /></FormField>
            <FormField label="Title"><ModalInput value={form.contact_title} onChange={e => f('contact_title', e.target.value)} placeholder="Buyer" /></FormField>
            <FormField label="Email"><ModalInput type="email" value={form.email} onChange={e => f('email', e.target.value)} placeholder="jane@store.com" /></FormField>
            <FormField label="Phone"><ModalInput value={form.phone} onChange={e => f('phone', e.target.value)} placeholder="+1 555 000 0000" /></FormField>
          </div>
          <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Terms</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1rem' }}>
            <FormField label="Payment Terms (days)"><ModalInput type="number" value={form.payment_terms_days} onChange={e => f('payment_terms_days', parseInt(e.target.value))} /></FormField>
            <FormField label="Discount %" hint="Applied to wholesale orders"><ModalInput type="number" step="0.1" min="0" max="100" value={form.discount_pct} onChange={e => f('discount_pct', parseFloat(e.target.value))} placeholder="0" /></FormField>
          </div>
          <FormField label="Notes"><ModalInput value={form.notes} onChange={e => f('notes', e.target.value)} /></FormField>
          <ModalActions>
            <BtnSecondary onClick={() => setCreateOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Customer'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>

      {/* Modal edit customer */}
      <EditCustomerModal
        open={!!editCustomer}
        onClose={() => setEditCustomer(null)}
        customer={editCustomer}
        priceLists={priceLists}
        onSaved={() => { setEditCustomer(null); fetchCustomers() }}
      />

      {/* Table */}
      <div className="card" style={{ marginRight: selected ? 496 : 0, transition: 'margin-right 0.2s' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              {tab === 'wholesale' && <th>Contact</th>}
              <th>Email</th>
              {tab === 'wholesale' && <><th>Terms</th><th>Discount</th><th>Price List</th><th>Locations</th></>}
              {tab === 'ecommerce' && <><th>Source</th><th>Orders</th></>}
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>
                {tab === 'ecommerce' ? 'No e-commerce customers yet — they appear automatically when Shopify orders are imported.' : 'No customers yet.'}
              </td></tr>
            ) : customers.map(c => (
              <tr key={c.id} onClick={() => setSelected(selected?.id === c.id ? null : c)} style={{ cursor: 'pointer', background: selected?.id === c.id ? 'var(--bg)' : 'inherit' }}>
                <td><strong>{c.name}</strong></td>
                <td><span className={`badge ${TYPE_COLORS[c.type] || 'badge-gray'}`}>{c.type}</span></td>
                {tab === 'wholesale' && <td style={{ fontSize: 13 }}>{c.contact_name || '—'}</td>}
                <td style={{ fontSize: 13 }}>{c.email || '—'}</td>
                {tab === 'wholesale' && (
                  <>
                    <td>Net {c.payment_terms_days}</td>
                    <td>{c.discount_pct > 0 ? <span className="badge badge-amber">{c.discount_pct}%</span> : '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{c.default_price_list?.name || '—'}</td>
                    <td>{c.locations?.filter(l => l.is_active !== false).length || 0}</td>
                  </>
                )}
                {tab === 'ecommerce' && (
                  <>
                    <td style={{ fontSize: 12 }}>{c.shopify_customer_id ? <span className="badge badge-green">Shopify</span> : '—'}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-2)' }}>—</td>
                  </>
                )}
                <td><span className={`badge ${STATUS_COLORS[c.status] || 'badge-gray'}`}>{c.status}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  <button
                    className="btn-outline"
                    style={{ padding: '0.2rem 0.6rem', fontSize: 11 }}
                    onClick={() => setEditCustomer(c)}
                  >
                    Edit
                  </button>
                </td>
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
          onEdit={() => { setEditCustomer(selected) }}
        />
      )}
    </Layout>
  )
}
