import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd, TX_CAT_MAP } from '../lib/constants'
import * as XLSX from 'xlsx'

export async function getServerSideProps() { return { props: {} } }

export default function Reports() {
  const [txs, setTxs] = useState([])
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [fy, setFy] = useState(new Date().getFullYear())

  const load = () => { setLoading(true); Promise.all([fetch('/api/transactions').then(r=>r.json()),fetch('/api/sales').then(r=>r.json()),fetch('/api/products').then(r=>r.json())]).then(([t,o,p])=>{ setTxs(Array.isArray(t)?t:[]); setOrders(Array.isArray(o)?o:[]); setProducts(Array.isArray(p)?p:[]); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const fyTxs = txs.filter(t=>t.date?.startsWith(String(fy)))
  const fyOrders = orders.filter(o=>o.date?.startsWith(String(fy)))
  const sum = (types) => fyTxs.filter(t=>types.includes(TX_CAT_MAP[t.category])).reduce((a,t)=>a+ +t.amount,0)
  const rev = sum(['revenue'])
  const cogs = sum(['cogs'])
  const opex = sum(['opex'])
  const cap = sum(['capital'])
  const gross = rev-cogs, net = gross-opex

  const exportExcel = () => {
    const wb = XLSX.utils.book_new()
    // P&L sheet
    const plData = [
      ['Clique Beauty Skincare LLC — Form 1065 Tax Package FY '+fy],[],
      ['INCOME STATEMENT'],[''],
      ['Revenue',rev],
      ['Cost of goods sold',cogs],
      ['Gross profit',gross],
      ['','Gross margin %',rev>0?(gross/rev*100).toFixed(1)+'%':''],[''],
      ['OPERATING EXPENSES'],
      ...Object.entries(fyTxs.filter(t=>TX_CAT_MAP[t.category]==='opex').reduce((a,t)=>{a[t.category]=(a[t.category]||0)+ +t.amount;return a},{})).map(([k,v])=>[k,v]),
      ['Total operating expenses',opex],[''],
      ['NET INCOME',net],
      ['','Net margin %',rev>0?(net/rev*100).toFixed(1)+'%':''],[''],
      ['PARTNERSHIP ALLOCATION (50/50)'],
      ['Member 1',net*0.5],['Member 2',net*0.5],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(plData), 'P&L — Form 1065')
    // Schedule K-1
    const k1 = [['Schedule K-1 — FY '+fy],[],['Ordinary income (loss)',net],['Member 1 share (50%)',net*0.5],['Member 2 share (50%)',net*0.5]]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(k1), 'Schedule K-1')
    // Sales by channel
    const ecom = fyOrders.filter(o=>o.channel==='E-commerce')
    const ws = fyOrders.filter(o=>o.channel!=='E-commerce')
    const salesData = [['Sales by channel FY '+fy],[],['Channel','Orders','Revenue'],['E-commerce',ecom.length,ecom.reduce((a,o)=>a+ +o.total_amount,0)],['Wholesale',ws.length,ws.reduce((a,o)=>a+ +o.total_amount,0)],['Total',fyOrders.length,fyOrders.reduce((a,o)=>a+ +o.total_amount,0)]]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(salesData), 'Sales by channel')
    // Transactions ledger
    const txData = [['Date','Description','Category','Type','Amount','Note'],...fyTxs.map(t=>[t.date,t.description,t.category,TX_CAT_MAP[t.category],t.amount,t.note||''])]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txData), 'Transactions ledger')
    XLSX.writeFile(wb, 'CBS_TaxPackage_FY'+fy+'.xlsx')
  }

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Reports</h1><p>Financial statements · Tax preparation · FY {fy}</p></div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <select value={fy} onChange={e=>setFy(+e.target.value)} style={{width:'auto',padding:'7px 12px'}}>
            {[2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <button className="btn btn-primary" onClick={exportExcel}>⬇ Export Excel (Tax Package)</button>
        </div>
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <div className="grid-2">
          {/* P&L */}
          <div className="card">
            <div className="card-header"><div className="card-title">Income statement — FY {fy}</div></div>
            <div style={{padding:'14px 18px'}}>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Revenue</div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'1px solid var(--border)',fontSize:13}}><span style={{color:'var(--text-2)'}}>Gross sales</span><span style={{fontWeight:500,color:'var(--green)'}}>{usd(rev)}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'2px solid var(--border)',fontSize:13}}><span style={{color:'var(--text-2)'}}>Cost of goods sold</span><span style={{fontWeight:500,color:'var(--amber)'}}>{usd(cogs)}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border)',fontSize:13,fontWeight:600}}><span>Gross profit</span><div><span style={{color:gross>=0?'var(--green)':'var(--red)'}}>{usd(gross)}</span> <span style={{fontSize:11,color:'var(--text-3)',fontWeight:400}}>({rev>0?(gross/rev*100).toFixed(1):'0.0'}%)</span></div></div>
              <div style={{fontSize:11,fontWeight:600,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',margin:'12px 0 8px'}}>Operating expenses</div>
              {Object.entries(fyTxs.filter(t=>TX_CAT_MAP[t.category]==='opex').reduce((a,t)=>{a[t.category]=(a[t.category]||0)+ +t.amount;return a},{})).map(([k,v])=>(
                <div key={k} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}><span style={{color:'var(--text-2)',paddingLeft:12}}>{k}</span><span>{usd(v)}</span></div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',padding:'7px 0',borderBottom:'2px solid var(--border)',fontSize:13,fontWeight:600}}><span>Total operating expenses</span><span style={{color:'#534AB7'}}>{usd(opex)}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0',fontSize:14,fontWeight:600}}><span>Net income</span><div><span style={{color:net>=0?'var(--green)':'var(--red)'}}>{usd(net)}</span> <span style={{fontSize:11,color:'var(--text-3)',fontWeight:400}}>({rev>0?(net/rev*100).toFixed(1):'0.0'}%)</span></div></div>
            </div>
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {/* Key ratios */}
            <div className="card">
              <div className="card-header"><div className="card-title">Key ratios</div></div>
              <div className="kpi-grid kpi-grid-2" style={{padding:'12px 18px'}}>
                <div className="kpi"><div className="kpi-label">Gross margin</div><div className={`kpi-value ${rev>0&&gross/rev>0.5?'green':rev>0&&gross/rev>0.3?'amber':'red'}`}>{rev>0?(gross/rev*100).toFixed(1)+'%':'—'}</div></div>
                <div className="kpi"><div className="kpi-label">Net margin</div><div className={`kpi-value ${net>=0?'green':'red'}`}>{rev>0?(net/rev*100).toFixed(1)+'%':'—'}</div></div>
              </div>
            </div>
            {/* Partnership */}
            <div className="card">
              <div className="card-header"><div className="card-title">Partnership allocation (50/50)</div></div>
              <div style={{padding:'14px 18px',display:'flex',flexDirection:'column',gap:10}}>
                {['Member 1','Member 2'].map(m=>(
                  <div key={m} style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:'var(--bg-2)',borderRadius:8}}>
                    <span style={{fontWeight:500}}>{m} — 50%</span>
                    <span style={{fontWeight:600,color:net>=0?'var(--green)':'var(--red)'}}>{usd(net*0.5)}</span>
                  </div>
                ))}
                <div style={{fontSize:11,color:'var(--text-3)',marginTop:4}}>Report on Schedule K-1 · Due March 15, {fy+1} · Extension available</div>
              </div>
            </div>
            {/* Sales summary */}
            <div className="card">
              <div className="card-header"><div className="card-title">Sales summary FY {fy}</div></div>
              <div style={{padding:'0'}}>
                <table>
                  <thead><tr><th>Channel</th><th className="td-right">Orders</th><th className="td-right">Revenue</th></tr></thead>
                  <tbody>
                    {[['E-commerce',fyOrders.filter(o=>o.channel==='E-commerce')],['Wholesale',fyOrders.filter(o=>o.channel!=='E-commerce')]].map(([ch,ords])=>(
                      <tr key={ch}><td style={{fontWeight:500}}>{ch}</td><td className="td-right td-muted">{ords.length}</td><td className="td-right td-mono" style={{fontWeight:600}}>{usd(ords.reduce((a,o)=>a+ +o.total_amount,0))}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
