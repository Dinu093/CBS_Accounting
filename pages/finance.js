import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { usd, TX_CAT_MAP } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

export default function Finance() {
  const [txs, setTxs] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('year')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/transactions').then(r=>r.json()),
      fetch('/api/sales').then(r=>r.json()),
    ]).then(([t,o]) => { setTxs(Array.isArray(t)?t:[]); setOrders(Array.isArray(o)?o:[]); setLoading(false) })
  }, [])
  useEffect(() => { load() }, [load])

  const getRange = () => {
    const today = new Date().toISOString().split('T')[0], now = new Date()
    if (period==='month') return { from: today.slice(0,7)+'-01', to: today }
    if (period==='quarter') { const q=Math.floor(now.getMonth()/3); return { from: new Date(now.getFullYear(),q*3,1).toISOString().split('T')[0], to: today } }
    if (period==='year') return { from: now.getFullYear()+'-01-01', to: today }
    return { from: null, to: null }
  }
  const { from, to } = getRange()
  const fTxs = txs.filter(t => (!from||t.date>=from) && (!to||t.date<=to))

  const sum = (types) => fTxs.filter(t=>types.includes(TX_CAT_MAP[t.category])).reduce((a,t)=>a+ +t.amount,0)
  const rev = sum(['revenue'])
  const cap = sum(['capital'])
  const cogs = fTxs.filter(t=>TX_CAT_MAP[t.category]==='cogs').reduce((a,t)=>a+ +t.amount,0)
  const opex = fTxs.filter(t=>TX_CAT_MAP[t.category]==='opex').reduce((a,t)=>a+ +t.amount,0)
  const gross = rev - cogs
  const net = gross - opex
  const totalEquity = cap + net
  const grossPct = rev>0 ? gross/rev*100 : 0
  const netPct = rev>0 ? net/rev*100 : 0

  // Expense breakdown
  const expByCategory = {}
  fTxs.filter(t=>['cogs','opex'].includes(TX_CAT_MAP[t.category])).forEach(t => {
    expByCategory[t.category] = (expByCategory[t.category]||0) + +t.amount
  })
  const totalExp = Object.values(expByCategory).reduce((a,v)=>a+v,0)

  // Monthly chart
  const monthlyMap = {}
  orders.forEach(o => { const m=o.date?.slice(0,7); if(!m) return; if(!monthlyMap[m]) monthlyMap[m]=0; monthlyMap[m]+= +o.total_amount })
  const chartData = Object.entries(monthlyMap).sort().slice(-12)
  const chartMax = Math.max(...chartData.map(([,v])=>v),1)

  // Recent txs
  const recent = fTxs.slice(0,8)

  const expColors = {'Marketing & ads':'#534AB7','Inventory / product cost':'#BA7517','Website & tech':'#1D9E75','Bank fees':'#7BA3BC','Shipping (outbound)':'#D85A30','Gifted products':'#D4537E','Other expense':'#888780','Freight (inbound)':'#185FA5','Customs / tariffs':'#854F0B'}

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Finance</h1><p>P&L · Balance sheet · Cash flow · FY 2025</p></div>
        <div style={{display:'flex',gap:4}}>
          {[['month','Month'],['quarter','Quarter'],['year','Year'],['all','All time']].map(([v,l])=>(
            <button key={v} className={`btn btn-sm ${period===v?'btn-primary':'btn-outline'}`} onClick={()=>setPeriod(v)}>{l}</button>
          ))}
          <button className="btn btn-outline btn-sm" onClick={load}>↻</button>
        </div>
      </div>

      <div className="kpi-grid" style={{gridTemplateColumns:'repeat(6,1fr)',marginBottom:24}}>
        {[
          ['Revenue',usd(rev),'green'],
          ['Gross profit',usd(gross)+(grossPct>0?' ('+grossPct.toFixed(0)+'%)':''),gross>=0?'green':'red'],
          ['Net income',usd(net)+(netPct>0?' ('+netPct.toFixed(0)+'%)':''),net>=0?'green':'red'],
          ['Total expenses',usd(cogs+opex),'amber'],
          ['Capital',usd(cap),''],
          ['Total equity',usd(totalEquity),totalEquity>=0?'green':'red'],
        ].map(([l,v,c])=>(
          <div key={l} className="kpi"><div className="kpi-label">{l}</div><div className={`kpi-value ${c}`} style={{fontSize:16}}>{v}</div></div>
        ))}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16,marginBottom:16}}>
            {/* Revenue trend */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">Revenue trend (12 months)</div>
              </div>
              <div style={{padding:'16px 18px'}}>
                {chartData.length===0 ? <div className="empty"><p>No data</p></div> : (
                  <>
                    <div style={{display:'flex',alignItems:'flex-end',gap:4,height:130,marginBottom:6}}>
                      {chartData.map(([m,v],i)=>(
                        <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',height:'100%',gap:3}}>
                          {v>0&&<span style={{fontSize:9,color:'var(--text-3)'}}>{v>=1000?(v/1000).toFixed(1)+'k':Math.round(v)}</span>}
                          <div style={{width:'100%',height:Math.max(3,v/chartMax*110),background:'var(--green)',borderRadius:'3px 3px 0 0',opacity:0.85}} />
                        </div>
                      ))}
                    </div>
                    <div style={{display:'flex',gap:4}}>
                      {chartData.map(([m],i)=><div key={i} style={{flex:1,textAlign:'center',fontSize:9,color:'var(--text-3)'}}>{new Date(m+'-01').toLocaleString('en',{month:'short'})}</div>)}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* P&L breakdown */}
            <div className="card">
              <div className="card-header"><div className="card-title">P&L breakdown</div></div>
              <div style={{padding:'14px 18px'}}>
                {[['Revenue',rev,'var(--green)',false],['COGS',cogs,'var(--amber)',false],['Gross profit',gross,gross>=0?'var(--green)':'var(--red)',true],['OpEx',opex,'#534AB7',false],['Net income',net,net>=0?'var(--green)':'var(--red)',true]].map(([l,v,c,bold])=>{
                  const pct = Math.max(0,v/(rev||1)*100)
                  return (
                    <div key={l} style={{marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                        <span style={{color:bold?'var(--text)':'var(--text-2)',fontWeight:bold?600:400}}>{l}</span>
                        <span style={{color:c,fontWeight:bold?600:400}}>{usd(v)}</span>
                      </div>
                      <div className="bar-track"><div className="bar-fill" style={{width:pct+'%',background:c}} /></div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:16}}>
            {/* Expense breakdown */}
            <div className="card">
              <div className="card-header"><div className="card-title">Expense breakdown</div></div>
              <div style={{padding:'14px 18px'}}>
                {Object.entries(expByCategory).sort((a,b)=>b[1]-a[1]).map(([cat,amt])=>{
                  const pct = totalExp>0 ? amt/totalExp*100 : 0
                  const color = expColors[cat] || '#888'
                  return (
                    <div key={cat} style={{marginBottom:10}}>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:3}}>
                        <div style={{display:'flex',alignItems:'center',gap:6}}><div style={{width:8,height:8,borderRadius:2,background:color,flexShrink:0}} /><span style={{color:'var(--text-2)'}}>{cat}</span></div>
                        <span style={{fontWeight:500}}>{usd(amt)} <span style={{color:'var(--text-3)',fontWeight:400}}>({pct.toFixed(0)}%)</span></span>
                      </div>
                      <div className="bar-track"><div className="bar-fill" style={{width:pct+'%',background:color}} /></div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Balance sheet */}
            <div className="card">
              <div className="card-header"><div className="card-title">Balance sheet</div></div>
              <div style={{padding:'14px 18px'}}>
                {[{label:'Assets',items:[['Cash (estimated)',totalEquity,totalEquity>=0?'var(--green)':'var(--red)']]},
                  {label:'Liabilities',items:[['Accounts payable',0,'var(--text-3)']]},
                  {label:'Equity',items:[['Capital contributed',cap,'var(--text)'],['Net income',net,net>=0?'var(--green)':'var(--red)']]}
                ].map(({label,items})=>(
                  <div key={label} style={{marginBottom:12}}>
                    <div style={{fontSize:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--text-3)',marginBottom:6}}>{label}</div>
                    {items.map(([l,v,c])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'6px 10px',background:'var(--bg-2)',borderRadius:6,marginBottom:4,fontSize:12}}>
                        <span style={{color:'var(--text-2)'}}>{l}</span>
                        <span style={{fontWeight:500,color:c}}>{usd(v)}</span>
                      </div>
                    ))}
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',padding:'9px 10px',background:'var(--navy)',borderRadius:6,fontSize:13,marginTop:8}}>
                  <span style={{color:'rgba(255,255,255,0.7)',fontWeight:500}}>Total equity</span>
                  <span style={{fontWeight:600,color:totalEquity>=0?'#7BC89A':'#E88080'}}>{usd(totalEquity)}</span>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:10}}>
                  {['Member 1 (50%)','Member 2 (50%)'].map(l=>(
                    <div key={l} style={{padding:'8px',background:'var(--bg-2)',borderRadius:6,textAlign:'center'}}>
                      <div style={{fontSize:10,color:'var(--text-3)',marginBottom:3}}>{l}</div>
                      <div style={{fontSize:15,fontWeight:500,color:net>=0?'var(--green)':'var(--red)'}}>{usd(net*0.5)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Description</th><th>Category</th><th className="td-right">Amount</th></tr></thead>
              <tbody>
                {recent.length===0 ? <tr><td colSpan={4} style={{textAlign:'center',color:'var(--text-3)',padding:30}}>No transactions in this period</td></tr> :
                  recent.map(tx=>{
                    const pos = ['revenue','capital'].includes(TX_CAT_MAP[tx.category])
                    return (
                      <tr key={tx.id}>
                        <td className="td-muted">{tx.date}</td>
                        <td style={{fontWeight:500}}>{tx.description}</td>
                        <td><span className="badge" style={{background:pos?'var(--green-light)':'var(--bg-3)',color:pos?'var(--green)':'var(--text-3)',fontSize:11}}>{tx.category}</span></td>
                        <td className="td-right td-mono" style={{fontWeight:600,color:pos?'var(--green)':'var(--text)'}}>{pos?'+':'-'}{usd(tx.amount)}</td>
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  )
}
