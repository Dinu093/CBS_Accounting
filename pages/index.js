import React, { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

const PERIODS = [
  { label: 'This month', value: 'month' },
  { label: 'Last month', value: 'lastmonth' },
  { label: 'Quarter', value: 'quarter' },
  { label: 'Year', value: 'year' },
  { label: 'All time', value: 'all' },
]

function getRange(p) {
  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  switch(p) {
    case 'month': return { from: today.slice(0,7) + '-01', to: today }
    case 'lastmonth': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: d.toISOString().split('T')[0], to: last.toISOString().split('T')[0] }
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      return { from: new Date(now.getFullYear(), q * 3, 1).toISOString().split('T')[0], to: today }
    }
    case 'year': return { from: now.getFullYear() + '-01-01', to: today }
    default: return { from: null, to: null }
  }
}

function MoneyChart({ inData, outData, height = 160 }) {
  const [hovered, setHovered] = useState(null)
  if (!inData || inData.length === 0) return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>No data</div>
  
  const allVals = [...inData.map(d => d.v), ...outData.map(d => d.v)]
  const max = Math.max(...allVals, 1)
  const barH = height - 40
  
  return (
    <div style={{ position: 'relative' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, fontSize: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--green)' }} />
          <span style={{ color: 'var(--text-muted)' }}>Money in</span>
          <span style={{ fontWeight: 600, color: 'var(--green)', marginLeft: 4 }}>{usd(inData.reduce((a, d) => a + d.v, 0))}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--red)' }} />
          <span style={{ color: 'var(--text-muted)' }}>Money out</span>
          <span style={{ fontWeight: 600, color: 'var(--red)', marginLeft: 4 }}>{usd(outData.reduce((a, d) => a + d.v, 0))}</span>
        </div>
      </div>

      {/* Bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: barH, position: 'relative' }}
        onMouseLeave={() => setHovered(null)}>
        {inData.map((d, i) => {
          const inH = Math.max(2, (d.v / max) * (barH - 4))
          const outH = Math.max(2, ((outData[i]?.v || 0) / max) * (barH - 4))
          const isHov = hovered === i
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 1, cursor: 'pointer' }}
              onMouseEnter={() => setHovered(i)}>
              {isHov && (
                <div style={{ position: 'absolute', top: 0, background: 'var(--navy)', color: 'white', padding: '5px 10px', borderRadius: 6, fontSize: 11, zIndex: 10, whiteSpace: 'nowrap', pointerEvents: 'none' }}>
                  <div style={{ color: '#7BC89A' }}>↑ {usd(d.v)}</div>
                  <div style={{ color: '#E88080' }}>↓ {usd(outData[i]?.v || 0)}</div>
                  <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10 }}>{d.label}</div>
                </div>
              )}
              <div style={{ width: '100%', display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'flex-end', height: '100%' }}>
                <div style={{ width: '45%', height: inH, background: isHov ? '#1A8A4A' : 'var(--green)', borderRadius: '3px 3px 0 0', opacity: d.v === 0 ? 0.2 : 1, transition: 'background 0.1s' }} />
                <div style={{ width: '45%', height: outH, background: isHov ? '#C62828' : 'var(--red)', borderRadius: '3px 3px 0 0', opacity: (outData[i]?.v || 0) === 0 ? 0.2 : 1, transition: 'background 0.1s' }} />
              </div>
            </div>
          )
        })}
      </div>

      {/* X axis labels */}
      <div style={{ display: 'flex', gap: 2, marginTop: 4 }}>
        {inData.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: hovered === i ? 'var(--navy)' : 'var(--text-muted)', fontWeight: hovered === i ? 600 : 400 }}>{d.label}</div>
        ))}
      </div>
    </div>
  )
}

