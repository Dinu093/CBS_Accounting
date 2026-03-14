import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import DateFilter, { filterByDate } from '../components/DateFilter'
import { usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

const CHANNELS = ['E-commerce', 'Wholesale USA', 'Wholesale International', 'Retail']
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

function BarChart({ data, height = 180 }) {
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '2rem' }}>No data yet</div>
  const max = Math.max(...data.map(d => Math.max(d.ecom || 0, d.wholesale || 0, d.gifted || 0)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, paddingBottom: 24, position: 'relative' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 2 }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1, justifyContent: 'flex-end', height: height - 28 }}>
            {d.ecom > 0 && <div style={{ width: '100%', height: Math.max(3, (d.ecom / max) * (height - 28) * 0.9), background: '#6A1B9A', borderRadius: '3px 3px 0 0' }} title={'E-commerce: ' + usd(d.ecom)} />}
            {d.wholesale > 0 && <div style={{ width: '100%', height: Math.max(3, (d.wholesale / max) * (height - 28) * 0.9), background: 'var(--green)', borderRadius: '3px 3px 0 0' }} title={'Wholesale: ' + usd(d.wholesale)} />}
            {d.gifted > 0 && <div style={{ width: '100%', height: Math.max(3, (d.gifted / max) * (height - 28) * 0.9), background: 'var(--amber)', borderRadius: '3px 3px 0 0' }} title={'Gifted: ' + usd(d.gifted)} />}
          </div>
          <div style={{ fontSize: 9.5, color: 'var(--text-muted)', position: 'absolute', bottom: 0 }}>{d.label}</div>
        </div>
      ))}
    </div>
  )
}

