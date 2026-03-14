import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import DateFilter, { filterByDate } from '../components/DateFilter'
import { usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

const CHANNELS = ['E-commerce', 'Wholesale USA', 'Wholesale International', 'Retail']
const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY']

function BarChart({ data, height = 180 }) {
  if (!data || data.length === 0) return <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '2rem' }}>Aucune donnée</div>
  const max = Math.max(...data.map(d => Math.max(d.ecom || 0, d.wholesale || 0, d.gifted || 0)), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height, paddingBottom: 24, position: 'relative' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, height: '100%', justifyContent: 'flex-end' }}>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 1, justifyContent: 'flex-end', height: height - 28 }}>
            {d.ecom > 0 && <div style={{ width: '100%', height: Math.max(3, (d.ecom / max) * (height - 28) * 0.9), background: '#6A1B9A', borderRadius: '3px 3px 0 0', minHeight: 3 }} title={'E-commerce: ' + usd(d.ecom)} />}
            {d.wholesale > 0 && <div style={{ width: '100%', height: Math.max(3, (d.wholesale / max) * (height - 28) * 0.9), background: '#2E7D32', borderRadius: '3px 3px 0 0', minHeight: 3 }} title={'Wholesale: ' + usd(d.wholesale)} />}
            {d.gifted > 0 && <div style={{ width: '100%', height: Math.max(3, (d.gifted / max) * (height - 28) * 0.9), background: '#E65100', borderRadius: '3px 3px 0 0', minHeight: 3 }} title={'Gifted: ' + usd(d.gifted)} />}
          </div>
          <div style={{ fontSize: 9, color: 'var(--text-muted)', position: 'absolute', bottom: 0 }}>{d.label}</div>
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
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ from: null, to: null })
  const [activeTab, setActiveTab] = useState('overview')
  const [showDistModal, setShowDistModal] = useState(false)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [showGiftedModal, setShowGiftedModal] = useState(false)
  const [showTargetModal, setShowTargetModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [distForm, setDistForm] = useState({ name: '', channel: 'Wholesale USA', contact: '', note: '' })
  const [priceForm, setPriceForm] = useState({ distributor_id: '', product_id: '', retail_price: '', wholesale_price: '' })
  const [giftedForm, setGiftedForm] = useState({ date: new Date().toISOString().split('T')[0], recipient: '', occasion: '', note: '' })
  const [giftedLines, setGiftedLines] = useState([{ product_id: '', quantity: '', unit_cost: '' }])
  const [targetForm, setTargetForm] = useState({ distributor_id: '', period: new Date().toISOString().slice(0, 7), target_amount: '' })

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/sales').then(r => r.json()),
      fetch('/api/distributors').then(r => r.json()),
      fetch('/api/inventory').then(r => r.json()),
      fetch('/api/distributors?prices=1').then(r => r.json()),
      fetch('/api/gifted').then(r => r.json()),
      fetch('/api/distributors').then(r => r.json()),
    ]).then(([o, d, p, pr, g]) => {
      setOrders(Array.isArray(o) ? o : [])
      setDistributors(Array.isArray(d) ? d : [])
      setProducts(Array.isArray(p) ? p : [])
      setPrices(Array.isArray(pr) ? pr : [])
      setGifted(Array.isArray(g) ? g : [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const filteredOrders = filterByDate(orders, 'date', dateRange)
  const filteredGifted = filterByDate(gifted, 'date', dateRange)

  // Channel stats
  const ecomCA = filteredOrders.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const wsCA = filteredOrders.filter(o => o.channel === 'Wholesale USA' || o.channel === 'Wholesale International').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const giftedCost = filteredGifted.reduce((a, g) => a + (g.gifted_item_lines?.reduce((b, l) => b + (parseFloat(l.quantity) * parseFloat(l.unit_cost || 0)), 0) || 0), 0)

  // Monthly chart data
  const monthlyData = () => {
    const months = {}
    filteredOrders.forEach(o => {
      const m = o.date?.slice(0, 7)
      if (!m) return
      if (!months[m]) months[m] = { ecom: 0, wholesale: 0, gifted: 0 }
      if (o.channel === 'E-commerce') months[m].ecom += parseFloat(o.total_amount || 0)
      else months[m].wholesale += parseFloat(o.total_amount || 0)
    })
    filteredGifted.forEach(g => {
      const m = g.date?.slice(0, 7)
      if (!m) return
      if (!months[m]) months[m] = { ecom: 0, wholesale: 0, gifted: 0 }
      months[m].gifted += g.gifted_item_lines?.reduce((b, l) => b + (parseFloat(l.quantity) * parseFloat(l.unit_cost || 0)), 0) || 0
    })
    return Object.entries(months).sort().slice(-6).map(([k, v]) => ({ label: k.slice(5), ...v }))
  }

  // Distributor performance
  const distPerf = distributors.map(d => {
    const distOrders = filteredOrders.filter(o => o.distributor_id === d.id)
    const realized = distOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
    const target = targets.find(t => t.distributor_id === d.id && t.period === new Date().toISOString().slice(0, 7))
    return { ...d, realized, target: target?.target_amount || 0, orders: distOrders.length }
  })

  const pct = (v, t) => t > 0 ? Math.min(100, (v / t) * 100) : 0

  const saveDist = async () => {
    if (!distForm.name) return
    setSaving(true)
    await fetch('/api/distributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'distributor', ...distForm }) })
    setSaving(false); setShowDistModal(false); setDistForm({ name: '', channel: 'Wholesale USA', contact: '', note: '' }); load()
  }

  const savePrice = async () => {
    if (!priceForm.distributor_id || !priceForm.product_id) return
    setSaving(true)
    await fetch('/api/distributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'price', ...priceForm }) })
    setSaving(false); setShowPriceModal(false); setPriceForm({ distributor_id: '', product_id: '', retail_price: '', wholesale_price: '' }); load()
  }

  const saveGifted = async () => {
    if (!giftedForm.recipient || giftedLines.some(l => !l.product_id || !l.quantity)) return
    setSaving(true)
    const lines = giftedLines.map(l => {
      const prod = products.find(p => p.id === l.product_id)
      return { ...l, unit_cost: prod?.unit_cost || 0 }
    })
    await fetch('/api/gifted', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ gifted: giftedForm, lines }) })
    setSaving(false); setShowGiftedModal(false)
    setGiftedForm({ date: new Date().toISOString().split('T')[0], recipient: '', occasion: '', note: '' })
    setGiftedLines([{ product_id: '', quantity: '', unit_cost: '' }]); load()
  }

  const saveTarget = async () => {
    if (!targetForm.distributor_id || !targetForm.target_amount) return
    setSaving(true)
    await fetch('/api/gifted', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(targetForm) })
    setSaving(false); setShowTargetModal(false); load()
  }

  const deleteGifted = async (id) => {
    if (!confirm('Supprimer ?')) return
    await fetch('/api/gifted?id=' + id, { method: 'DELETE' }); load()
  }

  const deleteDist = async (id) => {
    if (!confirm('Supprimer ce distributeur ?')) return
    await fetch('/api/distributors?id=' + id + '&type=distributor', { method: 'DELETE' }); load()
  }

  const priceMatrix = {}
  prices.forEach(p => {
    const prodName = p.inventory?.product_name || 'Inconnu'
    const distName = p.distributors?.name || 'Inconnu'
    if (!priceMatrix[prodName]) priceMatrix[prodName] = { cost: p.inventory?.unit_cost || 0, distributors: {} }
    priceMatrix[prodName].distributors[distName] = { retail: p.retail_price, wholesale: p.wholesale_price, channel: p.distributors?.channel, id: p.id }
  })

  const TABS = [
    { id: 'overview', label: '📊 Vue d\'ensemble' },
    { id: 'distributors', label: '🏪 Distributeurs' },
    { id: 'pricing', label: '💰 Prix & marges' },
    { id: 'gifted', label: '🎁 Gifted' },
  ]

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Distribution</h1><p>{distributors.length} distributeurs · {products.length} produits</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowGiftedModal(true)}>+ Gifted</button>
          <button onClick={() => setShowPriceModal(true)}>+ Prix</button>
          <button className="primary" onClick={() => setShowDistModal(true)}>+ Distributeur</button>
        </div>
      </div>

      <DateFilter onChange={setDateRange} />

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            border: 'none', borderBottom: activeTab === t.id ? '2px solid var(--pink)' : '2px solid transparent',
            background: 'none', borderRadius: 0, padding: '8px 16px', fontSize: 13,
            color: activeTab === t.id ? 'var(--pink)' : 'var(--text-muted)',
            fontWeight: activeTab === t.id ? 500 : 400, cursor: 'pointer', marginBottom: -1
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? <div className="loading">Chargement…</div> : (
        <>
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                  ['E-commerce', usd(ecomCA), '#6A1B9A'],
                  ['Wholesale', usd(wsCA), '#2E7D32'],
                  ['Gifted (coût)', usd(giftedCost), '#E65100'],
                  ['CA Total', usd(ecomCA + wsCA), '#1565C0'],
                ].map(([l, v, c]) => (
                  <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
                <div className="card">
                  <div className="section-title" style={{ marginBottom: '0.75rem' }}>CA mensuel par canal</div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12 }}>
                    {[['#6A1B9A', 'E-commerce'], ['#2E7D32', 'Wholesale'], ['#E65100', 'Gifted (coût)']].map(([c, l]) => (
                      <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <div style={{ width: 10, height: 10, background: c, borderRadius: 2 }} />
                        <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                      </div>
                    ))}
                  </div>
                  <BarChart data={monthlyData()} />
                </div>

                <div className="card">
                  <div className="section-title" style={{ marginBottom: '0.75rem' }}>Performance distributeurs</div>
                  {distPerf.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucun distributeur</div> : distPerf.map(d => (
                    <div key={d.id} style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                        <span style={{ fontWeight: 500 }}>{d.name}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{usd(d.realized)}{d.target > 0 ? ' / ' + usd(d.target) : ''}</span>
                      </div>
                      {d.target > 0 && (
                        <div style={{ height: 6, background: 'var(--gray-light)', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: pct(d.realized, d.target) + '%', background: pct(d.realized, d.target) >= 100 ? '#2E7D32' : pct(d.realized, d.target) >= 50 ? '#E65100' : '#C62828', borderRadius: 3, transition: 'width 0.6s' }} />
                        </div>
                      )}
                      {d.target === 0 && <div style={{ height: 6, background: 'var(--gray-light)', borderRadius: 3 }}><div style={{ height: '100%', width: '100%', background: '#1565C0', borderRadius: 3, opacity: 0.3 }} /></div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                        <span>{d.orders} commande{d.orders !== 1 ? 's' : ''}</span>
                        {d.target > 0 && <span>{pct(d.realized, d.target).toFixed(0)}% de l'objectif</span>}
                        {d.target === 0 && <button onClick={() => { setTargetForm(f => ({ ...f, distributor_id: d.id })); setShowTargetModal(true) }} style={{ border: 'none', background: 'none', color: '#1565C0', cursor: 'pointer', fontSize: 11, padding: 0 }}>+ Définir un objectif</button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* US State heatmap - simplified */}
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>Commandes par état (Wholesale USA)</div>
                {(() => {
                  const stateCounts = {}
                  filteredOrders.filter(o => o.channel === 'Wholesale USA').forEach(o => {
                    const dist = distributors.find(d => d.id === o.distributor_id)
                    if (dist?.note) { stateCounts[dist.note] = (stateCounts[dist.note] || 0) + parseFloat(o.total_amount || 0) }
                  })
                  const maxVal = Math.max(...Object.values(stateCounts), 1)
                  return (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {US_STATES.map(s => {
                        const val = stateCounts[s] || 0
                        const intensity = val > 0 ? Math.max(0.15, val / maxVal) : 0
                        return (
                          <div key={s} title={s + (val > 0 ? ': ' + usd(val) : '')} style={{
                            width: 36, height: 24, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: val > 0 ? 'rgba(46,125,50,' + intensity + ')' : 'var(--bg)',
                            border: '1px solid var(--border)', fontSize: 9, fontWeight: val > 0 ? 600 : 400,
                            color: intensity > 0.5 ? 'white' : 'var(--text-muted)'
                          }}>{s}</div>
                        )
                      })}
                      <div style={{ width: '100%', fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                        💡 Pour activer la heat map, ajoute l'abréviation de l'état (ex: "KY") dans le champ "Note" du distributeur
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

          {/* DISTRIBUTORS */}
          {activeTab === 'distributors' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
                {distributors.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Aucun distributeur</div>
                ) : distributors.map(d => {
                  const distOrders = filteredOrders.filter(o => o.distributor_id === d.id)
                  const ca = distOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
                  return (
                    <div key={d.id} className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                          <span className="pill" style={{ marginTop: 4, background: d.channel === 'E-commerce' ? '#E8EAF6' : '#E8F5E9', color: d.channel === 'E-commerce' ? '#283593' : '#2E7D32' }}>{d.channel}</span>
                        </div>
                        <button onClick={() => deleteDist(d.id)} style={{ border: 'none', background: 'none', color: '#9E9E9E', cursor: 'pointer', fontSize: 18 }}>×</button>
                      </div>
                      {d.contact && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{d.contact}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{distOrders.length} commande{distOrders.length !== 1 ? 's' : ''}</span>
                        <span style={{ fontWeight: 600, color: '#2E7D32' }}>{usd(ca)}</span>
                      </div>
                      {distOrders.length > 0 && (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Commandes récentes</div>
                          {distOrders.slice(0, 3).map(o => (
                            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #F5F5F5' }}>
                              <span style={{ color: 'var(--text-muted)' }}>{o.date}</span>
                              <span style={{ fontWeight: 500, color: '#2E7D32' }}>{usd(o.total_amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => { setTargetForm(f => ({ ...f, distributor_id: d.id })); setShowTargetModal(true) }} style={{ marginTop: 10, width: '100%', fontSize: 11, padding: '5px' }}>🎯 Définir objectif mensuel</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* PRICING */}
          {activeTab === 'pricing' && (
            <div>
              {Object.keys(priceMatrix).length === 0 ? (
                <div className="card"><div className="empty-state"><div style={{ fontSize: 36 }}>💰</div><p>Aucun prix configuré</p><button className="primary" onClick={() => setShowPriceModal(true)} style={{ marginTop: 12, fontSize: 12 }}>+ Ajouter un prix</button></div></div>
              ) : Object.entries(priceMatrix).map(([prodName, data]) => (
                <div key={prodName} className="card" style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontWeight: 600 }}>{prodName}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Coût de revient : <strong style={{ color: '#C62828' }}>{usd(data.cost)}</strong></span>
                  </div>
                  <table>
                    <thead><tr><th>Distributeur</th><th>Canal</th><th style={{ textAlign: 'right' }}>Prix retail</th><th style={{ textAlign: 'right' }}>Marge retail</th><th style={{ textAlign: 'right' }}>Prix wholesale</th><th style={{ textAlign: 'right' }}>Marge wholesale</th></tr></thead>
                    <tbody>
                      {Object.entries(data.distributors).map(([distName, info]) => {
                        const rm = parseFloat(info.retail) - data.cost
                        const wm = parseFloat(info.wholesale) - data.cost
                        return (
                          <tr key={distName}>
                            <td style={{ fontWeight: 500 }}>{distName}</td>
                            <td><span className="pill" style={{ background: info.channel === 'E-commerce' ? '#E8EAF6' : '#FFF3E0', color: info.channel === 'E-commerce' ? '#283593' : '#E65100' }}>{info.channel}</span></td>
                            <td style={{ textAlign: 'right' }}>{usd(info.retail)}</td>
                            <td style={{ textAlign: 'right' }}><span style={{ color: rm >= 0 ? '#2E7D32' : '#C62828', fontWeight: 600 }}>{usd(rm)} <span style={{ fontWeight: 400, fontSize: 11 }}>({parseFloat(info.retail) > 0 ? ((rm / parseFloat(info.retail)) * 100).toFixed(1) : 0}%)</span></span></td>
                            <td style={{ textAlign: 'right' }}>{usd(info.wholesale)}</td>
                            <td style={{ textAlign: 'right' }}><span style={{ color: wm >= 0 ? '#2E7D32' : '#C62828', fontWeight: 600 }}>{usd(wm)} <span style={{ fontWeight: 400, fontSize: 11 }}>({parseFloat(info.wholesale) > 0 ? ((wm / parseFloat(info.wholesale)) * 100).toFixed(1) : 0}%)</span></span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          )}

          {/* GIFTED */}
          {activeTab === 'gifted' && (
            <div>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                  ['Unités offertes', filteredGifted.reduce((a, g) => a + (g.gifted_item_lines?.reduce((b, l) => b + parseFloat(l.quantity || 0), 0) || 0), 0), '#E65100'],
                  ['Coût total', usd(giftedCost), '#C62828'],
                  ['Nb d\'envois', filteredGifted.length, '#37474F'],
                  ['Coût moyen/envoi', usd(filteredGifted.length > 0 ? giftedCost / filteredGifted.length : 0), '#6A1B9A'],
                ].map(([l, v, c]) => (
                  <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
                ))}
              </div>

              {filteredGifted.length === 0 ? (
                <div className="card"><div className="empty-state"><div style={{ fontSize: 36 }}>🎁</div><p>Aucun produit offert enregistré</p><button className="primary" onClick={() => setShowGiftedModal(true)} style={{ marginTop: 12, fontSize: 12 }}>+ Ajouter un envoi</button></div></div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table>
                    <thead><tr><th>Date</th><th>Destinataire</th><th>Occasion</th><th>Produits</th><th style={{ textAlign: 'right' }}>Coût</th><th></th></tr></thead>
                    <tbody>
                      {filteredGifted.map(g => {
                        const cost = g.gifted_item_lines?.reduce((a, l) => a + (parseFloat(l.quantity) * parseFloat(l.unit_cost || 0)), 0) || 0
                        return (
                          <tr key={g.id}>
                            <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{g.date}</td>
                            <td style={{ fontWeight: 500 }}>{g.recipient}</td>
                            <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{g.occasion || '—'}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{g.gifted_item_lines?.map(l => l.inventory?.product_name + ' ×' + l.quantity).join(', ')}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: '#C62828' }}>{usd(cost)}</td>
                            <td><button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => deleteGifted(g.id)}>Suppr.</button></td>
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

      {/* MODALS */}
      {showDistModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowDistModal(false)}>
          <div className="modal">
            <h2>Nouveau distributeur</h2>
            <div className="form-group"><label>Nom *</label><input type="text" placeholder="ex : Beauty Bay, Sephora…" value={distForm.name} onChange={e => setDistForm({ ...distForm, name: e.target.value })} /></div>
            <div className="form-group"><label>Canal</label><select value={distForm.channel} onChange={e => setDistForm({ ...distForm, channel: e.target.value })}>{CHANNELS.map(c => <option key={c}>{c}</option>)}</select></div>
            <div className="form-group"><label>Contact</label><input type="text" placeholder="email ou nom" value={distForm.contact} onChange={e => setDistForm({ ...distForm, contact: e.target.value })} /></div>
            <div className="form-group"><label>État US (ex: KY) — pour la heat map</label><input type="text" placeholder="KY" maxLength={2} value={distForm.note} onChange={e => setDistForm({ ...distForm, note: e.target.value.toUpperCase() })} /></div>
            <div className="form-actions"><button className="primary" onClick={saveDist} disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter'}</button><button onClick={() => setShowDistModal(false)}>Annuler</button></div>
          </div>
        </div>
      )}

      {showPriceModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowPriceModal(false)}>
          <div className="modal">
            <h2>Configurer un prix</h2>
            <div className="form-group"><label>Produit *</label>
              <select value={priceForm.product_id} onChange={e => setPriceForm({ ...priceForm, product_id: e.target.value })}>
                <option value="">— Choisir —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.product_name} (coût: {usd(p.unit_cost)})</option>)}
              </select>
            </div>
            <div className="form-group"><label>Distributeur *</label>
              <select value={priceForm.distributor_id} onChange={e => setPriceForm({ ...priceForm, distributor_id: e.target.value })}>
                <option value="">— Choisir —</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Prix retail ($)</label><input type="number" placeholder="0.00" value={priceForm.retail_price} onChange={e => setPriceForm({ ...priceForm, retail_price: e.target.value })} /></div>
              <div className="form-group"><label>Prix wholesale ($)</label><input type="number" placeholder="0.00" value={priceForm.wholesale_price} onChange={e => setPriceForm({ ...priceForm, wholesale_price: e.target.value })} /></div>
            </div>
            <div className="form-actions"><button className="primary" onClick={savePrice} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button><button onClick={() => setShowPriceModal(false)}>Annuler</button></div>
          </div>
        </div>
      )}

      {showGiftedModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowGiftedModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <h2>Produits offerts / Gifted</h2>
            <div className="form-row">
              <div className="form-group"><label>Date *</label><input type="date" value={giftedForm.date} onChange={e => setGiftedForm({ ...giftedForm, date: e.target.value })} /></div>
              <div className="form-group"><label>Destinataire *</label><input type="text" placeholder="@influenceur, Concours…" value={giftedForm.recipient} onChange={e => setGiftedForm({ ...giftedForm, recipient: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Occasion</label><input type="text" placeholder="PR Send, Concours, Presse…" value={giftedForm.occasion} onChange={e => setGiftedForm({ ...giftedForm, occasion: e.target.value })} /></div>
              <div className="form-group"><label>Note</label><input type="text" placeholder="Info supplémentaire" value={giftedForm.note} onChange={e => setGiftedForm({ ...giftedForm, note: e.target.value })} /></div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', margin: '1rem 0 8px' }}>Produits</div>
            {giftedLines.map((line, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  {i === 0 && <label>Produit</label>}
                  <select value={line.product_id} onChange={e => setGiftedLines(giftedLines.map((l, idx) => idx === i ? { ...l, product_id: e.target.value } : l))}>
                    <option value="">— Choisir —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.product_name} (stock: {p.quantity_on_hand})</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  {i === 0 && <label>Quantité</label>}
                  <input type="number" placeholder="0" value={line.quantity} onChange={e => setGiftedLines(giftedLines.map((l, idx) => idx === i ? { ...l, quantity: e.target.value } : l))} />
                </div>
                <button onClick={() => setGiftedLines(giftedLines.filter((_, idx) => idx !== i))} style={{ padding: '8px', color: '#C62828', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', marginTop: i === 0 ? 20 : 0 }}>×</button>
              </div>
            ))}
            <button onClick={() => setGiftedLines([...giftedLines, { product_id: '', quantity: '' }])} style={{ fontSize: 12, marginBottom: '1rem' }}>+ Ajouter un produit</button>
            <div className="form-actions"><button className="primary" onClick={saveGifted} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button><button onClick={() => setShowGiftedModal(false)}>Annuler</button></div>
          </div>
        </div>
      )}

      {showTargetModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowTargetModal(false)}>
          <div className="modal">
            <h2>Objectif de vente</h2>
            <div className="form-group"><label>Distributeur *</label>
              <select value={targetForm.distributor_id} onChange={e => setTargetForm({ ...targetForm, distributor_id: e.target.value })}>
                <option value="">— Choisir —</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Période (mois)</label><input type="month" value={targetForm.period} onChange={e => setTargetForm({ ...targetForm, period: e.target.value })} /></div>
              <div className="form-group"><label>Objectif ($)</label><input type="number" placeholder="0.00" value={targetForm.target_amount} onChange={e => setTargetForm({ ...targetForm, target_amount: e.target.value })} /></div>
            </div>
            <div className="form-actions"><button className="primary" onClick={saveTarget} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button><button onClick={() => setShowTargetModal(false)}>Annuler</button></div>
          </div>
        </div>
      )}
    </Layout>
  )
}
