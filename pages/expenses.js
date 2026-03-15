import React, { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import { useAuth } from './_app'
import { CATEGORIES, CAT_KEYS, TYPE_COLORS, usd, fdate } from '../lib/constants'
import DateFilter, { filterByDate } from '../components/DateFilter'
import * as XLSX from 'xlsx'

export async function getServerSideProps() { return { props: {} } }

const EXPENSE_CATS = [...CAT_KEYS.filter(k => CATEGORIES[k] === 'cogs' || CATEGORIES[k] === 'opex'), 'Capital contribution']

export default function Expenses() {
  const { isAdmin } = useAuth()
  const [txs, setTxs] = useState([])
  const [shipments, setShipments] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeMsg, setAnalyzeMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [dateRange, setDateRange] = useState({ from: null, to: null })
  const [expandedTx, setExpandedTx] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [openMonths, setOpenMonths] = useState(new Set([new Date().toISOString().slice(0, 7)]))
  const [filterCat, setFilterCat] = useState('all')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], description: '', category: 'Marketing & ads', amount: '', note: '' })
  const [pendingTxs, setPendingTxs] = useState([])
  const [dupConfirm, setDupConfirm] = useState(null)
  const inputRef = useRef()

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/transactions?t=' + Date.now()).then(r => r.json()),
      fetch('/api/shipments?t=' + Date.now()).then(r => r.json()),
    ]).then(([t, s]) => {
      setShipments(Array.isArray(s) ? s : [])
      const allTxs = Array.isArray(t) ? t : []
      setTxs(allTxs.filter(tx => CATEGORIES[tx.category] === 'cogs' || CATEGORIES[tx.category] === 'opex'))
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const del = async (id) => {
    await fetch('/api/transactions?id=' + id, { method: 'DELETE' })
    load()
  }

  const delSelected = async () => {
    if (!confirm(`Delete ${selected.size} transaction${selected.size > 1 ? 's' : ''}?`)) return
    for (const id of selected) {
      await fetch('/api/transactions?id=' + id, { method: 'DELETE' })
    }
    setSelected(new Set())
    load()
  }

  const toggleSelect = (id) => {
    const s = new Set(selected)
    s.has(id) ? s.delete(id) : s.add(id)
    setSelected(s)
  }

  const toggleAll = () => {
    if (selected.size === filteredTxs.length) setSelected(new Set())
    else setSelected(new Set(filteredTxs.map(t => t.id)))
  }

  const saveManual = async () => {
    if (!form.date || !form.description || !form.amount) return
    setSaving(true)
    const resp = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [{ ...form, amount: parseFloat(form.amount), type: CATEGORIES[form.category] }], forceInsert: false })
    })
    const data = await resp.json()
    setSaving(false)
    if (data.duplicates?.length > 0) { setDupConfirm({ data }); return }
    setShowModal(false)
    setForm({ date: new Date().toISOString().split('T')[0], description: '', category: 'Marketing & ads', amount: '', note: '' })
    load()
  }

  async function readFile(file) {
    const name = file.name.toLowerCase()
    if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(ab), { type: 'array' })
      return { type: 'spreadsheet', content: XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]) }
    }
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
    return { type: file.type.startsWith('image/') ? 'image' : 'pdf', content: b64, mediaType: file.type }
  }

  const analyzeFile = async (file) => {
    setAnalyzing(true); setAnalyzeMsg('Reading file…')
    try {
      const { type, content, mediaType } = await readFile(file)
      setAnalyzeMsg('Claude is analyzing…')
      const systemOverride = `You are an accounting assistant for Clique Beauty Skincare LLC. Extract ONLY expense transactions (money going OUT) from this document. Return ONLY a JSON array. Each item: {"date":"YYYY-MM-DD","description":"concise label","category":"one of: ${EXPENSE_CATS.join(', ')}","amount":positive_number,"note":"reference if available"}. Rules: Facebook/Meta/Google → "Marketing & ads". Shopify subscription → "Website & tech". Bank/wire fees → "Bank fees". Supplier invoices → "Inventory / product cost". Legal/accounting → "Legal & professional fees". Return ONLY the JSON array.`
      const resp = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, content, mediaType, filename: file.name, systemOverride }) })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      const extracted = (data.transactions || []).map((t, i) => ({ ...t, _pid: Date.now() + i }))
      setPendingTxs(extracted)
    } catch (err) { alert('Error: ' + err.message) }
    finally { setAnalyzing(false) }
  }

  const acceptAll = async (forceInsert = false) => {
    setSaving(true)
    const resp = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: pendingTxs.map(({ _pid, ...t }) => ({ ...t, type: CATEGORIES[t.category] })), forceInsert })
    })
    const data = await resp.json()
    setSaving(false)
    if (!forceInsert && data.duplicates?.length > 0) { setDupConfirm({ data, pending: pendingTxs }); return }
    setPendingTxs([])
    setDupConfirm(null)
    load()
  }

  // Filtered transactions
  let filteredTxs = filterByDate(txs, 'date', dateRange)
  if (filterCat !== 'all') filteredTxs = filteredTxs.filter(t => t.category === filterCat)
  if (searchKeyword) filteredTxs = filteredTxs.filter(t => t.description?.toLowerCase().includes(searchKeyword.toLowerCase()) || t.note?.toLowerCase().includes(searchKeyword.toLowerCase()))
  if (amountMin) filteredTxs = filteredTxs.filter(t => parseFloat(t.amount) >= parseFloat(amountMin))
  if (amountMax) filteredTxs = filteredTxs.filter(t => parseFloat(t.amount) <= parseFloat(amountMax))

  const totalExp = filteredTxs.reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const totalCogs = filteredTxs.filter(t => CATEGORIES[t.category] === 'cogs').reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const totalOpex = filteredTxs.filter(t => CATEGORIES[t.category] === 'opex').reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const activeFilters = (filterCat !== 'all' ? 1 : 0) + (searchKeyword ? 1 : 0) + (amountMin || amountMax ? 1 : 0)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Expenses</h1><p>Charges & expenses · Total {usd(totalExp)}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={inputRef} type="file" accept="image/*,.pdf,.csv,.xlsx" style={{ display: 'none' }} onChange={e => e.target.files[0] && analyzeFile(e.target.files[0])} />
          {isAdmin && <button onClick={() => !analyzing && inputRef.current.click()}>{analyzing ? '⏳ ' + analyzeMsg : '⬆ Upload document'}</button>}
          {isAdmin && <button className="primary" onClick={() => setShowModal(true)}>+ Add manually</button>}
        </div>
      </div>

      <DateFilter onChange={setDateRange} />

      <div className="metrics-grid" style={{ marginBottom: '1.25rem' }}>
        {[['Total expenses', usd(totalExp), 'var(--red)'], ['Cost of goods', usd(totalCogs), 'var(--amber)'], ['Operating expenses', usd(totalOpex), '#5B3D8A'], ['Transactions', filteredTxs.length, 'var(--text-muted)']].map(([l, v, c]) => (
          <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
        ))}
      </div>

      {/* Pending transactions from upload */}
      {pendingTxs.length > 0 && (
        <div className="card" style={{ marginBottom: '1.25rem', border: '1.5px solid var(--blue-pearl)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, color: 'var(--navy)' }}>{pendingTxs.length} transactions extracted — review & confirm</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setPendingTxs([])}>Reject all</button>
              <button className="primary" onClick={() => acceptAll(false)} disabled={saving}>{saving ? 'Saving…' : '✓ Accept all'}</button>
            </div>
          </div>
          {pendingTxs.map((tx, i) => {
            const c = TYPE_COLORS[CATEGORIES[tx.category]] || TYPE_COLORS.opex
            return (
              <div key={tx._pid} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 200px 100px 28px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input type="date" value={tx.date} onChange={e => setPendingTxs(p => p.map((x, xi) => xi === i ? { ...x, date: e.target.value } : x))} style={{ fontSize: 12 }} />
                <input type="text" value={tx.description} onChange={e => setPendingTxs(p => p.map((x, xi) => xi === i ? { ...x, description: e.target.value } : x))} style={{ fontSize: 13 }} />
                <select value={tx.category} onChange={e => setPendingTxs(p => p.map((x, xi) => xi === i ? { ...x, category: e.target.value } : x))} style={{ fontSize: 12 }}>
                  {EXPENSE_CATS.map(k => <option key={k}>{k}</option>)}
                </select>
                <input type="number" value={tx.amount} onChange={e => setPendingTxs(p => p.map((x, xi) => xi === i ? { ...x, amount: e.target.value } : x))} style={{ fontSize: 13, textAlign: 'right' }} />
                <button onClick={() => setPendingTxs(p => p.filter((_, xi) => xi !== i))} style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18 }}>×</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Search */}
        <input type="text" placeholder="🔍 Search…" value={searchKeyword} onChange={e => setSearchKeyword(e.target.value)}
          style={{ width: 200, fontSize: 12, padding: '6px 10px' }} />

        {/* Filter button */}
        <button onClick={() => setShowFilters(!showFilters)} style={{ fontSize: 12, padding: '6px 12px', background: activeFilters > 0 ? 'var(--navy)' : 'var(--white)', color: activeFilters > 0 ? 'white' : 'var(--text-muted)', borderColor: activeFilters > 0 ? 'var(--navy)' : 'var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
          ⊟ Filters {activeFilters > 0 && <span style={{ background: 'var(--blue-pearl)', borderRadius: 10, fontSize: 10, padding: '1px 6px' }}>{activeFilters}</span>}
        </button>

        {/* Category pills */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button onClick={() => setFilterCat('all')} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: filterCat === 'all' ? 'var(--navy)' : 'var(--white)', color: filterCat === 'all' ? 'white' : 'var(--text-muted)', borderColor: filterCat === 'all' ? 'var(--navy)' : 'var(--border)' }}>All</button>
          {['Marketing & ads', 'Website & tech', 'Inventory / product cost', 'Bank fees', 'Shipping (outbound)', 'Other expense'].map(cat => (
            <button key={cat} onClick={() => setFilterCat(cat === filterCat ? 'all' : cat)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, background: filterCat === cat ? 'var(--navy)' : 'var(--white)', color: filterCat === cat ? 'white' : 'var(--text-muted)', borderColor: filterCat === cat ? 'var(--navy)' : 'var(--border)' }}>{cat}</button>
          ))}
        </div>

        {selected.size > 0 && isAdmin && (
          <button onClick={delSelected} className="danger" style={{ marginLeft: 'auto', fontSize: 12, padding: '6px 14px' }}>
            🗑 Delete {selected.size} selected
          </button>
        )}
      </div>

      {/* Advanced filters panel */}
      {showFilters && (
        <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Min amount ($)</label>
            <input type="number" placeholder="0.00" value={amountMin} onChange={e => setAmountMin(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Max amount ($)</label>
            <input type="number" placeholder="9999.99" value={amountMax} onChange={e => setAmountMax(e.target.value)} />
          </div>
          <button onClick={() => { setAmountMin(''); setAmountMax(''); setSearchKeyword(''); setFilterCat('all') }} style={{ fontSize: 12, color: 'var(--text-muted)' }}>Clear all filters</button>
        </div>
      )}

      {/* Monthly folders */}
      {loading ? <div className="loading">Loading…</div> : filteredTxs.length === 0 ? (
        <div className="card"><div className="empty-state"><div style={{ fontSize: 36 }}>🔴</div><p>No expenses recorded</p></div></div>
      ) : (
        <>
        {(() => {
          // Group by month
          const groups = {}
          filteredTxs.forEach(tx => {
            const month = tx.date?.slice(0, 7) || 'Unknown'
            if (!groups[month]) groups[month] = []
            groups[month].push(tx)
          })
          const sortedMonths = Object.keys(groups).sort().reverse()

          return sortedMonths.map(month => {
            const monthTxs = groups[month]
            const monthTotal = monthTxs.reduce((a, t) => a + parseFloat(t.amount || 0), 0)
            const monthLabel = new Date(month + '-01').toLocaleString('en', { month: 'long', year: 'numeric' })
            const isOpen = openMonths.has(month)

            return (
              <div key={month} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '0.75rem' }}>
                {/* Month header */}
                <div
                  onClick={() => {
                    const s = new Set(openMonths)
                    s.has(month) ? s.delete(month) : s.add(month)
                    setOpenMonths(s)
                  }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', cursor: 'pointer', background: isOpen ? 'var(--navy)' : 'var(--white)', borderBottom: isOpen ? '1px solid rgba(255,255,255,0.1)' : 'none', transition: 'background 0.15s' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 16, color: isOpen ? 'rgba(255,255,255,0.6)' : 'var(--text-muted)', transition: 'transform 0.2s', display: 'inline-block', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: isOpen ? 'white' : 'var(--navy)' }}>{monthLabel}</div>
                      <div style={{ fontSize: 11, color: isOpen ? 'rgba(255,255,255,0.45)' : 'var(--text-muted)', marginTop: 1 }}>{monthTxs.length} transaction{monthTxs.length > 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: isOpen ? '#E88080' : 'var(--red)' }}>−{usd(monthTotal)}</div>
                  </div>
                </div>

                {/* Transactions */}
                {isOpen && (
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}>
                          <input type="checkbox"
                            checked={monthTxs.every(t => selected.has(t.id))}
                            onChange={() => {
                              const s = new Set(selected)
                              if (monthTxs.every(t => s.has(t.id))) monthTxs.forEach(t => s.delete(t.id))
                              else monthTxs.forEach(t => s.add(t.id))
                              setSelected(s)
                            }}
                            style={{ width: 'auto' }} />
                        </th>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Category</th>
                        <th style={{ textAlign: 'right' }}>Amount</th>
                        <th>Note</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                    {monthTxs.map(tx => {
                const type = CATEGORIES[tx.category]
                const c = TYPE_COLORS[type] || TYPE_COLORS.opex
                const isExpanded = expandedTx === tx.id
                return [
                  <tr key={tx.id} onClick={() => setExpandedTx(isExpanded ? null : tx.id)} style={{ cursor: 'pointer', background: selected.has(tx.id) ? 'rgba(123,163,188,0.08)' : undefined }}>
                    <td onClick={e => { e.stopPropagation(); toggleSelect(tx.id) }}>
                      <input type="checkbox" checked={selected.has(tx.id)} onChange={() => toggleSelect(tx.id)} style={{ width: 'auto' }} />
                    </td>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: 12 }}>{fdate(tx.date)}</td>
                    <td style={{ maxWidth: 240 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{tx.description}</div></td>
                    <td><span className="pill" style={{ background: c.bg, color: c.text, fontSize: 11 }}>{tx.category}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#C62828', whiteSpace: 'nowrap' }}>−{usd(tx.amount)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{tx.note || '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      {isAdmin && <button onClick={() => del(tx.id)} style={{ fontSize: 11, padding: '4px 10px', background: 'var(--red-light)', color: 'var(--red)', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }}>× Delete</button>}
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={tx.id + '_exp'}>
                      <td colSpan={7} style={{ background: 'var(--cream)', padding: 0, borderBottom: '2px solid var(--border)' }}>
                        {(() => {
                          const shipment = shipments.find(s =>
                            tx.description?.includes(s.reference) ||
                            (s.date === tx.date && tx.category === 'Inventory / product cost')
                          )
                          if (shipment) {
                            const items = shipment.shipment_items || []
                            const totalUnits = items.reduce((a, i) => a + parseFloat(i.quantity || 0), 0)
                            return (
                              <div style={{ padding: '16px' }}>
                                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--navy)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Shipment breakdown — {shipment.reference}</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 14 }}>
                                  {[['Products', shipment.total_product_cost, '#639922'], ['Freight', shipment.freight_cost, 'var(--blue-pearl)'], ['Customs', shipment.customs_cost, '#5B3D8A'], ['Packaging', shipment.packaging_cost, 'var(--amber)']].filter(([, v]) => parseFloat(v) > 0).map(([l, v, c]) => (
                                    <div key={l} style={{ padding: '10px 12px', background: 'white', borderRadius: 8, textAlign: 'center', border: '1px solid var(--border)' }}>
                                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{l}</div>
                                      <div style={{ fontWeight: 600, color: c, fontSize: 14 }}>{usd(v)}</div>
                                    </div>
                                  ))}
                                </div>
                                {items.length > 0 && (
                                  <table style={{ fontSize: 12 }}>
                                    <thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Prod cost/u</th><th style={{ textAlign: 'right' }}>Allocated/u</th><th style={{ textAlign: 'right' }}>Total cost/u</th></tr></thead>
                                    <tbody>
                                      {items.map((item, i) => {
                                        const prodUnit = parseFloat(item.unit_purchase_price || 0)
                                        const allocated = totalUnits > 0 ? (parseFloat(shipment.freight_cost || 0) + parseFloat(shipment.customs_cost || 0) + parseFloat(shipment.packaging_cost || 0)) / totalUnits : 0
                                        return (
                                          <tr key={i}>
                                            <td style={{ fontWeight: 500 }}>{item.inventory?.product_name || '—'}</td>
                                            <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                                            <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{usd(prodUnit)}</td>
                                            <td style={{ textAlign: 'right', color: 'var(--blue-pearl)' }}>+{usd(allocated)}</td>
                                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--red)' }}>{usd(parseFloat(item.total_unit_cost || 0))}</td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                  </table>
                                )}
                              </div>
                            )
                          }
                          return (
                            <div style={{ padding: '14px 16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
                              <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Date</div><div style={{ fontSize: 13, fontWeight: 500 }}>{fdate(tx.date)}</div></div>
                              <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Amount</div><div style={{ fontSize: 18, fontWeight: 300, color: '#C62828' }}>−{usd(tx.amount)}</div></div>
                              <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Type</div><div style={{ fontSize: 13 }}>{type === 'cogs' ? 'Cost of goods' : 'Operating expense'}</div></div>
                              {tx.note && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Note</div><div style={{ fontSize: 13 }}>{tx.note}</div></div>}
                            </div>
                          )
                        })()}
                      </td>
                    </tr>
                  )
                ]
              })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })
        })()}
        </>
      )}

      {/* Footer count */}
      {filteredTxs.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, textAlign: 'right' }}>
          {filteredTxs.length} transaction{filteredTxs.length > 1 ? 's' : ''} · {usd(totalExp)} total
          {selected.size > 0 && <span style={{ marginLeft: 12, color: 'var(--navy)', fontWeight: 500 }}>{selected.size} selected</span>}
        </div>
      )}

      {/* Duplicate confirm */}
      {dupConfirm && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <h2 style={{ textAlign: 'center' }}>Duplicates detected</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', margin: '1rem 0' }}>{dupConfirm.data?.duplicates?.length} duplicate(s) found. Save anyway?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="primary" onClick={() => dupConfirm.pending ? acceptAll(true) : saveManual()} disabled={saving} style={{ padding: '10px' }}>Yes, save anyway</button>
              <button onClick={() => setDupConfirm(null)} style={{ padding: '10px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual entry modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2>New expense</h2>
            <div className="form-row">
              <div className="form-group"><label>Date *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label>Amount ($) *</label><input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Description *</label><input type="text" placeholder="Facebook Ads, Shopify…" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="form-group"><label>Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {EXPENSE_CATS.map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Note / Reference</label><input type="text" placeholder="Invoice #, memo…" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
            <div className="form-actions">
              <button className="primary" onClick={saveManual} disabled={saving}>{saving ? 'Saving…' : 'Save expense'}</button>
              <button onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