function DonutChart({ segments, size = 100 }) {
  const total = segments.reduce((a, s) => a + s.value, 0)
  if (total === 0) return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--cream-dark)' }} />
  let angle = 0
  const paths = segments.map(s => {
    const pct = s.value / total
    const a1 = angle * Math.PI / 180
    const a2 = (angle + pct * 360) * Math.PI / 180
    const r = size / 2, cx = r, cy = r, ir = r * 0.6
    const x1 = cx + r * Math.sin(a1), y1 = cy - r * Math.cos(a1)
    const x2 = cx + r * Math.sin(a2), y2 = cy - r * Math.cos(a2)
    const ix1 = cx + ir * Math.sin(a1), iy1 = cy - ir * Math.cos(a1)
    const ix2 = cx + ir * Math.sin(a2), iy2 = cy - ir * Math.cos(a2)
    const large = pct > 0.5 ? 1 : 0
    const path = `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${ir} ${ir} 0 ${large} 0 ${ix1} ${iy1} Z`
    angle += pct * 360
    return { path, color: s.color }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {paths.map((p, i) => <path key={i} d={p.path} fill={p.color} />)}
    </svg>
  )
}

function ProgressBar({ value, target, color = 'var(--green)', label }) {
  const pct = target > 0 ? Math.min(100, value / target * 100) : 0
  const over = target > 0 && value > target
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
        <span style={{ fontWeight: 500 }}>{label}</span>
        <span style={{ color: over ? 'var(--green)' : pct >= 80 ? 'var(--amber)' : color, fontWeight: 600 }}>
          {usd(value)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>/ {usd(target)}</span>
        </span>
      </div>
      <div style={{ height: 8, background: 'var(--cream-dark)', borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div style={{ height: '100%', width: pct + '%', background: over ? 'var(--green)' : pct >= 80 ? 'var(--amber)' : 'var(--blue-pearl)', borderRadius: 4, transition: 'width 0.6s ease' }} />
        {target > 0 && <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 2, background: 'var(--navy)', opacity: 0.3 }} />}
      </div>
      <div style={{ fontSize: 10, color: over ? 'var(--green)' : 'var(--text-muted)', marginTop: 3, textAlign: 'right' }}>
        {over ? `✓ +${usd(value - target)} over target` : `${pct.toFixed(0)}% of target`}
      </div>
    </div>
  )
}

