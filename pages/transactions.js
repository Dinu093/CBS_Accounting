import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import { usd, fdate, fdateShort, TX_CATEGORIES, TX_CAT_MAP } from '../lib/constants'
import { useAuth } from '../lib/auth'
import * as XLSX from 'xlsx'

export async function getServerSideProps() { return { props: {} } }

export default function Transactions() {
  const { isAdmin } = useAuth()
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [pending, setPending] = useState([])
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], description: '', category: 'Marketing & ads', amount: '', note: '' })
  const [period, setPeriod] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [search, setSearch] = useState('')
  const [openMonths, setOpenMonths] = useState(new Set([new Date().toISOString().slice(0,7)]))
  const [selected, setSelected] = useState(new Set())
  const fileRef = useRef()

  const load = () => { setLoading(true); fetch('/api/transactions').then(r=>r.json()).then(d=>{ setTxs(Array.isArray(d)?d:[]); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const getRange = () => {
    const today = new Date().toISOString().split('T')[0], now = new Date()
    if (period==='month') return { from: today.slice(0,7)+'-01', to: today }
    if (period==='quarter') { const q=Math.floor(now.getMonth()/3); return { from: new Date(now.getFullYear(),q*3,1).toISOString().split('T')[0], to: today } }
    if (period==='year') return { from: now.getFullYear()+'-01-01', to: today }
    return { from: null, to: null }
  }
  const { from, to } = getRange()
  let filtered = txs.filter(t => (!from||t.date>=from) && (!to||t.date<=to))
  if (filterType !== 'all') filtered = filtered.filter(t => TX_CAT_MAP[t.category] === filterType)
  if (search) filtered = filtered.filter(t => t.description?.toLowerCase().includes(search.toLowerCase()) || t.note?.toLowerCase().includes(search.toLowerCase()))

  const moneyIn = filtered.filter(t => ['revenue','capital'].includes(TX_CAT_MAP[t.category])).reduce((a,t)=>a+ +t.amount,0)
  const moneyOut = filtered.filter(t => ['cogs','opex','distribution'].includes(TX_CAT_MAP[t.category])).reduce((a,t)=>a+ +t.amount,0)

  // Group by month
  const groups = {}
  filtered.forEach(t => { const m = t.date?.slice(0,7)||'?'; if (!groups[m]) groups[m]=[]; groups[m].push(t) })
  const sortedMonths = Object.keys(groups).sort().reverse()

  const toggleMonth = (m) => { const s=new Set(openMonths); s.has(m)?s.delete(m):s.add(m); setOpenMonths(s) }

  const readFile = async (file) => {
    const name = file.name.toLowerCase()
    if (name.endsWith('.csv')||name.endsWith('.xlsx')||name.endsWith('.xls')) {
      const ab = await file.arrayBuffer()
      const wb = XLSX.read(new Uint8Array(ab),{type:'array'})
      return { type:'spreadsheet', content: XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]) }
    }
    const b64 = await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file)})
    return { type: file.type.startsWith('image/')?'image':'pdf', content: b64, mediaType: file.type }
  }

  const analyzeFile = async (file) => {
    setAnalyzing(true)
    try {
      const { type, content, mediaType } = await readFile(file)
      const catList = TX_CATEGORIES.map(c=>c.value).join(', ')
      const system = `You are an accounting assistant for Clique Beauty Skincare LLC (Kentucky LLC, cash basis). This is a Mercury bank statement. Extract ONLY expense transactions. Return ONLY a JSON array. Each item: {"date":"YYYY-MM-DD","description":"vendor name","category":"one of: ${catList}","amount":positive_number,"note":"bank_reference","type":"opex or cogs or capital or distribution"}. STRICT RULES: 1) IGNORE all positive amounts (money coming IN) EXCEPT transfers clearly from "La Cara LLC" which = Capital contribution. 2) EXTRACT all negative amounts (money going OUT): Facebook/Meta → Marketing & ads, FedEx/UPS/USPS/Chronopost → Shipping (outbound), Shopify fees → Website & tech, Mercury/bank fees → Bank fees, supplier payments → Inventory / product cost, all other expenses → Other expense. 3) Put the bank reference code in "note" field. 4) DO NOT include Clique Boutique, Joseph Salon, Holiday Manor or any distributor payments — those are sales already recorded. Return ONLY valid JSON array, no markdown.`
      const resp = await fetch('/api/analyze', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ type, content, mediaType, filename: file.name, systemOverride: system }) })
      const data = await resp.json()
      setPending((data.transactions||[]).map((t,i)=>({...t,_id:Date.now()+i})))
    } catch(err) { alert('Error: '+err.message) }
    setAnalyzing(false)
  }

  const [dupModal, setDupModal] = useState(null)

  const acceptAll = async (force=false) => {
    setSaving(true)
    const resp = await fetch('/api/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ transactions: pending.map(({_id,...t})=>t), forceInsert: force }) })
    const data = await resp.json()
    setSaving(false)
    if (!force && data.duplicates?.length > 0) {
      setDupModal(data.duplicates)
      return
    }
    setPending([]); setDupModal(null); load()
  }

  const saveManual = async () => {
    if (!form.date||!form.description||!form.amount) return
    setSaving(true)
    if (editing) {
      await fetch('/api/transactions', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: editing, ...form, amount:+form.amount, type:TX_CAT_MAP[form.category]||'opex' }) })
    } else {
      await fetch('/api/transactions', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ transactions:[{...form,amount:+form.amount,type:TX_CAT_MAP[form.category]||'opex'}], forceInsert:false }) })
    }
    setSaving(false); closeModal(); load()
  }

  const del = async (id) => { if(!confirm('Delete?')) return; await fetch('/api/transactions?id='+id,{method:'DELETE'}); load() }

  const openEdit = (tx) => {
    setEditing(tx.id)
    setForm({ date: tx.date, description: tx.description, category: tx.category, amount: tx.amount, note: tx.note || '' })
    setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditing(null); setForm({date:new Date().toISOString().split('T')[0],description:'',category:'Marketing & ads',amount:'',note:''}) }
  const delSelected = async () => { if(!confirm('Delete '+selected.size+' transactions?'))return; for(const id of selected) await fetch('/api/transactions?id='+id,{method:'DELETE'}); setSelected(new Set()); load() }

  const typeColor = (cat) => { const t=TX_CAT_MAP[cat]; if(t==='revenue'||t==='capital') return 'var(--green)'; if(t==='cogs') return 'var(--amber)'; return 'var(--red)' }
  const isPositive = (cat) => { const t=TX_CAT_MAP[cat]; return t==='revenue'||t==='capital' }

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Transactions</h1><p>Bank statement · {filtered.length} entries</p></div>
        <div style={{display:'flex',gap:8}}>
          {isAdmin && <><input type="file" ref={fileRef} style={{display:'none'}} accept=".csv,.xlsx,.xls,image/*,.pdf" onChange={e=>e.target.files[0]&&analyzeFile(e.target.files[0])} /><button className="btn btn-outline" onClick={()=>fileRef.current.click()}>{analyzing?'Analyzing…':'⬆ Upload statement'}</button><button className="btn btn-primary" onClick={()=>setShowModal(true)}>+ Add manually</button></>}
        </div>
      </div>

      {/* Summary bar */}
      <div style={{display:'grid',gridTemplateColumns:'300px 1fr 200px',gap:16,marginBottom:24,padding:'16px 20px',border:'1px solid var(--border)',borderRadius:'var(--radius-lg)'}}>
        <div>
          <div style={{fontSize:11,color:'var(--text-3)',marginBottom:6}}>Net change</div>
          <div style={{fontSize:26,fontWeight:600,letterSpacing:'-0.02em',color:moneyIn-moneyOut>=0?'var(--green)':'var(--red)'}}>{moneyIn-moneyOut>=0?'+':''}{usd(moneyIn-moneyOut)}</div>
          <div style={{display:'flex',gap:16,marginTop:10}}>
            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><div style={{width:3,height:14,background:'var(--green)',borderRadius:2}} /><span style={{color:'var(--text-3)'}}>Money in</span><span style={{fontWeight:500,color:'var(--green)'}}>{usd(moneyIn)}</span></div>
            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><div style={{width:3,height:14,background:'var(--border-2)',borderRadius:2}} /><span style={{color:'var(--text-3)'}}>Money out</span><span style={{fontWeight:500}}>−{usd(moneyOut)}</span></div>
          </div>
        </div>
        <div style={{display:'flex',alignItems:'flex-end',gap:2,height:60}}>
          {/* Mini sparkline */}
          {Object.entries(groups).sort().slice(-8).map(([m,txList])=>{
            const inn = txList.filter(t=>isPositive(t.category)).reduce((a,t)=>a+ +t.amount,0)
            const out = txList.filter(t=>!isPositive(t.category)).reduce((a,t)=>a+ +t.amount,0)
            const mx = Math.max(inn,out,1)
            return (
              <div key={m} style={{flex:1,display:'flex',gap:2,alignItems:'flex-end',height:'100%'}}>
                <div style={{flex:1,height:Math.max(3,inn/mx*56),background:'var(--green)',borderRadius:'2px 2px 0 0',opacity:0.8}} title={m+' in: '+usd(inn)} />
                <div style={{flex:1,height:Math.max(3,out/mx*56),background:'var(--border-2)',borderRadius:'2px 2px 0 0'}} title={m+' out: '+usd(out)} />
              </div>
            )
          })}
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:11,color:'var(--text-3)',marginBottom:4}}>Period</div>
          <div style={{display:'flex',gap:4,justifyContent:'flex-end'}}>
            {[['month','Month'],['quarter','Quarter'],['year','Year'],['all','All']].map(([v,l])=>(
              <button key={v} className={`btn btn-sm ${period===v?'btn-primary':'btn-outline'}`} onClick={()=>setPeriod(v)}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Pending transactions */}
      {pending.length > 0 && (
        <div className="card" style={{marginBottom:16,border:'1px solid var(--blue)'}}>
          <div className="card-header">
            <div style={{fontWeight:500,color:'var(--navy)'}}>{pending.length} transactions extracted — review & confirm</div>
            <div style={{display:'flex',gap:8}}><button className="btn btn-outline btn-sm" onClick={()=>setPending([])}>Reject all</button><button className="btn btn-primary btn-sm" onClick={()=>acceptAll()} disabled={saving}>{saving?'Saving…':'Accept all'}</button></div>
          </div>
          <div style={{padding:'12px 18px',maxHeight:300,overflow:'auto'}}>
            {pending.map((tx,i)=>(
              <div key={tx._id} style={{display:'grid',gridTemplateColumns:'110px 1fr 180px 90px 28px',gap:8,marginBottom:8,alignItems:'center'}}>
                <input type="date" value={tx.date} onChange={e=>setPending(p=>p.map((x,xi)=>xi===i?{...x,date:e.target.value}:x))} style={{fontSize:12}} />
                <input type="text" value={tx.description} onChange={e=>setPending(p=>p.map((x,xi)=>xi===i?{...x,description:e.target.value}:x))} style={{fontSize:12}} />
                <select value={tx.category} onChange={e=>setPending(p=>p.map((x,xi)=>xi===i?{...x,category:e.target.value}:x))} style={{fontSize:11}}>
                  {TX_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.value}</option>)}
                </select>
                <input type="number" value={tx.amount} onChange={e=>setPending(p=>p.map((x,xi)=>xi===i?{...x,amount:e.target.value}:x))} style={{fontSize:12}} />
                <button onClick={()=>setPending(p=>p.filter((_,xi)=>xi!==i))} style={{background:'none',border:'none',color:'var(--text-3)',fontSize:18,cursor:'pointer'}}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center',flexWrap:'wrap'}}>
        <input className="search-input" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{width:200}} />
        {[['all','All'],['revenue','Money in'],['cogs','COGS'],['opex','OpEx'],['capital','Capital']].map(([v,l])=>(
          <button key={v} className={`chip${filterType===v?' active':''}`} onClick={()=>setFilterType(v)}>{l}</button>
        ))}
        {selected.size > 0 && isAdmin && <button className="btn btn-danger btn-sm" style={{marginLeft:'auto'}} onClick={delSelected}>Delete {selected.size} selected</button>}
      </div>

      {/* Monthly folders */}
      {loading ? <div className="loading">Loading…</div> : filtered.length===0 ? (
        <div className="empty"><div className="empty-icon">💳</div><p>No transactions{period!=='all'?' in this period':' yet'}</p></div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {sortedMonths.map(month=>{
            const monthTxs = groups[month]
            const monthIn = monthTxs.filter(t=>isPositive(t.category)).reduce((a,t)=>a+ +t.amount,0)
            const monthOut = monthTxs.filter(t=>!isPositive(t.category)).reduce((a,t)=>a+ +t.amount,0)
            const isOpen = openMonths.has(month)
            const label = new Date(month+'-01').toLocaleString('en',{month:'long',year:'numeric'})
            return (
              <div key={month} className="card" style={{overflow:'hidden'}}>
                <div onClick={()=>toggleMonth(month)} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 18px',cursor:'pointer',background:isOpen?'var(--navy)':'#fff'}}>
                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                    <span style={{fontSize:13,color:isOpen?'rgba(255,255,255,0.5)':'var(--text-3)',transition:'transform 0.15s',display:'inline-block',transform:isOpen?'rotate(90deg)':'none'}}>▶</span>
                    <div>
                      <div style={{fontWeight:600,fontSize:14,color:isOpen?'#fff':'var(--text)'}}>{label}</div>
                      <div style={{fontSize:11,color:isOpen?'rgba(255,255,255,0.4)':'var(--text-3)',marginTop:1}}>{monthTxs.length} transactions</div>
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{display:'flex',gap:16}}>
                      <span style={{fontSize:12,color:isOpen?'#7BC89A':'var(--green)',fontWeight:500}}>+{usd(monthIn)}</span>
                      <span style={{fontSize:12,color:isOpen?'#E88080':'var(--red)',fontWeight:500}}>−{usd(monthOut)}</span>
                    </div>
                  </div>
                </div>
                {isOpen && (
                  <table>
                    <thead><tr>
                      {isAdmin&&<th style={{width:36}}><input type="checkbox" checked={monthTxs.every(t=>selected.has(t.id))} onChange={()=>{const s=new Set(selected);if(monthTxs.every(t=>s.has(t.id)))monthTxs.forEach(t=>s.delete(t.id));else monthTxs.forEach(t=>s.add(t.id));setSelected(s)}} style={{width:'auto'}} /></th>}
                      <th>Date</th><th>Description</th><th>Category</th><th className="td-right">Amount</th><th>Note</th>
                      {isAdmin&&<th></th>}
                    </tr></thead>
                    <tbody>
                      {monthTxs.map(tx=>{
                        const pos = isPositive(tx.category)
                        return (
                          <tr key={tx.id} style={{background:selected.has(tx.id)?'var(--bg-2)':undefined}}>
                            {isAdmin&&<td onClick={e=>{e.stopPropagation();const s=new Set(selected);s.has(tx.id)?s.delete(tx.id):s.add(tx.id);setSelected(s)}} style={{paddingLeft:18}}><input type="checkbox" checked={selected.has(tx.id)} onChange={()=>{}} style={{width:'auto'}} /></td>}
                            <td className="td-muted" style={{whiteSpace:'nowrap'}}>{fdateShort(tx.date)}</td>
                            <td style={{fontWeight:500}}>{tx.description}</td>
                            <td><span className="badge" style={{background:pos?'var(--green-light)':'var(--bg-3)',color:pos?'var(--green)':'var(--text-3)',fontSize:11}}>{tx.category}</span></td>
                            <td className="td-right td-mono" style={{fontWeight:600,color:pos?'var(--green)':'var(--text)'}}>{pos?'+':'-'}{usd(tx.amount)}</td>
                            <td className="td-muted" style={{fontSize:12}}>{tx.note||'—'}</td>
                            {isAdmin&&<td><div style={{display:'flex',gap:4}}><button className="btn btn-outline btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={()=>openEdit(tx)}>Edit</button><button className="btn btn-danger btn-sm" style={{fontSize:11,padding:'3px 8px'}} onClick={()=>del(tx.id)}>×</button></div></td>}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}

      {dupModal && (
        <div className="modal-backdrop">
          <div className="modal" style={{maxWidth:560}}>
            <div className="modal-header">
              <h2>⚠ Duplicates detected</h2>
              <button className="modal-close" onClick={()=>setDupModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{fontSize:13,color:'var(--text-2)',marginBottom:16}}>The following transactions already exist in your records with the exact same date, amount and description. Do you want to add them anyway?</p>
              <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:16}}>
                {dupModal.map((d,i)=>(
                  <div key={i} style={{padding:'10px 14px',background:'var(--bg-2)',borderRadius:10,display:'grid',gridTemplateColumns:'90px 1fr 100px',gap:8,alignItems:'center'}}>
                    <span style={{fontSize:12,color:'var(--text-3)'}}>{d.tx.date}</span>
                    <span style={{fontSize:13,fontWeight:500}}>{d.tx.description}</span>
                    <span style={{fontSize:13,fontWeight:600,textAlign:'right',color:'var(--text)'}}>{usd(d.tx.amount)}</span>
                  </div>
                ))}
              </div>
              <p style={{fontSize:12,color:'var(--text-3)'}}>Note: identical amounts from the same vendor on different dates are <strong>not</strong> duplicates — only exact same-day same-amount same-description entries are flagged.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setDupModal(null)}>Skip duplicates</button>
              <button className="btn btn-primary" onClick={()=>acceptAll(true)} disabled={saving}>{saving?'Saving…':'Add them anyway'}</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div className="modal">
            <div className="modal-header"><h2>{editing?'Edit transaction':'New transaction'}</h2><button className="modal-close" onClick={closeModal}>×</button></div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Date *</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Amount ($) *</label><input type="number" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} placeholder="0.00" /></div>
              </div>
              <div className="form-group"><label className="form-label">Description *</label><input type="text" value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Facebook Ads, La Cara LLC transfer…" /></div>
              <div className="form-group"><label className="form-label">Category</label>
                <select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>
                  {TX_CATEGORIES.map(c=><option key={c.value} value={c.value}>{c.value}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Note / Reference</label><input type="text" value={form.note} onChange={e=>setForm({...form,note:e.target.value})} placeholder="Invoice #…" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={closeModal}>Cancel</button>
              <button className="btn btn-primary" onClick={saveManual} disabled={saving}>{saving?'Saving…':editing?'Update':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
