import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd } from '../lib/constants'

const CHANNELS = ['E-commerce', 'Wholesale USA', 'Wholesale International', 'Retail']

export default function Distribution() {
  const [distributors, setDistributors] = useState([])
  const [products, setProducts] = useState([])
  const [prices, setPrices] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDistModal, setShowDistModal] = useState(false)
  const [showPriceModal, setShowPriceModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [selectedProduct, setSelectedProduct] = useState('')
  const [distForm, setDistForm] = useState({ name: '', channel: 'Wholesale USA', contact: '', note: '' })
  const [priceForm, setPriceForm] = useState({ distributor_id: '', product_id: '', retail_price: '', wholesale_price: '' })

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/distributors').then(r => r.json()),
      fetch('/api/inventory').then(r => r.json()),
      fetch('/api/distributors?prices=1').then(r => r.json()),
    ]).then(([d, p, pr]) => {
      setDistributors(Array.isArray(d) ? d : [])
      setProducts(Array.isArray(p) ? p : [])
      setPrices(Array.isArray(pr) ? pr : [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const saveDist = async () => {
    if (!distForm.name) return
    setSaving(true)
    await fetch('/api/distributors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'distributor', ...distForm })
    })
    setSaving(false)
    setShowDistModal(false)
    setDistForm({ name: '', channel: 'Wholesale USA', contact: '', note: '' })
    load()
  }

  const savePrice = async () => {
    if (!priceForm.distributor_id || !priceForm.product_id) return
    setSaving(true)
    await fetch('/api/distributors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'price', ...priceForm })
    })
    setSaving(false)
    setShowPriceModal(false)
    setPriceForm({ distributor_id: '', product_id: '', retail_price: '', wholesale_price: '' })
    load()
  }

  const deleteDist = async (id) => {
    if (!confirm('Supprimer ce distributeur ?')) return
    await fetch(`/api/distributors?id=${id}&type=distributor`, { method: 'DELETE' })
    load()
  }

  const deletePrice = async (id) => {
    await fetch(`/api/distributors?id=${id}&type=price`, { method: 'DELETE' })
    load()
  }

  // Filter prices by selected product
  const filteredPrices = selectedProduct
    ? prices.filter(p => p.product_id === selectedProduct)
    : prices

  // Group prices by product for the matrix
  const priceMatrix = {}
  prices.forEach(p => {
    const prodName = p.inventory?.product_name || 'Inconnu'
    const distName = p.distributors?.name || 'Inconnu'
    if (!priceMatrix[prodName]) priceMatrix[prodName] = { cost: p.inventory?.unit_cost || 0, distributors: {} }
    priceMatrix[prodName].distributors[distName] = {
      retail: p.retail_price,
      wholesale: p.wholesale_price,
      channel: p.distributors?.channel,
      id: p.id
    }
  })

  const pct = (num, den) => den > 0 ? ((num / den) * 100).toFixed(1) + '%' : '—'

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Distribution</h1>
          <p>{distributors.length} distributeur{distributors.length !== 1 ? 's' : ''} · {products.length} produit{products.length !== 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => { setPriceForm({ ...priceForm, product_id: selectedProduct }); setShowPriceModal(true) }}>+ Prix distributeur</button>
          <button className="primary" onClick={() => setShowDistModal(true)}>+ Distributeur</button>
        </div>
      </div>

      {loading ? <div className="loading">Chargement…</div> : (
        <>
          {/* Distributors list */}
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="section-title">Distributeurs</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {distributors.length === 0 ? (
                <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  Aucun distributeur — <button onClick={() => setShowDistModal(true)} style={{ border: 'none', background: 'none', color: 'var(--pink)', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>en ajouter un</button>
                </div>
              ) : distributors.map(d => (
                <div key={d.id} className="card" style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{d.name}</div>
                      <span className="pill" style={{
                        marginTop: 4,
                        background: d.channel === 'E-commerce' ? '#E8EAF6' : '#E8F5E9',
                        color: d.channel === 'E-commerce' ? '#283593' : '#2E7D32'
                      }}>{d.channel}</span>
                    </div>
                    <button onClick={() => deleteDist(d.id)} style={{ border: 'none', background: 'none', color: '#9E9E9E', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                  </div>
                  {d.contact && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>{d.contact}</div>}
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {prices.filter(p => p.distributor_id === d.id).length} produit{prices.filter(p => p.distributor_id === d.id).length !== 1 ? 's' : ''} tarifés
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pricing matrix */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div className="section-title" style={{ marginBottom: 0 }}>Matrice des prix & marges</div>
              <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} style={{ fontSize: 13, width: 'auto' }}>
                <option value="">Tous les produits</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}
              </select>
            </div>

            {Object.keys(priceMatrix).length === 0 ? (
              <div className="card">
                <div className="empty-state">
                  <div style={{ fontSize: 36 }}>💰</div>
                  <p>Aucun prix configuré</p>
                  <button className="primary" onClick={() => setShowPriceModal(true)} style={{ marginTop: 12, fontSize: 12 }}>+ Ajouter un prix</button>
                </div>
              </div>
            ) : Object.entries(priceMatrix)
              .filter(([name]) => !selectedProduct || products.find(p => p.id === selectedProduct)?.product_name === name)
              .map(([prodName, data]) => (
                <div key={prodName} className="card" style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 600 }}>{prodName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Coût de revient : <strong style={{ color: '#C62828' }}>{usd(data.cost)}</strong></div>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Distributeur</th>
                        <th>Canal</th>
                        <th style={{ textAlign: 'right' }}>Prix retail</th>
                        <th style={{ textAlign: 'right' }}>Marge retail</th>
                        <th style={{ textAlign: 'right' }}>Prix wholesale</th>
                        <th style={{ textAlign: 'right' }}>Marge wholesale</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.distributors).map(([distName, info]) => {
                        const retailMargin = parseFloat(info.retail) - data.cost
                        const wsMargin = parseFloat(info.wholesale) - data.cost
                        return (
                          <tr key={distName}>
                            <td style={{ fontWeight: 500 }}>{distName}</td>
                            <td>
                              <span className="pill" style={{
                                background: info.channel === 'E-commerce' ? '#E8EAF6' : '#FFF3E0',
                                color: info.channel === 'E-commerce' ? '#283593' : '#E65100'
                              }}>{info.channel}</span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 500 }}>{usd(info.retail)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ color: retailMargin >= 0 ? '#2E7D32' : '#C62828', fontWeight: 600 }}>
                                {usd(retailMargin)} <span style={{ fontWeight: 400, fontSize: 11 }}>({pct(retailMargin, parseFloat(info.retail))})</span>
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 500 }}>{usd(info.wholesale)}</td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ color: wsMargin >= 0 ? '#2E7D32' : '#C62828', fontWeight: 600 }}>
                                {usd(wsMargin)} <span style={{ fontWeight: 400, fontSize: 11 }}>({pct(wsMargin, parseFloat(info.wholesale))})</span>
                              </span>
                            </td>
                            <td>
                              <button onClick={() => deletePrice(info.id)} style={{ border: 'none', background: 'none', color: '#9E9E9E', cursor: 'pointer', fontSize: 16 }}>×</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
          </div>
        </>
      )}

      {/* Add distributor modal */}
      {showDistModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowDistModal(false)}>
          <div className="modal">
            <h2>Nouveau distributeur</h2>
            <div className="form-group">
              <label>Nom *</label>
              <input type="text" placeholder="ex : Beauty Bay, Sephora USA…" value={distForm.name} onChange={e => setDistForm({ ...distForm, name: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Canal</label>
              <select value={distForm.channel} onChange={e => setDistForm({ ...distForm, channel: e.target.value })}>
                {CHANNELS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Contact / Email</label>
              <input type="text" placeholder="contact@distributeur.com" value={distForm.contact} onChange={e => setDistForm({ ...distForm, contact: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Note</label>
              <input type="text" placeholder="Infos, conditions…" value={distForm.note} onChange={e => setDistForm({ ...distForm, note: e.target.value })} />
            </div>
            <div className="form-actions">
              <button className="primary" onClick={saveDist} disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter'}</button>
              <button onClick={() => setShowDistModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Add price modal */}
      {showPriceModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowPriceModal(false)}>
          <div className="modal">
            <h2>Configurer un prix</h2>
            <div className="form-group">
              <label>Produit *</label>
              <select value={priceForm.product_id} onChange={e => setPriceForm({ ...priceForm, product_id: e.target.value })}>
                <option value="">— Choisir —</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.product_name} (coût: {usd(p.unit_cost)})</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Distributeur *</label>
              <select value={priceForm.distributor_id} onChange={e => setPriceForm({ ...priceForm, distributor_id: e.target.value })}>
                <option value="">— Choisir —</option>
                {distributors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.channel})</option>)}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Prix retail ($)</label>
                <input type="number" placeholder="0.00" value={priceForm.retail_price} onChange={e => setPriceForm({ ...priceForm, retail_price: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Prix wholesale ($)</label>
                <input type="number" placeholder="0.00" value={priceForm.wholesale_price} onChange={e => setPriceForm({ ...priceForm, wholesale_price: e.target.value })} />
              </div>
            </div>
            {priceForm.product_id && (priceForm.retail_price || priceForm.wholesale_price) && (() => {
              const prod = products.find(p => p.id === priceForm.product_id)
              const cost = parseFloat(prod?.unit_cost) || 0
              return (
                <div style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: 8, padding: '0.75rem 1rem', fontSize: 13, marginBottom: '0.5rem' }}>
                  <div style={{ fontWeight: 600, color: '#2E7D32', marginBottom: 4 }}>Aperçu des marges</div>
                  {priceForm.retail_price && <div>Retail : {usd(parseFloat(priceForm.retail_price) - cost)} ({cost > 0 ? (((parseFloat(priceForm.retail_price) - cost) / parseFloat(priceForm.retail_price)) * 100).toFixed(1) : '—'}%)</div>}
                  {priceForm.wholesale_price && <div>Wholesale : {usd(parseFloat(priceForm.wholesale_price) - cost)} ({cost > 0 ? (((parseFloat(priceForm.wholesale_price) - cost) / parseFloat(priceForm.wholesale_price)) * 100).toFixed(1) : '—'}%)</div>}
                </div>
              )
            })()}
            <div className="form-actions">
              <button className="primary" onClick={savePrice} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button onClick={() => setShowPriceModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}


export async function getServerSideProps() { return { props: {} } }
