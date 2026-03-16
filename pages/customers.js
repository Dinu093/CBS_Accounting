import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FormField, ModalInput, ModalSelect, ModalError, ModalActions, BtnPrimary, BtnSecondary } from '../components/FormField'

const TYPE_COLORS = {
  wholesale: 'badge-blue', ecommerce: 'badge-green',
  influencer: 'badge-amber', internal: 'badge-gray', retail: 'badge-green'
}
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

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10, marginTop: 4 }}>
      {children}
    </div>
  )
}

function InfoGrid({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: '1.25rem' }}>
      {items.map(([label, value]) => (
        <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.55rem 0.75rem' }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{value || '—'}</div>
        </div>
      ))}
    </div>
  )
}

function KpiRow({ items }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, 1fr)`, gap: 6, marginBottom: '1.25rem' }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.75rem', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: color || 'var(--text-1)' }}>{value}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Panel Wholesale ─────────────────────────────────────────────────────────
function WholesalePanel({ customer, onClose, onRefresh, priceLists, onEdit }) {
  const [orders, setOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [locOpen, setLocOpen] = useState(false)
  const [editingLoc, setEditingLoc] = useState(null)
  const [locForm, setLocForm] = useState(EMPTY_LOCATION)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const lf = (k, v) => setLocForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    fetch(`/api/orders?customer_id=${customer.id}&limit=10`)
      .then(r => r.json())
      .then(d => { setOrders(Array.isArray(d) ? d : []); setLoadingOrders(false) })
      .catch(() => setLoadingOrders(false))
  }, [customer.id])

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const avgOrder = orders.length ? totalRevenue / orders.length : 0
  const lastOrder = orders[0]?.order_date
  const priceList = priceLists.find(p => p.id === customer.default_price_list_id)
  const activeLocs = customer.locations?.filter(l => l.is_active !== false) || []

  function openNewLoc() { setEditingLoc(null); setLocForm(EMPTY_LOCATION); setError(null); setLocOpen(true) }
  function openEditLoc(loc) {
    setEditingLoc(loc)
    setLocForm({ name: loc.name || '', address_line1: loc.address_line1 || '', city: loc.city || '', state: loc.state || '', zip: loc.zip || '', contact_name: loc.contact_name || '', contact_email: loc.contact_email || '', contact_phone: loc.contact_phone || '', is_shipping_default: loc.is_shipping_default || false, notes: loc.notes || '' })
    setError(null); setLocOpen(true)
  }

  async function saveLocation(e) {
    e.preventDefault(); setSaving(true); setError(null)
    const method = editingLoc ? 'PATCH' : 'POST'
    const body = editingLoc ? { id: editingLoc.id, ...locForm } : { ...locForm, customer_id: customer.id }
    const res = await fetch('/api/locations', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setLocOpen(false); setEditingLoc(null); onRefresh(); setSaving(false)
  }

  async function removeLocation(id) {
    if (!confirm('Remove this location?')) return
    await fetch(`/api/locations?id=${id}`, { method: 'DELETE' }); onRefresh()
  }

  return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 500, background: '#fff', borderLeft: '1px solid var(--border)', boxShadow: '-12px 0 48px rgba(0,0,0,0.07)', zIndex: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem 1.75rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <span className={`badge ${TYPE_COLORS[customer.type] || 'badge-gray'}`}>{customer.type}</span>
              <span className={`badge ${STATUS_COLORS[customer.status] || 'badge-gray'}`}>{customer.status}</span>
            </div>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text-1)', letterSpacing: '-0.01em' }}>{customer.name}</h2>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onEdit}
              style={{ padding: '0.4rem 0.9rem', fontSize: 13, fontWeight: 500, background: 'var(--bg)', border: '1px solid var(--border-2)', borderRadius: 8, cursor: 'pointer', color: 'var(--text-2)' }}
            >
              Edit
            </button>
            <button onClick={onClose} style={{ width: 32, height: 32, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 16, color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>
      </div>

      <div style={{ padding: '1.25rem 1.75rem', flex: 1 }}>

        {/* KPIs */}
        <SectionTitle>Performance</SectionTitle>
        <KpiRow items={[
          { label: 'Total Revenue', value: fmt(totalRevenue), color: 'var(--green)' },
          { label: 'Orders', value: orders.length },
          { label: 'Avg Order', value: fmt(avgOrder) },
          { label: 'Last Order', value: lastOrder || '—' },
        ]} />

        {/* Contact */}
        <SectionTitle>Contact</SectionTitle>
        <InfoGrid items={[
          ['Name', customer.contact_name],
          ['Title', customer.contact_title],
          ['Email', customer.email],
          ['Phone', customer.phone],
        ]} />

        {/* Terms */}
        <SectionTitle>Commercial Terms</SectionTitle>
        <InfoGrid items={[
          ['Payment Terms', `Net ${customer.payment_terms_days}`],
          ['Discount', customer.discount_pct > 0 ? `${customer.discount_pct}%` : '—'],
          ['Price List', priceList?.name || '—'],
          ['Notes', customer.notes],
        ]} />

        {/* Order history */}
        {orders.length > 0 && (
          <>
            <SectionTitle>Recent Orders</SectionTitle>
            <div style={{ marginBottom: '1.25rem' }}>
              {orders.slice(0, 5).map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'var(--bg)', borderRadius: 8, marginBottom: 4 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{o.order_number}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{o.order_date}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`badge ${o.status === 'fulfilled' ? 'badge-green' : o.status === 'confirmed' ? 'badge-blue' : 'badge-gray'}`} style={{ fontSize: 11 }}>{o.status}</span>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{fmt(o.total_amount)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Locations */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <SectionTitle>Locations ({activeLocs.length})</SectionTitle>
          <button onClick={openNewLoc} style={{ fontSize: 12, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-2)', padding: '0.2rem 0.5rem', borderRadius: 6, border: '1px solid var(--border-2)' }}>
            + Add
          </button>
        </div>

        {activeLocs.length === 0 ? (
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '0.875rem', textAlign: 'center', color: 'var(--text-3)', fontSize: 13, marginBottom: '1.25rem' }}>No locations yet</div>
        ) : activeLocs.map(loc => (
          <div key={loc.id} style={{ background: 'var(--bg)', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: 6, border: loc.is_shipping_default ? '1.5px solid var(--accent)' : '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 2 }}>
                  {loc.name}
                  {loc.is_shipping_default && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Default</span>}
                </div>
                {loc.address_line1 && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{loc.address_line1}{loc.city ? `, ${loc.city}` : ''}{loc.state ? ` ${loc.state}` : ''} {loc.zip}</div>}
                {loc.contact_name && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{loc.contact_name}{loc.contact_email ? ` · ${loc.contact_email}` : ''}</div>}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => openEditLoc(loc)} style={{ fontSize: 11, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.2rem 0.5rem', cursor: 'pointer', color: 'var(--text-2)' }}>Edit</button>
                <button onClick={() => removeLocation(loc.id)} style={{ fontSize: 11, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.2rem 0.5rem', cursor: 'pointer', color: 'var(--red)' }}>Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Modal location */}
      <Modal open={locOpen} onClose={() => setLocOpen(false)} title={editingLoc ? 'Edit Location' : 'Add Location'} subtitle={customer.name}>
        <form onSubmit={saveLocation}>
          <ModalError message={error} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <FormField label="Location Name" required><ModalInput value={locForm.name} onChange={e => lf('name', e.target.value)} placeholder="Downtown Store" required /></FormField>
            <FormField label="Address"><ModalInput value={locForm.address_line1} onChange={e => lf('address_line1', e.target.value)} placeholder="123 Main St" /></FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 72px 96px', gap: '0.75rem' }}>
              <FormField label="City"><ModalInput value={locForm.city} onChange={e => lf('city', e.target.value)} /></FormField>
              <FormField label="State"><ModalInput value={locForm.state} onChange={e => lf('state', e.target.value.toUpperCase())} placeholder="NY" /></FormField>
              <FormField label="ZIP"><ModalInput value={locForm.zip} onChange={e => lf('zip', e.target.value)} /></FormField>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', borderTop: '1px solid var(--border)', paddingTop: '0.875rem' }}>Location Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <FormField label="Name"><ModalInput value={locForm.contact_name} onChange={e => lf('contact_name', e.target.value)} /></FormField>
              <FormField label="Phone"><ModalInput value={locForm.contact_phone} onChange={e => lf('contact_phone', e.target.value)} /></FormField>
            </div>
            <FormField label="Email"><ModalInput type="email" value={locForm.contact_email} onChange={e => lf('contact_email', e.target.value)} /></FormField>
            <FormField label="Notes"><ModalInput value={locForm.notes} onChange={e => lf('notes', e.target.value)} /></FormField>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-2)' }}>
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

// ─── Panel E-commerce ─────────────────────────────────────────────────────────
function EcommercePanel({ customer, onClose }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/orders?customer_id=${customer.id}&channel=ecommerce`)
      .then(r => r.json())
      .then(d => { setOrders(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [customer.id])

  const totalSpend = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0)
  const avgOrder = orders.length ? totalSpend / orders.length : 0
  const lastOrder = orders[0]?.order_date
  const isRepeat = orders.length > 1

  // Produits les plus achetés
  const skuCount = {}
  orders.forEach(o => (o.lines || []).forEach(l => {
    if (!skuCount[l.product_name]) skuCount[l.product_name] = 0
    skuCount[l.product_name] += l.quantity_ordered || 1
  }))
  const topProducts = Object.entries(skuCount).sort((a, b) => b[1] - a[1]).slice(0, 3)

  return (
    <div style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 480, background: '#fff', borderLeft: '1px solid var(--border)', boxShadow: '-12px 0 48px rgba(0,0,0,0.07)', zIndex: 500, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ padding: '1.5rem 1.75rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <span className="badge badge-green">e-commerce</span>
              {isRepeat && <span className="badge badge-blue">Repeat buyer</span>}
            </div>
            <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em' }}>{customer.name}</h2>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 16, color: 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
      </div>

      <div style={{ padding: '1.25rem 1.75rem', flex: 1 }}>

        {/* KPIs */}
        <SectionTitle>Customer Overview</SectionTitle>
        <KpiRow items={[
          { label: 'Total Spend', value: fmt(totalSpend), color: 'var(--green)' },
          { label: 'Orders', value: orders.length },
          { label: 'Avg Order', value: fmt(avgOrder) },
        ]} />

        {/* Infos contact */}
        <SectionTitle>Contact</SectionTitle>
        <InfoGrid items={[
          ['Email', customer.email],
          ['Phone', customer.phone],
          ['Last Order', lastOrder || '—'],
          ['Shopify ID', customer.shopify_customer_id ? `#${customer.shopify_customer_id}` : '—'],
        ]} />

        {/* Produits favoris */}
        {topProducts.length > 0 && (
          <>
            <SectionTitle>Top Products</SectionTitle>
            <div style={{ marginBottom: '1.25rem' }}>
              {topProducts.map(([name, qty]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0.75rem', background: 'var(--bg)', borderRadius: 8, marginBottom: 4, fontSize: 13 }}>
                  <span>{name}</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-2)' }}>{qty} units</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Historique commandes */}
        <SectionTitle>Order History</SectionTitle>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-3)', fontSize: 13 }}>Loading...</div>
        ) : orders.length === 0 ? (
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '0.875rem', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>No orders yet</div>
        ) : orders.map(o => (
          <div key={o.id} style={{ background: 'var(--bg)', borderRadius: 10, padding: '0.875rem 1rem', marginBottom: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{o.order_number}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${o.status === 'fulfilled' ? 'badge-green' : 'badge-blue'}`} style={{ fontSize: 11 }}>{o.status}</span>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{fmt(o.total_amount)}</span>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{o.order_date}</div>
            {(o.lines || []).length > 0 && (
              <div style={{ marginTop: 6 }}>
                {o.lines.slice(0, 3).map((l, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'var(--text-2)' }}>· {l.product_name} × {l.quantity_ordered}</div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Modal Edit Customer ───────────────────────────────────────────────────────
function EditCustomerModal({ open, onClose, customer, priceLists, onSaved }) {
  const [form, setForm] = useState(EMPTY_CUSTOMER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    if (customer) setForm({
      name: customer.name || '', type: customer.type || 'wholesale',
      email: customer.email || '', phone: customer.phone || '',
      contact_name: customer.contact_name || '', contact_title: customer.contact_title || '',
      payment_terms_days: customer.payment_terms_days || 30,
      discount_pct: customer.discount_pct || 0,
      default_price_list_id: customer.default_price_list_id || '',
      notes: customer.notes || '', status: customer.status || 'active',
    })
  }, [customer])

  async function handleSubmit(e) {
    e.preventDefault(); setSaving(true); setError(null)
    const res = await fetch('/api/customers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: customer.id, ...form, default_price_list_id: form.default_price_list_id || null })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    onSaved(); setSaving(false)
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit Customer" subtitle={customer?.name} width={560}>
      <form onSubmit={handleSubmit}>
        <ModalError message={error} />
        <div style={{ marginBottom: '0.5rem', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Company</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <FormField label="Company Name" required><ModalInput value={form.name} onChange={e => f('name', e.target.value)} required /></FormField>
          </div>
          <FormField label="Type">
            <ModalSelect value={form.type} onChange={e => f('type', e.target.value)}>
              <option value="wholesale">Wholesale</option>
              <option value="ecommerce">E-commerce</option>
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
              <option value="">None</option>
              {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name}</option>)}
            </ModalSelect>
          </FormField>
          <FormField label="Discount %">
            <ModalInput type="number" step="0.1" min="0" max="100" value={form.discount_pct} onChange={e => f('discount_pct', parseFloat(e.target.value) || 0)} />
          </FormField>
        </div>
        <div style={{ marginBottom: '0.5rem', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contact</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
          <FormField label="Name"><ModalInput value={form.contact_name} onChange={e => f('contact_name', e.target.value)} /></FormField>
          <FormField label="Title"><ModalInput value={form.contact_title} onChange={e => f('contact_title', e.target.value)} /></FormField>
          <FormField label="Email"><ModalInput type="email" value={form.email} onChange={e => f('email', e.target.value)} /></FormField>
          <FormField label="Phone"><ModalInput value={form.phone} onChange={e => f('phone', e.target.value)} /></FormField>
        </div>
        <div style={{ marginBottom: '0.5rem', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Terms</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1rem' }}>
          <FormField label="Payment Terms (days)"><ModalInput type="number" value={form.payment_terms_days} onChange={e => f('payment_terms_days', parseInt(e.target.value))} /></FormField>
        </div>
        <FormField label="Notes"><ModalInput value={form.notes} onChange={e => f('notes', e.target.value)} /></FormField>
        <ModalActions>
          <BtnSecondary onClick={onClose}>Cancel</BtnSecondary>
          <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</BtnPrimary>
        </ModalActions>
      </form>
    </Modal>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────
export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [priceLists, setPriceLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('wholesale')
  const [createOpen, setCreateOpen] = useState(false)
  const [editCustomer, setEditCustomer] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(EMPTY_CUSTOMER)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const isEcom = tab === 'ecommerce'

  useEffect(() => { fetchCustomers() }, [search, tab])
  useEffect(() => {
    fetch('/api/price-lists').then(r => r.json())
      .then(d => setPriceLists(Array.isArray(d) ? d.filter(p => p.type === 'wholesale') : []))
  }, [])

  async function fetchCustomers() {
    setLoading(true)
    const res = await fetch('/api/customers')
    const data = await res.json()
    let all = Array.isArray(data) ? data : []
    if (search) all = all.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    if (isEcom) all = all.filter(c => c.type === 'ecommerce' || c.type === 'retail')
    else all = all.filter(c => c.type !== 'ecommerce' && c.type !== 'retail')
    setCustomers(all)
    setLoading(false)
    if (selected) {
      const r = all.find(c => c.id === selected.id)
      if (r) setSelected(r)
    }
  }

  async function handleCreate(e) {
    e.preventDefault(); setSaving(true); setError(null)
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, default_price_list_id: form.default_price_list_id || null })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setCreateOpen(false); setForm(EMPTY_CUSTOMER); fetchCustomers(); setSaving(false)
  }

  const selectCustomer = (c) => setSelected(selected?.id === c.id ? null : c)

  return (
    <Layout>
      {selected && <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, zIndex: 490, background: 'rgba(0,0,0,0.12)' }} />}

      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p className="page-sub">{customers.length} {isEcom ? 'e-commerce customer' : 'wholesale partner'}{customers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          {!isEcom && (
            <button className="btn-primary" onClick={() => { setCreateOpen(true); setError(null); setForm(EMPTY_CUSTOMER) }}>
              + New Customer
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', marginBottom: '1.25rem' }}>
        {[{ key: 'wholesale', label: 'Wholesale & Partners' }, { key: 'ecommerce', label: 'E-commerce' }].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setSelected(null) }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.6rem 1.1rem', fontSize: 14, fontWeight: tab === t.key ? 600 : 400, color: tab === t.key ? 'var(--text-1)' : 'var(--text-3)', borderBottom: `2px solid ${tab === t.key ? 'var(--text-1)' : 'transparent'}`, marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder={`Search ${isEcom ? 'e-commerce customers' : 'distributors'}...`} value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Modal création */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Customer" subtitle="Add a wholesale distributor or partner" width={580}>
        <form onSubmit={handleCreate}>
          <ModalError message={error} />
          <div style={{ marginBottom: '0.5rem', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Company</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Company Name" required><ModalInput value={form.name} onChange={e => f('name', e.target.value)} placeholder="Acme Beauty Retail" required /></FormField>
            </div>
            <FormField label="Type">
              <ModalSelect value={form.type} onChange={e => f('type', e.target.value)}>
                <option value="wholesale">Wholesale</option>
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
          <div style={{ marginBottom: '0.5rem', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contact</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Contact Name"><ModalInput value={form.contact_name} onChange={e => f('contact_name', e.target.value)} placeholder="Jane Smith" /></FormField>
            <FormField label="Title"><ModalInput value={form.contact_title} onChange={e => f('contact_title', e.target.value)} placeholder="Buyer" /></FormField>
            <FormField label="Email"><ModalInput type="email" value={form.email} onChange={e => f('email', e.target.value)} /></FormField>
            <FormField label="Phone"><ModalInput value={form.phone} onChange={e => f('phone', e.target.value)} /></FormField>
          </div>
          <div style={{ marginBottom: '0.5rem', fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Terms</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1rem' }}>
            <FormField label="Payment Terms (days)"><ModalInput type="number" value={form.payment_terms_days} onChange={e => f('payment_terms_days', parseInt(e.target.value))} /></FormField>
            <FormField label="Discount %"><ModalInput type="number" step="0.1" min="0" max="100" value={form.discount_pct} onChange={e => f('discount_pct', parseFloat(e.target.value) || 0)} placeholder="0" /></FormField>
          </div>
          <FormField label="Notes"><ModalInput value={form.notes} onChange={e => f('notes', e.target.value)} /></FormField>
          <ModalActions>
            <BtnSecondary onClick={() => setCreateOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Customer'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>

      <EditCustomerModal open={!!editCustomer} onClose={() => setEditCustomer(null)} customer={editCustomer} priceLists={priceLists} onSaved={() => { setEditCustomer(null); fetchCustomers() }} />

      {/* Table */}
      <div className="card" style={{ marginRight: selected ? 516 : 0, transition: 'margin-right 0.2s' }}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              {!isEcom && <th>Contact</th>}
              <th>Email</th>
              {!isEcom && <><th>Terms</th><th>Discount</th><th>Locations</th></>}
              {isEcom && <><th>Orders</th><th>Source</th></>}
              <th>Status</th>
              {!isEcom && <th style={{ width: 60 }}></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>
                {isEcom ? 'E-commerce customers appear automatically when Shopify orders are imported.' : 'No customers yet.'}
              </td></tr>
            ) : customers.map(c => (
              <tr key={c.id} onClick={() => selectCustomer(c)} style={{ cursor: 'pointer', background: selected?.id === c.id ? 'var(--bg)' : 'inherit' }}>
                <td>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  {isEcom && c.shopify_customer_id && <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Shopify #{c.shopify_customer_id}</div>}
                </td>
                {!isEcom && <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{c.contact_name || '—'}</td>}
                <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{c.email || '—'}</td>
                {!isEcom && (
                  <>
                    <td style={{ fontSize: 13 }}>Net {c.payment_terms_days}</td>
                    <td>{c.discount_pct > 0 ? <span className="badge badge-amber">{c.discount_pct}%</span> : <span style={{ color: 'var(--text-3)', fontSize: 13 }}>—</span>}</td>
                    <td style={{ fontSize: 13, color: 'var(--text-2)' }}>{c.locations?.filter(l => l.is_active !== false).length || 0}</td>
                  </>
                )}
                {isEcom && (
                  <>
                    <td style={{ fontSize: 13, color: 'var(--text-2)' }}>—</td>
                    <td>{c.shopify_customer_id ? <span className="badge badge-green" style={{ fontSize: 11 }}>Shopify</span> : <span className="badge badge-gray" style={{ fontSize: 11 }}>Manual</span>}</td>
                  </>
                )}
                <td><span className={`badge ${STATUS_COLORS[c.status] || 'badge-gray'}`} style={{ fontSize: 11 }}>{c.status}</span></td>
                {!isEcom && (
                  <td onClick={e => e.stopPropagation()}>
                    <button onClick={() => setEditCustomer(c)} style={{ fontSize: 12, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', color: 'var(--text-2)' }}>
                      Edit
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Panels */}
      {selected && !isEcom && (
        <WholesalePanel customer={selected} priceLists={priceLists} onClose={() => setSelected(null)} onRefresh={fetchCustomers} onEdit={() => setEditCustomer(selected)} />
      )}
      {selected && isEcom && (
        <EcommercePanel customer={selected} onClose={() => setSelected(null)} />
      )}
    </Layout>
  )
}
