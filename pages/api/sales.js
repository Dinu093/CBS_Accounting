import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import { usd, fdate } from '../lib/constants'
import DateFilter, { filterByDate } from '../components/DateFilter'

export async function getServerSideProps() { return { props: {} } }

const EMPTY_DIST = { name: '', channel: 'Wholesale USA', contact: '', note: '' }
const EMPTY_LOC = { distributor_id: '', name: '', contact_name: '', email: '', phone: '', address: '', city: '', state: '', zip: '', is_primary: false }

export default function Sales() {
  const [distributors, setDistributors] = useState([])
  const [locations, setLocations] = useState([])
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ from: null, to: null })
  const [activeTab, setActiveTab] = useState('dashboard')
  const [saving, setSaving] = useState(false)
  const router = useRouter()
  const [targets, setTargets] = useState([])
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [targetForm, setTargetForm] = useState({ distributor_id: '', period: new Date().toISOString().slice(0, 7), target_amount: '' })

  const [showDistModal, setShowDistModal] = useState(false)
  const [showLocModal, setShowLocModal] = useState(false)
  const [editingDist, setEditingDist] = useState(null)
  const [editingLoc, setEditingLoc] = useState(null)
  const [distForm, setDistForm] = useState(EMPTY_DIST)
  const [locForm, setLocForm] = useState(EMPTY_LOC)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/distributors?t=' + Date.now()).then(r => r.json()),
      fetch('/api/locations?t=' + Date.now()).then(r => r.json()),
      fetch('/api/sales?t=' + Date.now()).then(r => r.json()),
      fetch('/api/inventory?t=' + Date.now()).then(r => r.json()),
      fetch('/api/gifted?targets=1&t=' + Date.now()).then(r => r.json()),
    ]).then(([d, l, o, p, tg]) => {
      setDistributors(Array.isArray(d) ? d : [])
      setLocations(Array.isArray(l) ? l : [])
      setOrders(Array.isArray(o) ? o.filter(x => x.channel !== 'E-commerce') : [])
      setAllSales(Array.isArray(o) ? o : [])
      setProducts(Array.isArray(p) ? p : [])
      setTargets(Array.isArray(tg) ? tg : [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const [allSales, setAllSales] = useState([])
  const fOrders = filterByDate(orders, 'date', dateRange)
  const fAllSales = filterByDate(allSales, 'date', dateRange)
  const totalWS = fOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const ecomOrders = fAllSales.filter(o => o.channel === 'E-commerce')
  const totalEcom = ecomOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)

  const distPerf = distributors.map(d => {
    const dOrders = fOrders.filter(o => o.distributor_id === d.id)
    const revenue = dOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
    const locs = locations.filter(l => l.distributor_id === d.id)
    return { ...d, revenue, orders: dOrders.length, locations: locs, lastOrder: dOrders[0]?.date }
  })

  const saveDist = async () => {
    if (!distForm.name) return
    setSaving(true)
    if (editingDist) {
      await fetch('/api/distributors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'distributor', id: editingDist, ...distForm }) })
    } else {
      await fetch('/api/distributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'distributor', ...distForm }) })
    }
    setSaving(false); setShowDistModal(false); setEditingDist(null); setDistForm(EMPTY_DIST); load()
  }

  const saveLoc = async () => {
    if (!locForm.name || !locForm.distributor_id) return
    setSaving(true)
    if (editingLoc) {
      await fetch('/api/locations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editingLoc, ...locForm }) })
    } else {
      await fetch('/api/locations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(locForm) })
    }
    setSaving(false); setShowLocModal(false); setEditingLoc(null); setLocForm(EMPTY_LOC); load()
  }

  const saveTarget = async () => {
    if (!targetForm.distributor_id || !targetForm.target_amount) return
    setSaving(true)
    await fetch('/api/gifted', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(targetForm) })
    setSaving(false); setShowTargetModal(false); load()
  }

  const delDist = async (id) => { if (!confirm('Delete distributor and all its locations?')) return; await fetch('/api/distributors?id=' + id + '&type=distributor', { method: 'DELETE' }); load() }
  const delLoc = async (id) => { if (!confirm('Delete location?')) return; await fetch('/api/locations?id=' + id, { method: 'DELETE' }); load() }

  const TABS = [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'wholesale', label: '🏪 Wholesale' },
    { id: 'ecommerce', label: '🛍 E-commerce' },
    { id: 'orders', label: '📋 All orders' },
  ]

  const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']
  const stateSales = {}
  fOrders.forEach(o => { const loc = locations.find(l => l.id === o.location_id); if (loc?.state) { stateSales[loc.state] = (stateSales[loc.state] || 0) + parseFloat(o.total_amount || 0) } })
  const maxState = Math.max(...Object.values(stateSales), 1)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Sales</h1>
          <p>{distributors.length} distributor{distributors.length !== 1 ? 's' : ''} · {locations.length} location{locations.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setLocForm(EMPTY_LOC); setEditingLoc(null); setShowLocModal(true) }}>+ Location</button>
          <button onClick={() => { setDistForm(EMPTY_DIST); setEditingDist(null); setShowDistModal(true) }}>+ Distributor</button>
          <button className="primary" onClick={() => router.push('/income')}>⬆ Record a sale →</button>
        </div>
      </div>

      <DateFilter onChange={setDateRange} />

      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={'tab-btn' + (activeTab === t.id ? ' active' : '')}>{t.label}</button>)}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <>
          {activeTab === 'dashboard' && (
            <div>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                  ['E-commerce', usd(totalEcom), '#6A1B9A'],
                  ['Wholesale', usd(totalWS), 'var(--green)'],
                  ['Total revenue', usd(totalEcom + totalWS), 'var(--navy)'],
                  ['Total orders', fAllSales.length, 'var(--blue-pearl)'],
                ].map(([l, v, c]) => (
                  <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
                {/* Distributor performance */}
                <div className="card">
                  <div className="section-title" style={{ marginBottom: '1rem' }}>Performance by distributor</div>
                  {distPerf.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No distributors yet</div> :
                    distPerf.map(d => (
                      <div key={d.id} style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                          <div>
                            <span style={{ fontWeight: 500 }}>{d.name}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>{d.orders} order{d.orders !== 1 ? 's' : ''}</span>
                          </div>
                          <span style={{ fontWeight: 600, color: 'var(--green)' }}>{usd(d.revenue)}</span>
                        </div>
                        <div style={{ height: 5, background: 'var(--cream-dark)', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: totalWS > 0 ? Math.min(100, d.revenue / totalWS * 100) + '%' : '0%', background: 'var(--green)', borderRadius: 3 }} />
                        </div>
                        {d.lastOrder && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Last order: {fdate(d.lastOrder)}</div>}
                      </div>
                    ))
                  }
                </div>

                {/* US State map */}
                <div className="card">
                  <div className="section-title" style={{ marginBottom: '0.75rem' }}>Coverage map</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                    {US_STATES.map(s => {
                      const val = stateSales[s] || 0
                      const intensity = val > 0 ? Math.max(0.2, val / maxState) : 0
                      return (
                        <div key={s} title={s + (val > 0 ? ': ' + usd(val) : '')} style={{ width: 34, height: 22, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: val > 0 ? 'rgba(42,107,74,' + intensity + ')' : 'var(--cream)', border: '1px solid var(--border)', fontSize: 9, fontWeight: val > 0 ? 600 : 400, color: intensity > 0.5 ? 'white' : 'var(--text-muted)', cursor: 'default' }}>
                          {s}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Based on location addresses — add locations to fill the map</div>
                </div>
              </div>
              {/* Targets recap */}
              {targets.length > 0 && (() => {
                const currentMonth = new Date().toISOString().slice(0, 7)
                const monthTargets = targets.filter(t => t.period === currentMonth)
                if (monthTargets.length === 0) return null
                return (
                  <div className="card" style={{ marginTop: '1.25rem' }}>
                    <div className="section-title" style={{ marginBottom: '1rem' }}>Monthly targets — {currentMonth}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                      {monthTargets.map(t => {
                        const dist = distributors.find(d => d.id === t.distributor_id)
                        const achieved = fOrders.filter(o => o.distributor_id === t.distributor_id && o.date?.slice(0, 7) === t.period).reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
                        const pct = parseFloat(t.target_amount) > 0 ? Math.min(100, achieved / parseFloat(t.target_amount) * 100) : 0
                        const met = achieved >= parseFloat(t.target_amount)
                        return (
                          <div key={t.id} style={{ padding: '12px', background: met ? 'var(--green-light)' : 'var(--cream)', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (met ? 'rgba(42,107,74,0.2)' : 'var(--border)') }}>
                            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{dist?.name || '—'}</div>
                            <div style={{ fontSize: 20, fontWeight: 300, color: met ? 'var(--green)' : 'var(--amber)', marginBottom: 4 }}>{pct.toFixed(0)}%</div>
                            <div style={{ height: 4, background: 'rgba(0,0,0,0.08)', borderRadius: 2, marginBottom: 4 }}>
                              <div style={{ height: '100%', width: pct + '%', background: met ? 'var(--green)' : 'var(--amber)', borderRadius: 2 }} />
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{usd(achieved)} / {usd(t.target_amount)}</div>
                            {met && <div style={{ fontSize: 11, color: 'var(--green)', fontWeight: 500, marginTop: 2 }}>✓ Target met!</div>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {activeTab === 'ecommerce' && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>To record a new sale and update stock automatically, use the Income module.</span>
                <button className="primary" onClick={() => router.push('/income')} style={{ fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap', marginLeft: 12 }}>Go to Income →</button>
              </div>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                  ['Revenue', usd(totalEcom), '#6A1B9A'],
                  ['Orders', ecomOrders.length, 'var(--navy)'],
                  ['Avg order', usd(ecomOrders.length > 0 ? totalEcom / ecomOrders.length : 0), 'var(--text-muted)'],
                  ['Free shipping cost', usd(ecomOrders.filter(o => o.shipping_charged).reduce((a, o) => a + parseFloat(o.shipping_cost || 0), 0)), 'var(--red)'],
                ].map(([l, v, c]) => (
                  <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
                ))}
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {ecomOrders.length === 0 ? <div className="empty-state"><p>No e-commerce orders yet</p></div> : (
                  <table>
                    <thead><tr><th>Date</th><th>Reference</th><th>Customer</th><th>Location</th><th>Products</th><th>Shipping</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                    <tbody>
                      {ecomOrders.map(o => (
                        <tr key={o.id}>
                          <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(o.date)}</td>
                          <td style={{ fontWeight: 500 }}>{o.reference || o.id?.slice(0, 8)}</td>
                          <td style={{ fontSize: 12 }}>{o.buyer_name || '—'}{o.buyer_email ? <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{o.buyer_email}</div> : null}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.buyer_city ? o.buyer_city + (o.buyer_state ? ', ' + o.buyer_state : '') : '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.sale_items?.map(i => i.inventory?.product_name + ' ×' + i.quantity).join(', ')}</td>
                          <td>
                            {o.shipping_charged && parseFloat(o.shipping_cost) > 0
                              ? <span className="pill" style={{ background: 'var(--red-light)', color: 'var(--red)', fontSize: 11 }}>{usd(o.shipping_cost)} your cost</span>
                              : <span className="pill" style={{ background: 'var(--green-light)', color: 'var(--green)', fontSize: 11 }}>$0.00 your cost</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#6A1B9A' }}>{usd(o.total_amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {activeTab === 'wholesale' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
              {distributors.length === 0 ? (
                <div className="card"><div className="empty-state"><p>No distributors yet</p></div></div>
              ) : distributors.map(d => {
                const dOrders = fOrders.filter(o => o.distributor_id === d.id)
                const revenue = dOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
                const locs = locations.filter(l => l.distributor_id === d.id)
                return (
                  <div key={d.id} className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                        <span className="pill" style={{ marginTop: 4, background: 'var(--green-light)', color: 'var(--green)', fontSize: 11 }}>{d.channel}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setDistForm({ name: d.name, channel: d.channel, contact: d.contact || '', note: d.note || '' }); setEditingDist(d.id); setShowDistModal(true) }} style={{ border: 'none', background: 'none', color: 'var(--blue-pearl)', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                        <button onClick={() => delDist(d.id)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                      </div>
                    </div>
                    {d.contact && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{d.contact}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', fontSize: 13, marginBottom: 10 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{dOrders.length} order{dOrders.length !== 1 ? 's' : ''}</span>
                      <span style={{ fontWeight: 600, color: 'var(--green)' }}>{usd(revenue)}</span>
                    </div>

                    {/* Locations */}
                    <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Locations ({locs.length})</div>
                    {locs.length === 0 ? <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>No locations yet</div> :
                      locs.map(loc => (
                        <div key={loc.id} style={{ padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <div style={{ fontWeight: 500 }}>{loc.name} {loc.is_primary && <span style={{ fontSize: 10, color: 'var(--blue-pearl)' }}>• Primary</span>}</div>
                              {loc.contact_name && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{loc.contact_name}{loc.email ? ' · ' + loc.email : ''}</div>}
                              {loc.phone && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{loc.phone}</div>}
                              {loc.address && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{loc.address}, {loc.city} {loc.state} {loc.zip}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button onClick={() => { setLocForm({ distributor_id: d.id, name: loc.name, contact_name: loc.contact_name || '', email: loc.email || '', phone: loc.phone || '', address: loc.address || '', city: loc.city || '', state: loc.state || '', zip: loc.zip || '', is_primary: loc.is_primary || false }); setEditingLoc(loc.id); setShowLocModal(true) }} style={{ border: 'none', background: 'none', color: 'var(--blue-pearl)', cursor: 'pointer', fontSize: 11, padding: '2px 4px' }}>Edit</button>
                              <button onClick={() => delLoc(loc.id)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
                            </div>
                          </div>
                        </div>
                      ))
                    }
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
                      <button onClick={() => { setLocForm({ ...EMPTY_LOC, distributor_id: d.id }); setEditingLoc(null); setShowLocModal(true) }} style={{ fontSize: 11, padding: '6px', background: 'var(--blue-light)', color: 'var(--navy-mid)', borderColor: 'rgba(44,74,110,0.1)' }}>+ Location</button>
                      <button onClick={() => { setTargetForm(f => ({ ...f, distributor_id: d.id })); setShowTargetModal(true) }} style={{ fontSize: 11, padding: '6px' }}>🎯 Set target</button>
                    </div>

                    {/* Targets for this distributor */}
                    {targets.filter(t => t.distributor_id === d.id).length > 0 && (
                      <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Targets</div>
                        {targets.filter(t => t.distributor_id === d.id).sort((a, b) => b.period?.localeCompare(a.period)).slice(0, 3).map(t => {
                          const monthOrders = fOrders.filter(o => o.distributor_id === d.id && o.date?.slice(0, 7) === t.period)
                          const achieved = monthOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
                          const pct = parseFloat(t.target_amount) > 0 ? Math.min(100, achieved / parseFloat(t.target_amount) * 100) : 0
                          const met = achieved >= parseFloat(t.target_amount)
                          return (
                            <div key={t.id} style={{ marginBottom: 6 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                                <span style={{ color: 'var(--text-muted)' }}>{t.period}</span>
                                <span style={{ color: met ? 'var(--green)' : 'var(--amber)', fontWeight: 500 }}>{usd(achieved)} / {usd(t.target_amount)}</span>
                              </div>
                              <div style={{ height: 4, background: 'var(--cream-dark)', borderRadius: 2 }}>
                                <div style={{ height: '100%', width: pct + '%', background: met ? 'var(--green)' : 'var(--amber)', borderRadius: 2, transition: 'width 0.4s' }} />
                              </div>
                              <div style={{ fontSize: 10, color: met ? 'var(--green)' : 'var(--text-muted)', marginTop: 2 }}>{met ? '✓ Target met' : pct.toFixed(0) + '% of target'}</div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {activeTab === 'orders' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {fAllSales.length === 0 ? <div className="empty-state"><p>No orders yet</p></div> : (
                <table>
                  <thead><tr><th>Date</th><th>Reference</th><th>Distributor</th><th>Location</th><th>Products</th><th>Payment</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                  <tbody>
                    {fAllSales.map(o => {
                      const loc = locations.find(l => l.id === o.location_id)
                      return (
                        <tr key={o.id}>
                          <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(o.date)}</td>
                          <td style={{ fontWeight: 500 }}>{o.reference || o.id?.slice(0, 8)}</td>
                          <td>{o.distributors?.name || '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{loc ? loc.name + (loc.city ? ', ' + loc.city : '') : '—'}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.sale_items?.map(i => i.inventory?.product_name + ' ×' + i.quantity).join(', ')}</td>
                          <td><span className="pill" style={{ background: (o.payment_status || 'paid') === 'paid' ? 'var(--green-light)' : 'var(--amber-light)', color: (o.payment_status || 'paid') === 'paid' ? 'var(--green)' : 'var(--amber)', fontSize: 11 }}>{o.payment_status || 'Paid'}</span></td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{usd(o.total_amount)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* Distributor modal */}
      {showDistModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowDistModal(false)}>
          <div className="modal">
            <h2>{editingDist ? 'Edit distributor' : 'New distributor'}</h2>
            <div className="form-group"><label>Name *</label><input type="text" placeholder="e.g. Joseph's Salon" value={distForm.name} onChange={e => setDistForm({ ...distForm, name: e.target.value })} /></div>
            <div className="form-group"><label>Channel</label>
              <select value={distForm.channel} onChange={e => setDistForm({ ...distForm, channel: e.target.value })}>
                {['Wholesale USA', 'Wholesale International', 'Retail'].map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Contact</label><input type="text" placeholder="email or name" value={distForm.contact} onChange={e => setDistForm({ ...distForm, contact: e.target.value })} /></div>
            <div className="form-group"><label>Notes</label><input type="text" placeholder="Additional info" value={distForm.note} onChange={e => setDistForm({ ...distForm, note: e.target.value })} /></div>
            <div className="form-actions">
              <button className="primary" onClick={saveDist} disabled={saving}>{saving ? 'Saving…' : editingDist ? 'Save changes' : 'Add distributor'}</button>
              <button onClick={() => { setShowDistModal(false); setEditingDist(null); setDistForm(EMPTY_DIST) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Location modal */}
      {showLocModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowLocModal(false)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <h2>{editingLoc ? 'Edit location' : 'Add location'}</h2>
            <div className="form-row">
              <div className="form-group"><label>Distributor *</label>
                <select value={locForm.distributor_id} onChange={e => setLocForm({ ...locForm, distributor_id: e.target.value })}>
                  <option value="">— Select —</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Location name *</label><input type="text" placeholder="Main Street Store" value={locForm.name} onChange={e => setLocForm({ ...locForm, name: e.target.value })} /></div>
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
              <div className="form-group" style={{ marginBottom: 0 }}><label>City</label><input type="text" value={locForm.city} onChange={e => setLocForm({ ...locForm, city: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>State</label><input type="text" maxLength={2} value={locForm.state} onChange={e => setLocForm({ ...locForm, state: e.target.value.toUpperCase() })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>ZIP</label><input type="text" value={locForm.zip} onChange={e => setLocForm({ ...locForm, zip: e.target.value })} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <input type="checkbox" id="primary-loc" checked={locForm.is_primary} onChange={e => setLocForm({ ...locForm, is_primary: e.target.checked })} style={{ width: 'auto' }} />
              <label htmlFor="primary-loc" style={{ fontSize: 13, cursor: 'pointer', marginBottom: 0, textTransform: 'none', letterSpacing: 0 }}>Primary location</label>
            </div>
            <div className="form-actions">
              <button className="primary" onClick={saveLoc} disabled={saving}>{saving ? 'Saving…' : editingLoc ? 'Save changes' : 'Add location'}</button>
              <button onClick={() => { setShowLocModal(false); setEditingLoc(null); setLocForm(EMPTY_LOC) }}>Cancel</button>
            </div>
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
            <div className="form-actions">
              <button className="primary" onClick={saveTarget} disabled={saving}>{saving ? 'Saving…' : 'Save target'}</button>
              <button onClick={() => setShowTargetModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    </Layout>
  )
}