export default function OperationsDashboard() {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [distributors, setDistributors] = useState([])
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')

  const [txs, setTxs] = useState([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, o, d, t, tx] = await Promise.all([
        fetch('/api/inventory?t=' + Date.now()).then(r => r.json()),
        fetch('/api/sales?t=' + Date.now()).then(r => r.json()),
        fetch('/api/distributors?t=' + Date.now()).then(r => r.json()),
        fetch('/api/gifted?targets=1&t=' + Date.now()).then(r => r.json()),
        fetch('/api/transactions?t=' + Date.now()).then(r => r.json()),
      ])
      setProducts(Array.isArray(p) ? p : [])
      setOrders(Array.isArray(o) ? o : [])
      setDistributors(Array.isArray(d) ? d : [])
      setTargets(Array.isArray(t) ? t : [])
      setTxs(Array.isArray(tx) ? tx : [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const { from, to } = getRange(period)
  const filtered = orders.filter(o => (!from || o.date >= from) && (!to || o.date <= to))

  const totalRev = filtered.reduce((a, o) => a + +o.total_amount, 0)
  const ecomRev = filtered.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + +o.total_amount, 0)
  const wsRev = filtered.filter(o => o.channel !== 'E-commerce').reduce((a, o) => a + +o.total_amount, 0)
  const totalOrders = filtered.length
  const avgOrder = totalOrders > 0 ? totalRev / totalOrders : 0
  const lowStock = products.filter(p => p.quantity_on_hand <= (p.reorder_level || 10))

  // Build in/out chart data by day or month
  const inMap = {}, outMap = {}
  filtered.forEach(o => {
    const key = (period === 'year' || period === 'all') ? o.date?.slice(0, 7) : o.date?.slice(0, 10)
    if (!key) return
    inMap[key] = (inMap[key] || 0) + +o.total_amount
  })
  // Expenses filtered by same period
  const filteredTxs = txs.filter(t => {
    const type = t.category === 'Inventory / product cost' || ['Marketing & ads','Website & tech','Legal & professional fees','Bank fees','Shipping (inbound)','Shipping (outbound)','Packaging','Other expense'].includes(t.category)
    if (!type) return false
    return (!from || t.date >= from) && (!to || t.date <= to)
  })
  filteredTxs.forEach(t => {
    const key = (period === 'year' || period === 'all') ? t.date?.slice(0, 7) : t.date?.slice(0, 10)
    if (!key) return
    outMap[key] = (outMap[key] || 0) + +t.amount
  })

  // Merge keys
  const allKeys = [...new Set([...Object.keys(inMap), ...Object.keys(outMap)])].sort()
  const chartData = allKeys.map(k => ({ label: (period === 'year' || period === 'all') ? new Date(k + '-01').toLocaleString('en', { month: 'short' }) : k.slice(5), v: inMap[k] || 0 }))
  const chartOutData = allKeys.map(k => ({ label: (period === 'year' || period === 'all') ? new Date(k + '-01').toLocaleString('en', { month: 'short' }) : k.slice(5), v: outMap[k] || 0 }))
  const totalOut = filteredTxs.reduce((a, t) => a + +t.amount, 0)

  // Product sales
  const productSales = {}
  filtered.forEach(o => o.sale_items?.forEach(i => {
    const name = i.inventory?.product_name || 'Unknown'
    if (!productSales[name]) productSales[name] = { qty: 0, rev: 0 }
    productSales[name].qty += +i.quantity
    productSales[name].rev += +i.quantity * +(i.unit_price || 0)
  }))
  const topProducts = Object.entries(productSales).sort((a, b) => b[1].rev - a[1].rev)

  // Current month for targets
  const currentMonth = new Date().toISOString().slice(0, 7)
  const monthTargets = targets.filter(t => t.period === currentMonth)

  // Target vs realized for each distributor with a target
  const distPerf = monthTargets.map(t => {
    const dist = distributors.find(d => d.id === t.distributor_id)
    const realized = orders.filter(o => o.distributor_id === t.distributor_id && o.date?.startsWith(currentMonth)).reduce((a, o) => a + +o.total_amount, 0)
    return { ...t, name: dist?.name || '—', realized }
  })

  const donutData = [
    { label: 'E-commerce', value: ecomRev, color: '#6A1B9A' },
    { label: 'Wholesale', value: wsRev, color: '#2A6B4A' },
  ].filter(d => d.value > 0)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Operations</h1><p>Stock · Sales · Performance</p></div>
        <div style={{ display: 'flex', gap: 4 }}>
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, background: period === p.value ? 'var(--navy)' : 'var(--white)', color: period === p.value ? 'white' : 'var(--text-muted)', borderColor: period === p.value ? 'var(--navy)' : 'var(--border)' }}>{p.label}</button>
          ))}
        </div>
      </div>

      {loading && products.length === 0 ? <div className="loading">Loading…</div> : (
        <>
          {lowStock.length > 0 && (
            <div className="alert alert-warning" style={{ marginBottom: '1.25rem' }}>
              ⚠ Low stock: {lowStock.map(p => p.product_name + ' (' + p.quantity_on_hand + ')').join(' · ')}
            </div>
          )}

          <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
            {[
              ['Total revenue', usd(totalRev), 'var(--navy)'],
              ['Orders', totalOrders, 'var(--blue-pearl)'],
              ['Avg order', usd(avgOrder), 'var(--text-muted)'],
              ['E-commerce', usd(ecomRev), '#6A1B9A'],
              ['Wholesale', usd(wsRev), 'var(--green)'],
              ['Units in stock', products.reduce((a, p) => a + (p.quantity_on_hand || 0), 0), lowStock.length > 0 ? 'var(--red)' : 'var(--green)'],
            ].map(([l, v, c]) => (
              <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c, fontSize: 20 }}>{v}</div></div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            {/* Money In / Money Out chart */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Cash flow — {PERIODS.find(per => per.value === period)?.label}</div>
                <span style={{ fontSize: 11, color: (totalRev - totalOut) >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>Net {usd(totalRev - totalOut)}</span>
              </div>
              <MoneyChart inData={chartData} outData={chartOutData} height={180} />
            </div>

            {/* Channel donut */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div className="section-title" style={{ marginBottom: '1rem', alignSelf: 'flex-start' }}>By channel</div>
              {totalRev === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales</div>
              ) : (
                <>
                  <DonutChart segments={donutData} size={110} />
                  <div style={{ marginTop: '1rem', width: '100%' }}>
                    {[['E-commerce', ecomRev, '#6A1B9A'], ['Wholesale', wsRev, '#2A6B4A']].map(([l, v, c]) => (
                      <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: c }} /><span>{l}</span></div>
                        <div><span style={{ fontWeight: 600 }}>{usd(v)}</span> <span style={{ color: 'var(--text-muted)' }}>({totalRev > 0 ? (v / totalRev * 100).toFixed(0) : 0}%)</span></div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            {/* Top products */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Top products</div>
              {topProducts.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales in this period</div> : (
                <>
                  {topProducts.map(([name, data]) => {
                    const pct = totalRev > 0 ? data.rev / totalRev * 100 : 0
                    return (
                      <div key={name} style={{ marginBottom: '0.85rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                          <span style={{ fontWeight: 500 }}>{name}</span>
                          <span style={{ fontWeight: 600, color: 'var(--green)' }}>{usd(data.rev)}</span>
                        </div>
                        <div style={{ height: 5, background: 'var(--cream-dark)', borderRadius: 3 }}>
                          <div style={{ height: '100%', width: pct + '%', background: '#6A1B9A', borderRadius: 3 }} />
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{data.qty} units · {pct.toFixed(0)}% of revenue</div>
                      </div>
                    )
                  })}
                </>
              )}
            </div>

            {/* Target vs realized */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Target vs realized — {currentMonth}</div>
              </div>
              {distPerf.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No targets set for this month.<br/><span style={{ fontSize: 12 }}>Go to Sales → Wholesale → Set target</span></div>
              ) : distPerf.map(d => (
                <ProgressBar key={d.id} label={d.name} value={d.realized} target={+d.target_amount} />
              ))}

              {/* Also show distributors without targets */}
              {distributors.filter(d => !monthTargets.find(t => t.distributor_id === d.id)).map(d => {
                const realized = orders.filter(o => o.distributor_id === d.id && o.date?.startsWith(currentMonth)).reduce((a, o) => a + +o.total_amount, 0)
                if (realized === 0) return null
                return (
                  <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ fontWeight: 500 }}>{d.name}</span>
                    <span style={{ fontWeight: 600, color: 'var(--green)' }}>{usd(realized)} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: 11 }}>no target</span></span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Stock levels */}
          <div className="card">
            <div className="section-title" style={{ marginBottom: '1rem' }}>Stock levels</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12 }}>
              {products.map(p => {
                const isLow = p.quantity_on_hand <= (p.reorder_level || 10)
                const max = Math.max(p.quantity_on_hand, (p.reorder_level || 10) * 3, 1)
                const pct = (p.quantity_on_hand / max * 100)
                const msrpVal = p.msrp ? (p.quantity_on_hand || 0) * +p.msrp : null
                return (
                  <div key={p.id} style={{ padding: '12px', background: isLow ? 'var(--red-light)' : 'var(--cream)', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (isLow ? 'rgba(139,32,32,0.15)' : 'var(--border)') }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{p.product_name}</div>
                    <div style={{ fontSize: 28, fontWeight: 200, color: isLow ? 'var(--red)' : 'var(--green)', lineHeight: 1, marginBottom: 6 }}>{p.quantity_on_hand}</div>
                    <div style={{ height: 5, background: 'rgba(0,0,0,0.08)', borderRadius: 3, marginBottom: 6, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: Math.max(2, pct) + '%', background: isLow ? 'var(--red)' : 'var(--green)', borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cost {usd(p.unit_cost)}/u · Reorder at {p.reorder_level || 10}</div>
                    {msrpVal !== null && <div style={{ fontSize: 11, color: 'var(--green)', marginTop: 2 }}>MSRP value {usd(msrpVal)}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
