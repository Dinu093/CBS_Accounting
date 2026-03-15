import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd, fdate, initials } from '../lib/constants'
import { useAuth } from '../lib/auth'

export async function getServerSideProps() { return { props: {} } }

const EMPTY_DIST = { name: '', channel: 'Wholesale', contact_name: '', email: '', phone: '', discount_pct: 40, payment_terms_days: 30, resale_certificate: '', resale_certificate_expiry: '', notes: '' }
const EMPTY_LOC = { name: '', contact_name: '', email: '', phone: '', address: '', city: '', state: '', zip: '', is_primary: false }

export default function Distributors() {
  const { isAdmin } = useAuth()
  const [distributors, setDistributors] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [showDistModal, setShowDistModal] = useState(false)
  const [showLocModal, setShowLocModal] = useState(false)
  const [editingDist, setEditingDist] = useState(null)
  const [editingLoc, setEditingLoc] = useState(null)
  const [distForm, setDistForm] = useState(EMPTY_DIST)
  const [locForm, setLocForm] = useState(EMPTY_LOC)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('info')

  const load = () => {
    setLoading(true)
    fetch('/api/distributors').then(r => r.json()).then(d => {
      const list = Array.isArray(d) ? d : []
      setDistributors(list)
      if (selected) setSelected(list.find(x => x.id === selected.id) || null)
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const openNewDist = () => { setEditingDist(null); setDistForm(EMPTY_DIST); setShowDistModal(true) }
  const openEditDist = (d) => {
    setEditingDist(d.id)
    setDistForm({ name: d.name, channel: d.channel || 'Wholesale', contact_name: d.contact_name || '', email: d.email || '', phone: d.phone || '', discount_pct: d.discount_pct || 40, payment_terms_days: d.payment_terms_days || 30, resale_certificate: d.resale_certificate || '', resale_certificate_expiry: d.resale_certificate_expiry || '', notes: d.notes || '' })
    setShowDistModal(true)
  }

  const saveDist = async () => {
    if (!distForm.name) return
    setSaving(true)
    const body = {
      ...distForm,
      discount_pct: +distForm.discount_pct || 40,
      payment_terms_days: +distForm.payment_terms_days || 30,
      resale_certificate: distForm.resale_certificate || null,
      resale_certificate_expiry: distForm.resale_certificate_expiry || null,
      phone: distForm.phone || null,
      contact_name: distForm.contact_name || null,
      email: distForm.email || null,
      notes: distForm.notes || null,
    }
    if (editingDist) { body.id = editingDist; await fetch('/api/distributors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    else await fetch('/api/distributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false); setShowDistModal(false); load()
  }

  const delDist = async (id) => {
    if (!confirm('Delete this distributor and all its locations?')) return
    await fetch('/api/distributors?id=' + id, { method: 'DELETE' })
    setSelected(null); load()
  }

  const openNewLoc = () => { setEditingLoc(null); setLocForm(EMPTY_LOC); setShowLocModal(true) }
  const openEditLoc = (l) => {
    setEditingLoc(l.id)
    setLocForm({ name: l.name || '', contact_name: l.contact_name || '', email: l.email || '', phone: l.phone || '', address: l.address || '', city: l.city || '', state: l.state || '', zip: l.zip || '', is_primary: l.is_primary || false })
    setShowLocModal(true)
  }

  const saveLoc = async () => {
    if (!locForm.city && !locForm.address && !locForm.name) { alert('Please fill at least a name, city or address'); return }
    setSaving(true)
    const body = {
      distributor_id: selected.id,
      name: locForm.name || null,
      contact_name: locForm.contact_name || null,
      email: locForm.email || null,
      phone: locForm.phone || null,
      address: locForm.address || null,
      city: locForm.city || null,
      state: locForm.state || null,
      zip: locForm.zip || null,
      is_primary: locForm.is_primary || false,
    }
    const url = editingLoc ? '/api/locations' : '/api/locations'
    const method = editingLoc ? 'PUT' : 'POST'
    if (editingLoc) body.id = editingLoc
    const resp = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await resp.json()
    setSaving(false)
    if (data.error) { alert('Error: ' + data.error); return }
    setShowLocModal(false)
    setLocForm(EMPTY_LOC)
    load()
  }

  const delLoc = async (id) => {
    if (!confirm('Delete this location?')) return
    await fetch('/api/locations?id=' + id, { method: 'DELETE' }); load()
  }

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Distributors</h1><p>{distributors.length} distributor{distributors.length !== 1 ? 's' : ''}</p></div>
        {isAdmin && <button className="btn btn-primary" onClick={openNewDist}>+ New distributor</button>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1.6fr' : '1fr', gap: 20 }}>
        {/* List */}
        <div>
          {loading ? <div className="loading">Loading…</div> : distributors.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>No distributors yet</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {distributors.map(d => {
                const locs = d.distributor_locations || []
                const isSelected = selected?.id === d.id
                return (
                  <div key={d.id} onClick={() => { setSelected(isSelected ? null : d); setActiveTab('info') }}
                    style={{ background: '#fff', border: `1.5px solid ${isSelected ? 'var(--navy)' : 'var(--border)'}`, borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="avatar" style={{ width: 38, height: 38, fontSize: 13 }}>{initials(d.name)}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 15 }}>{d.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{locs.length} location{locs.length !== 1 ? 's' : ''} · {d.discount_pct}% discount · Net {d.payment_terms_days}</div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <span className={`badge ${d.resale_certificate ? 'badge-green' : 'badge-amber'}`}>{d.resale_certificate ? 'Cert. on file' : 'No cert.'}</span>
                        {isAdmin && <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); openEditDist(d) }}>Edit</button>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="card" style={{ position: 'sticky', top: 20, alignSelf: 'start' }}>
            <div className="card-header" style={{ alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="avatar" style={{ width: 40, height: 40, fontSize: 14 }}>{initials(selected.name)}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 16 }}>{selected.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{selected.channel}</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => delDist(selected.id)}>Delete</button>}
                <button className="btn btn-outline btn-sm" onClick={() => setSelected(null)}>Close</button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 18px' }}>
              {[['info', 'Info'], ['locations', `Locations (${(selected.distributor_locations || []).length})`]].map(([v, l]) => (
                <button key={v} onClick={() => setActiveTab(v)} style={{ padding: '10px 14px', fontSize: 13, fontWeight: activeTab === v ? 500 : 400, color: activeTab === v ? 'var(--text)' : 'var(--text-3)', background: 'none', border: 'none', borderBottom: `2px solid ${activeTab === v ? 'var(--text)' : 'transparent'}`, cursor: 'pointer', marginBottom: -1 }}>{l}</button>
              ))}
            </div>

            {activeTab === 'info' && (
              <div style={{ padding: '18px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  {[
                    ['Contact', selected.contact_name || '—'],
                    ['Email', selected.email || '—'],
                    ['Phone', selected.phone || '—'],
                    ['Discount', selected.discount_pct + '%'],
                    ['Payment terms', 'Net ' + selected.payment_terms_days],
                    ['Channel', selected.channel],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <div style={{ fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{l}</div>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{v}</div>
                    </div>
                  ))}
                </div>
                {selected.resale_certificate && (
                  <div style={{ padding: '10px 14px', background: 'var(--green-light)', borderRadius: 8, fontSize: 13, color: 'var(--green)' }}>
                    ✓ Resale certificate: {selected.resale_certificate}{selected.resale_certificate_expiry ? ` · Expires ${fdate(selected.resale_certificate_expiry)}` : ''}
                  </div>
                )}
                {selected.notes && <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-3)' }}>{selected.notes}</div>}
              </div>
            )}

            {activeTab === 'locations' && (
              <div style={{ padding: '18px' }}>
                {isAdmin && (
                  <button className="btn btn-primary btn-sm" style={{ marginBottom: 14 }} onClick={openNewLoc}>+ Add location</button>
                )}
                {(selected.distributor_locations || []).length === 0 ? (
                  <div style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', padding: 24 }}>No locations yet</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {selected.distributor_locations.map(loc => (
                      <div key={loc.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{loc.name || loc.city || 'Location'}{loc.is_primary && <span className="badge badge-blue" style={{ marginLeft: 8, fontSize: 10 }}>Primary</span>}</div>
                            {loc.contact_name && <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{loc.contact_name}</div>}
                            {loc.email && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{loc.email}</div>}
                            {loc.phone && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{loc.phone}</div>}
                            {loc.address && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{loc.address}, {loc.city} {loc.state} {loc.zip}</div>}
                          </div>
                          {isAdmin && (
                            <div style={{ display: 'flex', gap: 6, marginLeft: 10 }}>
                              <button className="btn btn-outline btn-sm" onClick={() => openEditLoc(loc)}>Edit</button>
                              <button className="btn btn-danger btn-sm" onClick={() => delLoc(loc.id)}>×</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Distributor modal */}
      {showDistModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowDistModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>{editingDist ? 'Edit distributor' : 'New distributor'}</h2>
              <button className="modal-close" onClick={() => setShowDistModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {/* Section: Identity */}
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Identity</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Company name *</label><input type="text" value={distForm.name} onChange={e => setDistForm({ ...distForm, name: e.target.value })} placeholder="Joseph's Salon" /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Channel</label>
                  <select value={distForm.channel} onChange={e => setDistForm({ ...distForm, channel: e.target.value })}>
                    <option>Wholesale</option><option>E-commerce</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Main contact</label><input type="text" value={distForm.contact_name} onChange={e => setDistForm({ ...distForm, contact_name: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Email</label><input type="email" value={distForm.email} onChange={e => setDistForm({ ...distForm, email: e.target.value })} /></div>
              </div>

              {/* Section: Commercial */}
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingTop: 16, borderTop: '1px solid var(--border)' }}>Commercial terms</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Discount %</label>
                  <input type="number" value={distForm.discount_pct} onChange={e => setDistForm({ ...distForm, discount_pct: e.target.value })} min="0" max="100" />
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>Price = MSRP × (1 − {distForm.discount_pct}%)</div>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Payment terms (days)</label><input type="number" value={distForm.payment_terms_days} onChange={e => setDistForm({ ...distForm, payment_terms_days: e.target.value })} /></div>
              </div>

              {/* Section: Tax */}
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingTop: 16, borderTop: '1px solid var(--border)' }}>Tax & compliance</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Resale certificate #</label><input type="text" value={distForm.resale_certificate} onChange={e => setDistForm({ ...distForm, resale_certificate: e.target.value })} placeholder="KY-2025-XXXXX" /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Certificate expiry</label><input type="date" value={distForm.resale_certificate_expiry} onChange={e => setDistForm({ ...distForm, resale_certificate_expiry: e.target.value })} /></div>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Notes</label><textarea value={distForm.notes} onChange={e => setDistForm({ ...distForm, notes: e.target.value })} rows={2} placeholder="Any relevant notes…" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowDistModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveDist} disabled={saving}>{saving ? 'Saving…' : editingDist ? 'Update' : 'Create distributor'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Location modal */}
      {showLocModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowLocModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <h2>{editingLoc ? 'Edit location' : 'New location'} — {selected?.name}</h2>
              <button className="modal-close" onClick={() => setShowLocModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Location info</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Location name</label><input type="text" value={locForm.name} onChange={e => setLocForm({ ...locForm, name: e.target.value })} placeholder="Main store, Downtown…" /></div>
                <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                  <div style={{ flex: 1 }}><label className="form-label">Primary location</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 38 }}>
                      <input type="checkbox" checked={locForm.is_primary} onChange={e => setLocForm({ ...locForm, is_primary: e.target.checked })} style={{ width: 'auto' }} />
                      <span style={{ fontSize: 13 }}>Set as primary</span>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingTop: 14, borderTop: '1px solid var(--border)' }}>Contact</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Contact name</label><input type="text" value={locForm.contact_name} onChange={e => setLocForm({ ...locForm, contact_name: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">Email</label><input type="email" value={locForm.email} onChange={e => setLocForm({ ...locForm, email: e.target.value })} /></div>
              </div>
              <div className="form-group" style={{ marginBottom: 16 }}><label className="form-label">Phone</label><input type="text" value={locForm.phone} onChange={e => setLocForm({ ...locForm, phone: e.target.value })} /></div>

              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, paddingTop: 14, borderTop: '1px solid var(--border)' }}>Address</div>
              <div className="form-group" style={{ marginBottom: 12 }}><label className="form-label">Street address</label><input type="text" value={locForm.address} onChange={e => setLocForm({ ...locForm, address: e.target.value })} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">City</label><input type="text" value={locForm.city} onChange={e => setLocForm({ ...locForm, city: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">State</label><input type="text" value={locForm.state} onChange={e => setLocForm({ ...locForm, state: e.target.value })} maxLength={2} placeholder="KY" /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label className="form-label">ZIP</label><input type="text" value={locForm.zip} onChange={e => setLocForm({ ...locForm, zip: e.target.value })} /></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowLocModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveLoc} disabled={saving}>{saving ? 'Saving…' : editingLoc ? 'Update location' : 'Add location'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