export default function Distribution() {
  const [orders, setOrders] = useState([])
  const [distributors, setDistributors] = useState([])
  const [products, setProducts] = useState([])
  const [prices, setPrices] = useState([])
  const [gifted, setGifted] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ from: null, to: null })
  const [activeTab, setActiveTab] = useState('overview')
  const [saving, setSaving] = useState(false)

  // Modals
  const [showDistModal, setShowDistModal] = useState(false)
  const [editingDist, setEditingDist] = useState(null)
  const [editingLoc, setEditingLoc] = useState(null)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [showGiftedModal, setShowGiftedModal] = useState(false)
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [selectedDist, setSelectedDist] = useState(null)

  // Forms
  const EMPTY_DIST = { name: '', channel: 'Wholesale USA', contact: '', note: '' }
  const EMPTY_LOC = { distributor_id: '', name: '', contact_name: '', email: '', phone: '', address: '', city: '', state: '', zip: '', is_primary: false }
  const EMPTY_PRICE = { distributor_id: '', product_id: '', retail_price: '', wholesale_price: '' }
  const EMPTY_GIFTED = { date: new Date().toISOString().split('T')[0], recipient: '', occasion: '', note: '' }
  const EMPTY_TARGET = { distributor_id: '', period: new Date().toISOString().slice(0, 7), target_amount: '' }

  const [distForm, setDistForm] = useState(EMPTY_DIST)
  const [locForm, setLocForm] = useState(EMPTY_LOC)
  const [priceForm, setPriceForm] = useState(EMPTY_PRICE)
  const [giftedForm, setGiftedForm] = useState(EMPTY_GIFTED)
  const [giftedLines, setGiftedLines] = useState([{ product_id: '', quantity: '' }])
  const [targetForm, setTargetForm] = useState(EMPTY_TARGET)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/sales').then(r => r.json()),
      fetch('/api/distributors').then(r => r.json()),
      fetch('/api/inventory').then(r => r.json()),
      fetch('/api/distributors?prices=1').then(r => r.json()),
      fetch('/api/gifted').then(r => r.json()),
      fetch('/api/locations').then(r => r.json()),
    ]).then(([o, d, p, pr, g, l]) => {
      setOrders(Array.isArray(o) ? o : [])
      setDistributors(Array.isArray(d) ? d : [])
      setProducts(Array.isArray(p) ? p : [])
      setPrices(Array.isArray(pr) ? pr : [])
      setGifted(Array.isArray(g) ? g : [])
      setLocations(Array.isArray(l) ? l : [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const filteredOrders = filterByDate(orders, 'date', dateRange)
  const filteredGifted = filterByDate(gifted, 'date', dateRange)

  const ecomCA = filteredOrders.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const wsCA = filteredOrders.filter(o => o.channel !== 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const giftedCost = filteredGifted.reduce((a, g) => a + (g.gifted_item_lines?.reduce((b, l) => b + (parseFloat(l.quantity) * parseFloat(l.unit_cost || 0)), 0) || 0), 0)

  const monthlyData = () => {
    const months = {}
    filteredOrders.forEach(o => {
      const m = o.date?.slice(0, 7); if (!m) return
      if (!months[m]) months[m] = { ecom: 0, wholesale: 0, gifted: 0 }
      if (o.channel === 'E-commerce') months[m].ecom += parseFloat(o.total_amount || 0)
      else months[m].wholesale += parseFloat(o.total_amount || 0)
    })
    filteredGifted.forEach(g => {
      const m = g.date?.slice(0, 7); if (!m) return
      if (!months[m]) months[m] = { ecom: 0, wholesale: 0, gifted: 0 }
      months[m].gifted += g.gifted_item_lines?.reduce((b, l) => b + (parseFloat(l.quantity) * parseFloat(l.unit_cost || 0)), 0) || 0
    })
    return Object.entries(months).sort().slice(-6).map(([k, v]) => ({ label: k.slice(5), ...v }))
  }

  const distPerf = distributors.map(d => {
    const distOrders = filteredOrders.filter(o => o.distributor_id === d.id)
    const realized = distOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
    const distLocs = locations.filter(l => l.distributor_id === d.id)
    return { ...d, realized, orders: distOrders.length, locations: distLocs }
  })

  const pct = (v, t) => t > 0 ? Math.min(100, (v / t) * 100) : 0

  const saveDist = async () => {
    if (!distForm.name) return
    setSaving(true)
    if (editingDist) {
      await fetch('/api/distributors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'distributor', id: editingDist, ...distForm }) })
    } else {
      await fetch('/api/distributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'distributor', ...distForm }) })
    }
    setSaving(false); setShowDistModal(false); setDistForm(EMPTY_DIST); setEditingDist(null); load()
  }

  const saveLocation = async () => {
    if (!locForm.name || !locForm.distributor_id) return
    setSaving(true)
    if (editingLoc) {
      await fetch('/api/locations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingLoc, ...locForm }) })
    } else {
      await fetch('/api/locations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(locForm) })
    }
    setSaving(false); setShowLocationModal(false); setEditingLoc(null); setLocForm(EMPTY_LOC); load()
  }

  const savePrice = async () => {
    if (!priceForm.distributor_id || !priceForm.product_id) return
    setSaving(true)
    await fetch('/api/distributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'price', ...priceForm }) })
    setSaving(false); setShowPriceModal(false); setPriceForm(EMPTY_PRICE); load()
  }

  const saveGifted = async () => {
    if (!giftedForm.recipient || giftedLines.some(l => !l.product_id || !l.quantity)) return
    setSaving(true)
    const lines = giftedLines.map(l => ({ ...l, unit_cost: products.find(p => p.id === l.product_id)?.unit_cost || 0 }))
    await fetch('/api/gifted', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gifted: giftedForm, lines }) })
    setSaving(false); setShowGiftedModal(false); setGiftedForm(EMPTY_GIFTED); setGiftedLines([{ product_id: '', quantity: '' }]); load()
  }

  const saveTarget = async () => {
    if (!targetForm.distributor_id || !targetForm.target_amount) return
    setSaving(true)
    await fetch('/api/gifted', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(targetForm) })
    setSaving(false); setShowTargetModal(false); load()
  }

  const deleteDist = async (id) => { if (!confirm('Delete distributor?')) return; await fetch('/api/distributors?id=' + id + '&type=distributor', { method: 'DELETE' }); load() }
  const deleteLoc = async (id) => { if (!confirm('Delete location?')) return; await fetch('/api/locations?id=' + id, { method: 'DELETE' }); load() }
  const deleteGifted = async (id) => { if (!confirm('Delete?')) return; await fetch('/api/gifted?id=' + id, { method: 'DELETE' }); load() }

  const priceMatrix = {}
  prices.forEach(p => {
    const prodName = p.inventory?.product_name || 'Unknown'
    const distName = p.distributors?.name || 'Unknown'
    if (!priceMatrix[prodName]) priceMatrix[prodName] = { cost: p.inventory?.unit_cost || 0, distributors: {} }
    priceMatrix[prodName].distributors[distName] = { retail: p.retail_price, wholesale: p.wholesale_price, channel: p.distributors?.channel, id: p.id }
  })

  const TABS = [
    { id: 'overview', label: '📊 Overview' },
    { id: 'distributors', label: '🏪 Distributors' },
    { id: 'pricing', label: '💰 Pricing' },
    { id: 'gifted', label: '🎁 Gifted' },
  ]

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Distribution</h1><p>{distributors.length} distributors · {products.length} products</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowGiftedModal(true)}>+ Gifted</button>
          <button onClick={() => setShowPriceModal(true)}>+ Pricing</button>
          <button onClick={() => setShowLocationModal(true)}>+ Location</button>
          <button className="primary" onClick={() => setShowDistModal(true)}>+ Distributor</button>
        </div>
      </div>

      <DateFilter onChange={setDateRange} />

      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={'tab-btn' + (activeTab === t.id ? ' active' : '')}>{t.label}</button>)}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <>
          {activeTab === 'overview' && (
            <div>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                {[['E-commerce', usd(ecomCA), '#6A1B9A'], ['Wholesale', usd(wsCA), 'var(--green)'], ['Gifted (cost)', usd(giftedCost), 'var(--amber)'], ['Total revenue', usd(ecomCA + wsCA), 'var(--navy)']].map(([l, v, c]) => (
                  <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                <div className="card">
                  <div className="section-title" style={{ marginBottom: '0.75rem' }}>Monthly revenue by channel</div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12 }}>
                    {[['#6A1B9A', 'E-commerce'], ['var(--green)', 'Wholesale'], ['var(--amber)', 'Gifted']].map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}><div style={{ width: 10, height: 10, background: c, borderRadius: 2 }} /><span style={{ color: 'var(--text-muted)' }}>{l}</span></div>
                    ))}
                  </div>
                  <BarChart data={monthlyData()} />
                </div>
                <div className="card">
                  <div className="section-title" style={{ marginBottom: '0.75rem' }}>Distributor performance</div>
                  {distPerf.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No distributors yet</div> : distPerf.map(d => (
                    <div key={d.id} style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                        <span style={{ fontWeight: 500 }}>{d.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{usd(d.realized)}</span>
                      </div>
                      <div style={{ height: 5, background: 'var(--cream-dark)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: Math.min(100, d.realized > 0 ? 100 : 0) + '%', background: 'var(--green)', borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{d.orders} order{d.orders !== 1 ? 's' : ''} · {d.locations.length} location{d.locations.length !== 1 ? 's' : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>US state map (Wholesale)</div>
                {(() => {
                  const stateCounts = {}
                  filteredOrders.filter(o => o.channel === 'Wholesale USA').forEach(o => {
                    const dist = distributors.find(d => d.id === o.distributor_id)
                    if (dist?.note) stateCounts[dist.note] = (stateCounts[dist.note] || 0) + parseFloat(o.total_amount || 0)
                    const loc = locations.find(l => l.id === o.location_id)
                    if (loc?.state) stateCounts[loc.state] = (stateCounts[loc.state] || 0) + parseFloat(o.total_amount || 0)
                  })
                  const maxVal = Math.max(...Object.values(stateCounts), 1)
                  return (
                    <div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {US_STATES.map(s => {
                          const val = stateCounts[s] || 0
                          const intensity = val > 0 ? Math.max(0.15, val / maxVal) : 0
                          return <div key={s} title={s + (val > 0 ? ': ' + usd(val) : '')} style={{ width: 36, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: val > 0 ? 'rgba(42,107,74,' + intensity + ')' : 'var(--cream)', border: '1px solid var(--border)', fontSize: 9, fontWeight: val > 0 ? 600 : 400, color: intensity > 0.5 ? 'white' : 'var(--text-muted)' }}>{s}</div>
                        })}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>💡 States are populated from location addresses. Add locations to your distributors to see the map fill in.</div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {activeTab === 'distributors' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {distributors.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>No distributors yet</div>
              ) : distributors.map(d => {
                const distOrders = filteredOrders.filter(o => o.distributor_id === d.id)
                const ca = distOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
                const distLocs = locations.filter(l => l.distributor_id === d.id)
                return (
                  <div key={d.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                        <span className="pill" style={{ marginTop: 4, background: d.channel === 'E-commerce' ? '#E8EAF6' : 'var(--green-light)', color: d.channel === 'E-commerce' ? '#283593' : 'var(--green)' }}>{d.channel}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setDistForm({ name: d.name, channel: d.channel, contact: d.contact || '', note: d.note || '' }); setEditingDist(d.id); setShowDistModal(true) }} style={{ border: 'none', background: 'none', color: 'var(--blue-pearl)', cursor: 'pointer', fontSize: 12, padding: '2px 6px' }}>Edit</button>
                      <button onClick={() => deleteDist(d.id)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                    </div>
                    </div>
                    {d.contact && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{d.contact}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)', fontSize: 12, marginBottom: 10 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{distOrders.length} order{distOrders.length !== 1 ? 's' : ''}</span>
                      <span style={{ fontWeight: 600, color: 'var(--green)' }}>{usd(ca)}</span>
                    </div>

                    {/* Locations */}
                    {distLocs.length > 0 && (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Locations</div>
                        {distLocs.map(loc => (
                          <div key={loc.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: 12 }}>
                            <div>
                              <div style={{ fontWeight: 500 }}>{loc.name} {loc.is_primary && <span style={{ fontSize: 10, color: 'var(--blue-pearl)' }}>• Primary</span>}</div>
                              {loc.contact_name && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{loc.contact_name}{loc.email ? ' · ' + loc.email : ''}</div>}
                              {loc.address && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{loc.address}, {loc.city} {loc.state} {loc.zip}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => { setEditingLoc(loc.id); setLocForm({ distributor_id: loc.distributor_id, name: loc.name, contact_name: loc.contact_name || '', email: loc.email || '', phone: loc.phone || '', address: loc.address || '', city: loc.city || '', state: loc.state || '', zip: loc.zip || '', is_primary: loc.is_primary || false }); setShowLocationModal(true) }} style={{ border: 'none', background: 'none', color: 'var(--blue-pearl)', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }}>Edit</button>
                              <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => { setLocForm({ distributor_id: d.id, name: loc.name, contact_name: loc.contact_name || '', email: loc.email || '', phone: loc.phone || '', address: loc.address || '', city: loc.city || '', state: loc.state || '', zip: loc.zip || '', is_primary: loc.is_primary || false }); setEditingLoc(loc.id); setShowLocationModal(true) }} style={{ border: 'none', background: 'none', color: 'var(--blue-pearl)', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}>Edit</button>
                              <button onClick={() => deleteLoc(loc.id)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 4px' }}>×</button>
                            </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => { setLocForm({ ...EMPTY_LOC, distributor_id: d.id }); setShowLocationModal(true) }} style={{ flex: 1, fontSize: 11, padding: '5px', background: 'var(--blue-light)', color: 'var(--navy-mid)', borderColor: 'rgba(44,74,110,0.1)' }}>+ Add location</button>
                      <button onClick={() => { setTargetForm(f => ({ ...f, distributor_id: d.id })); setShowTargetModal(true) }} style={{ flex: 1, fontSize: 11, padding: '5px' }}>🎯 Set target</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'pricing' && (
            <div>
              {Object.keys(priceMatrix).length === 0 ? (
                <div className="card"><div className="empty-state"><div style={{ fontSize: 36 }}>💰</div><p>No pricing configured</p><button className="primary" onClick={() => setShowPriceModal(true)} style={{ marginTop: 12, fontSize: 12 }}>+ Add pricing</button></div></div>
              ) : Object.entries(priceMatrix).map(([prodName, data]) => (
                <div key={prodName} className="card" style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{prodName}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cost: <strong style={{ color: 'var(--red)' }}>{usd(data.cost)}</strong></span>
                  </div>
                  <table>
                    <thead><tr><th>Distributor</th><th>Channel</th><th style={{ textAlign: 'right' }}>Retail price</th><th style={{ textAlign: 'right' }}>Retail margin</th><th style={{ textAlign: 'right' }}>Wholesale price</th><th style={{ textAlign: 'right' }}>Wholesale margin</th></tr></thead>
                    <tbody>
                      {Object.entries(data.distributors).map(([distName, info]) => {
                        const rm = parseFloat(info.retail) - data.cost
                        const wm = parseFloat(info.wholesale) - data.cost
                        return (
                          <tr key={distName}>
                            <td style={{ fontWeight: 500 }}>{distName}</td>
                            <td><span className="pill" style={{ background: info.channel === 'E-commerce' ? '#E8EAF6' : 'var(--amber-light)', color: info.channel === 'E-commerce' ? '#283593' : 'var(--amber)' }}>{info.channel}</span></td>
                            <td style={{ textAlign: 'right' }}>{usd(info.retail)}</td>
                            <td style={{ textAlign: 'right' }}><span style={{ color: rm >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{usd(rm)} <span style={{ fontWeight: 400, fontSize: 11 }}>({parseFloat(info.retail) > 0 ? ((rm / parseFloat(info.retail)) * 100).toFixed(1) : 0}%)</span></span></td>
                            <td style={{ textAlign: 'right' }}>{usd(info.wholesale)}</td>
                            <td style={{ textAlign: 'right' }}><span style={{ color: wm >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 600 }}>{usd(wm)} <span style={{ fontWeight: 400, fontSize: 11 }}>({parseFloat(info.wholesale) > 0 ? ((wm / parseFloat(info.wholesale)) * 100).toFixed(1) : 0}%)</span></span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {activeTab === 'gifted' && (
            <div>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                  ['Units gifted', filteredGifted.reduce((a, g) => a + (g.gifted_item_lines?.reduce((b, l) => b + parseFloat(l.quantity || 0), 0) || 0), 0), 'var(--amber)'],
                  ['Total cost', usd(giftedCost), 'var(--red)'],
                  ['Shipments', filteredGifted.length, 'var(--text-muted)'],
                  ['Avg cost/shipment', usd(filteredGifted.length > 0 ? giftedCost / filteredGifted.length : 0), '#6A1B9A'],
                ].map(([l, v, c]) => (
                  <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
                ))}
              </div>
              {filteredGifted.length === 0 ? (
                <div className="card"><div className="empty-state"><div style={{ fontSize: 36 }}>🎁</div><p>No gifted items recorded</p><button className="primary" onClick={() => setShowGiftedModal(true)} style={{ marginTop: 12, fontSize: 12 }}>+ Add gifted shipment</button></div></div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table>
                    <thead><tr><th>Date</th><th>Recipient</th><th>Occasion</th><th>Products</th><th style={{ textAlign: 'right' }}>Cost</th><th></th></tr></thead>
                    <tbody>
                      {filteredGifted.map(g => {
                        const cost = g.gifted_item_lines?.reduce((a, l) => a + (parseFloat(l.quantity) * parseFloat(l.unit_cost || 0)), 0) || 0
                        return (
                          <tr key={g.id}>
                            <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{g.date}</td>
                            <td style={{ fontWeight: 500 }}>{g.recipient}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{g.occasion || '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.gifted_item_lines?.map(l => l.inventory?.product_name + ' ×' + l.quantity).join(', ')}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--red)' }}>{usd(cost)}</td>
                            <td><button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => deleteGifted(g.id)}>×</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add distributor modal */}
      {showDistModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowDistModal(false)}>
          <div className="modal">
            <h2>{editingDist ? 'Edit distributor' : 'New distributor'}</h2>
            <div className="form-group"><label>Name *</label><input type="text" placeholder="e.g. Beauty Bay, Sephora…" value={distForm.name} onChange={e => setDistForm({ ...distForm, name: e.target.value })} /></div>
            <div className="form-group"><label>Channel</label>
              <select value={distForm.channel} onChange={e => setDistForm({ ...distForm, channel: e.target.value })}>
                {CHANNELS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Contact (email or name)</label><input type="text" placeholder="contact@distributor.com" value={distForm.contact} onChange={e => setDistForm({ ...distForm, contact: e.target.value })} /></div>
            <div className="form-group"><label>US State (e.g. KY) — for heat map</label><input type="text" placeholder="KY" maxLength={2} value={distForm.note} onChange={e => setDistForm({ ...distForm, note: e.target.value.toUpperCase() })} /></div>
            <div className="form-actions"><button className="primary" onClick={saveDist} disabled={saving}>{saving ? 'Saving…' : editingDist ? 'Save changes' : 'Add distributor'}</button><button onClick={() => { setShowDistModal(false); setEditingDist(null); setDistForm(EMPTY_DIST) }}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Add location modal */}
      {showLocationModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowLocationModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <h2>{editingLoc ? 'Edit location' : 'Add location'}</h2>
            <div className="form-row">
              <div className="form-group"><label>Distributor *</label>
                <select value={locForm.distributor_id} onChange={e => setLocForm({ ...locForm, distributor_id: e.target.value })}>
                  <option value="">— Select —</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Location name *</label><input type="text" placeholder="Main Street Store, Beverly Hills…" value={locForm.name} onChange={e => setLocForm({ ...locForm, name: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Contact name</label><input type="text" placeholder="John Smith" value={locForm.contact_name} onChange={e => setLocForm({ ...locForm, contact_name: e.target.value })} /></div>
              <div className="form-group"><label>Email</label><input type="email" placeholder="john@store.com" value={locForm.email} onChange={e => setLocForm({ ...locForm, email: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Phone</label><input type="text" placeholder="+1 555 000 0000" value={locForm.phone} onChange={e => setLocForm({ ...locForm, phone: e.target.value })} /></div>
              <div className="form-group"><label>Street address</label><input type="text" placeholder="123 Main St" value={locForm.address} onChange={e => setLocForm({ ...locForm, address: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label>City</label><input type="text" placeholder="Los Angeles" value={locForm.city} onChange={e => setLocForm({ ...locForm, city: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>State</label><input type="text" placeholder="CA" maxLength={2} value={locForm.state} onChange={e => setLocForm({ ...locForm, state: e.target.value.toUpperCase() })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>ZIP</label><input type="text" placeholder="90001" value={locForm.zip} onChange={e => setLocForm({ ...locForm, zip: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input type="checkbox" id="primary-loc" checked={locForm.is_primary} onChange={e => setLocForm({ ...locForm, is_primary: e.target.checked })} style={{ width: 'auto' }} />
              <label htmlFor="primary-loc" style={{ fontSize: 13, cursor: 'pointer', marginBottom: 0, textTransform: 'none', letterSpacing: 0 }}>Primary location (pre-selected by default)</label>
            </div>
            <div className="form-actions"><button className="primary" onClick={saveLocation} disabled={saving}>{saving ? 'Saving…' : editingLoc ? 'Save changes' : 'Add location'}</button><button onClick={() => { setShowLocationModal(false); setEditingLoc(null); setLocForm(EMPTY_LOC) }}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Pricing modal */}
      {showPriceModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowPriceModal(false)}>
          <div className="modal">
            <h2>Configure pricing</h2>
            <div className="form-group"><label>Product *</label>
              <select value={priceForm.product_id} onChange={e => setPriceForm({ ...priceForm, product_id: e.target.value })}>
                <option value="">— Select —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.product_name} (cost: {usd(p.unit_cost)})</option>)}
              </select>
            </div>
            <div className="form-group"><label>Distributor *</label>
              <select value={priceForm.distributor_id} onChange={e => setPriceForm({ ...priceForm, distributor_id: e.target.value })}>
                <option value="">— Select —</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Retail price ($)</label><input type="number" placeholder="0.00" value={priceForm.retail_price} onChange={e => setPriceForm({ ...priceForm, retail_price: e.target.value })} /></div>
              <div className="form-group"><label>Wholesale price ($)</label><input type="number" placeholder="0.00" value={priceForm.wholesale_price} onChange={e => setPriceForm({ ...priceForm, wholesale_price: e.target.value })} /></div>
            </div>
            <div className="form-actions"><button className="primary" onClick={savePrice} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button onClick={() => setShowPriceModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Gifted modal */}
      {showGiftedModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowGiftedModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <h2>Gifted products</h2>
            <div className="form-row">
              <div className="form-group"><label>Date *</label><input type="date" value={giftedForm.date} onChange={e => setGiftedForm({ ...giftedForm, date: e.target.value })} /></div>
              <div className="form-group"><label>Recipient *</label><input type="text" placeholder="@influencer, Contest winner…" value={giftedForm.recipient} onChange={e => setGiftedForm({ ...giftedForm, recipient: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Occasion</label><input type="text" placeholder="PR Send, Contest, Press…" value={giftedForm.occasion} onChange={e => setGiftedForm({ ...giftedForm, occasion: e.target.value })} /></div>
              <div className="form-group"><label>Note</label><input type="text" placeholder="Additional info" value={giftedForm.note} onChange={e => setGiftedForm({ ...giftedForm, note: e.target.value })} /></div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', margin: '1rem 0 8px' }}>Products</div>
            {giftedLines.map((line, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  {i === 0 && <label>Product</label>}
                  <select value={line.product_id} onChange={e => setGiftedLines(giftedLines.map((l, xi) => xi === i ? { ...l, product_id: e.target.value } : l))}>
                    <option value="">— Select —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.product_name} (stock: {p.quantity_on_hand})</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  {i === 0 && <label>Qty</label>}
                  <input type="number" placeholder="0" value={line.quantity} onChange={e => setGiftedLines(giftedLines.map((l, xi) => xi === i ? { ...l, quantity: e.target.value } : l))} />
                </div>
                <button onClick={() => setGiftedLines(giftedLines.filter((_, xi) => xi !== i))} style={{ padding: '8px', color: 'var(--red)', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', marginTop: i === 0 ? 20 : 0 }}>×</button>
              </div>
            ))}
            <button onClick={() => setGiftedLines([...giftedLines, { product_id: '', quantity: '' }])} style={{ fontSize: 12, marginBottom: '1rem' }}>+ Add product</button>
            <div className="form-actions"><button className="primary" onClick={saveGifted} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button onClick={() => setShowGiftedModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Target modal */}
      {showTargetModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowTargetModal(false)}>
          <div className="modal">
            <h2>Set sales target</h2>
            <div className="form-group"><label>Distributor *</label>
              <select value={targetForm.distributor_id} onChange={e => setTargetForm({ ...targetForm, distributor_id: e.target.value })}>
                <option value="">— Select —</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Month</label><input type="month" value={targetForm.period} onChange={e => setTargetForm({ ...targetForm, period: e.target.value })} /></div>
              <div className="form-group"><label>Target ($)</label><input type="number" placeholder="0.00" value={targetForm.target_amount} onChange={e => setTargetForm({ ...targetForm, target_amount: e.target.value })} /></div>
            </div>
            <div className="form-actions"><button className="primary" onClick={saveTarget} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button><button onClick={() => setShowTargetModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}
    </Layout>
  )
}
