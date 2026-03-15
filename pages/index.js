import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

export default function Operations() {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [distributors, setDistributors] = useState([])
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/products').then(r=>r.json()),
      fetch('/api/sales').then(r=>r.json()),
      fetch('/api/distributors').then(r=>r.json()),
    ]).then(([p,o,d]) => {
      setProducts(Array.isArray(p)?p:[])
      setOrders(Array.isArray(o)?o:[])
      setDistributors(Array.isArray(d)?d:[])
      setLoading(false)
    })
  }, [])
  useEffect(() => { load() }, [load])

  const getRange = () => {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    if (period==='month') return { from: today.slice(0,7)+'-01', to: today }
    if (period==='quarter') { const q=Math.floor(now.getMonth()/3); return { from: new Date(now.getFullYear(),q*3,1).toISOString().split('T')[0], to: today } }
    if (period==='year') return { from: now.getFullYear()+'-01-01', to: today }
    return { from: null, to: null }
  }
  const { from, to } = getRange()
  const filtered = orders.filter(o => (!from||o.date>=from) && (!to||o.date<=to))
  const totalRev = filtered.reduce((a,o)=>a+ +o.total_amount,0)
  const ecomRev = filtered.filter(o=>o.channel==='E-commerce').reduce((a,o)=>a+ +o.total_amount,0)
  const wsRev = filtered.filter(o=>o.channel!=='E-commerce').reduce((a,o)=>a+ +o.total_amount,0)
  const totalCOGS = filtered.reduce((a,o)=>a+(o.sale_items||[]).reduce((b,i)=>b+ +i.quantity* +(i.unit_cost||0),0),0)
  const grossMargin = totalRev>0 ? (totalRev-totalCOGS)/totalRev*100 : 0
  const lowStock = products.filter(p=>+p.quantity_on_hand<=+p.reorder_level&&+p.reorder_level>0)

  // Monthly chart data
  const monthlyMap = {}
  orders.forEach(o => {
    const m = o.date?.slice(0,7); if (!m) return
    if (!monthlyMap[m]) monthlyMap[m] = { in: 0, out: 0 }
    monthlyMap[m].in += +o.total_amount
  })
  const chartMonths = Object.entries(monthlyMap).sort().slice(-6)
  const chartMax = Math.max(...chartMonths.map(([,v])=>v.in), 1)

  // Distributor performance
  const currentMonth = new Date().toISOString().slice(0,7)
  const distPerf = distributors.map(d => {
    const distOrders = orders.filter(o => o.distributor_id===d.id && o.date?.startsWith(currentMonth))
    const realized = distOrders.reduce((a,o)=>a+ +o.total_amount,0)
    const target = (d.distributor_targets||[]).find(t=>t.period===currentMonth)
    return { ...d, realized, target: target?.target_amount || 0 }
  }).filter(d => d.realized > 0 || d.target > 0)

  // Product sales breakdown
  const prodSales = {}
  filtered.forEach(o => (o.sale_items||[]).forEach(i => {
    const name = i.inventory?.product_name || '?'
    if (!prodSales[name]) prodSales[name] = { qty: 0, rev: 0 }
    prodSales[name].qty += +i.quantity
    prodSales[name].rev += +i.quantity * +(i.unit_price||0)
  }))
  const topProds = Object.entries(prodSales).sort((a,b)=>b[1].rev-a[1].rev)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Operations</h1><p>Stock · Sales · Performance</p></div>
        <div style={{display:'flex',gap:4}}>
          {[['month','Month'],['quarter','Quarter'],['year','Year'],['all','All time']].map(([v,l])=>(
            <button key={v} className={`btn btn-sm ${period===v?'btn-primary':'btn-outline'}`} onClick={()=>setPeriod(v)}>{l}</button>
          ))}
        </div>
      </div>

      {lowStock.length > 0 && (
        <div className="alert alert-warning">⚠ Low stock: {lowStock.map(p=>`${p.product_name} (${p.quantity_on_hand})`).join(' · ')}</div>
      )}

      <div className="kpi-grid kpi-grid-4" style={{marginBottom:24}}>
        <div className="kpi"><div className="kpi-label">Revenue</div><div className="kpi-value green" style={{fontSize:22}}>{usd(totalRev)}</div></div>
        <div className="kpi"><div className="kpi-label">Gross margin</div><div className={`kpi-value ${grossMargin>50?'green':grossMargin>30?'amber':'red'}`} style={{fontSize:22}}>{grossMargin.toFixed(1)}%</div></div>
        <div className="kpi"><div className="kpi-label">Orders</div><div className="kpi-value" style={{fontSize:22}}>{filtered.length}</div></div>
        <div className="kpi"><div className="kpi-label">Avg order value</div><div className="kpi-value" style={{fontSize:22}}>{filtered.length>0?usd(totalRev/filtered.length):'—'}</div></div>
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <>
          {/* Top section: chart + channel breakdown */}
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:16}}>
            <div className="card">
              <div className="card-header">
                <div className="card-title">Revenue trend</div>
                <span style={{fontSize:11,color:'var(--green)',fontWeight:500}}>{usd(totalRev)} this period</span>
              </div>
              <div style={{padding:'16px 18px'}}>
                {chartMonths.length === 0 ? <div className="empty"><p>No data yet</p></div> : (
                  <>
                    <div style={{display:'flex',alignItems:'flex-end',gap:3,height:120,marginBottom:6}}>
                      {chartMonths.map(([m,v],i)=>(
                        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',height:'100%',gap:4}}>
                          {v.in > 0 && <span style={{fontSize:9,color:'var(--text-3)'}}>{v.in>=1000?(v.in/1000).toFixed(0)+'k':Math.round(v.in)}</span>}
                          <div style={{width:'100%',height:Math.max(3,v.in/chartMax*100),background:'var(--green)',borderRadius:'3px 3px 0 0',opacity:0.85}} />
                        </div>
                      ))}
                    </div>
                    <div style={{display:'flex',gap:3}}>
                      {chartMonths.map(([m],i)=>(
                        <div key={i} style={{flex:1,textAlign:'center',fontSize:9,color:'var(--text-3)'}}>{new Date(m+'-01').toLocaleString('en',{month:'short'})}</div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">By channel</div></div>
              <div style={{padding:'16px 18px'}}>
                {[['E-commerce',ecomRev,'var(--blue)'],['Wholesale',wsRev,'var(--green)']].map(([l,v,c])=>{
                  const pct = totalRev>0 ? v/totalRev*100 : 0
                  return (
                    <div key={l} style={{marginBottom:14}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:5}}>
                        <span style={{color:'var(--text-2)'}}>{l}</span>
                        <div><span style={{fontWeight:600}}>{usd(v)}</span> <span style={{fontSize:11,color:'var(--text-3)'}}>{pct.toFixed(0)}%</span></div>
                      </div>
                      <div className="bar-track"><div className="bar-fill" style={{width:pct+'%',background:c}} /></div>
                    </div>
                  )
                })}
                <div style={{paddingTop:12,borderTop:'1px solid var(--border)',fontSize:12}}>
                  <div style={{fontSize:11,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>By distributor</div>
                  {distPerf.slice(0,3).map(d=>(
                    <div key={d.id} style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
                      <span style={{fontSize:12,color:'var(--text-2)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:100}}>{d.name}</span>
                      <div style={{display:'flex',gap:8,alignItems:'center'}}>
                        <span style={{fontSize:12,fontWeight:500}}>{usd(d.realized)}</span>
                        {d.target>0 && <span style={{fontSize:11,color:d.realized>=d.target?'var(--green)':'var(--text-3)'}}>{(d.realized/d.target*100).toFixed(0)}%</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Bottom section: top products + stock */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
            <div className="card">
              <div className="card-header"><div className="card-title">Top products</div></div>
              <div style={{padding:'0'}}>
                {topProds.length === 0 ? <div className="empty"><p>No sales in this period</p></div> : (
                  <table>
                    <thead><tr><th>Product</th><th className="td-right">Units</th><th className="td-right">Revenue</th><th className="td-right">Share</th></tr></thead>
                    <tbody>
                      {topProds.map(([name,data])=>(
                        <tr key={name}>
                          <td style={{fontWeight:500}}>{name}</td>
                          <td className="td-right td-muted">{data.qty}</td>
                          <td className="td-right td-mono" style={{fontWeight:600}}>{usd(data.rev)}</td>
                          <td className="td-right" style={{fontSize:11,color:'var(--text-3)'}}>{totalRev>0?(data.rev/totalRev*100).toFixed(0)+'%':'—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-header"><div className="card-title">Stock levels</div></div>
              <div style={{padding:'0'}}>
                <table>
                  <thead><tr><th>Product</th><th className="td-right">On hand</th><th className="td-right">Cost/u</th><th>Status</th></tr></thead>
                  <tbody>
                    {products.map(p=>{
                      const isNeg = +p.quantity_on_hand<0
                      const isLow = +p.quantity_on_hand<=+p.reorder_level&&+p.reorder_level>0
                      return (
                        <tr key={p.id}>
                          <td style={{fontWeight:500,fontSize:13}}>{p.product_name}</td>
                          <td className="td-right td-mono" style={{fontWeight:600,color:isNeg?'var(--red)':isLow?'var(--amber)':'var(--green)'}}>{p.quantity_on_hand}</td>
                          <td className="td-right td-muted td-mono">{usd(p.unit_cost)}</td>
                          <td>{isNeg?<span className="badge badge-red">Neg</span>:isLow?<span className="badge badge-amber">Low</span>:<span className="badge badge-green">OK</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
