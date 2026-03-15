import { useState, useEffect, useRef } from 'react'
import { usd } from '../lib/constants'

export default function MapComponent() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersLayer = useRef(null)
  const [orders, setOrders] = useState([])
  const [distributors, setDistributors] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [geocoding, setGeocoding] = useState(false)
  const [geocodedCount, setGeocodedCount] = useState(0)

  useEffect(() => {
    Promise.all([
      fetch('/api/sales').then(r=>r.json()),
      fetch('/api/distributors').then(r=>r.json()),
    ]).then(([o,d]) => {
      setOrders(Array.isArray(o)?o:[])
      setDistributors(Array.isArray(d)?d:[])
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'; link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }
    if (!window.L) {
      const script = document.createElement('script')
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      script.onload = () => initMap()
      document.head.appendChild(script)
    }
  }, [])

  useEffect(() => { if (!loading && window.L && !mapInstance.current) initMap() }, [loading])

  const initMap = () => {
    if (!mapRef.current || mapInstance.current) return
    const L = window.L
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({ iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png', iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png' })
    const map = L.map(mapRef.current, { center: [39.5,-98.35], zoom: 4 })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '© OpenStreetMap © CARTO', maxZoom: 19, subdomains: 'abcd' }).addTo(map)
    mapInstance.current = map
    markersLayer.current = L.layerGroup().addTo(map)
    plotMarkers()
  }

  useEffect(() => { if (mapInstance.current && markersLayer.current && !loading) plotMarkers() }, [orders, distributors, filter])

  const plotMarkers = () => {
    const L = window.L; if (!L) return
    markersLayer.current.clearLayers()
    const bounds = []
    if (filter==='all'||filter==='ecom') {
      orders.filter(o=>o.channel==='E-commerce'&&o.lat&&o.lng).forEach(o=>{
        const m = L.circleMarker([+o.lat,+o.lng],{radius:8,fillColor:'#185FA5',color:'#fff',weight:2,fillOpacity:0.85})
        m.bindPopup(`<div style="font-family:system-ui;min-width:160px"><b>${o.buyer_name||'Customer'}</b><br><small style="color:#888">${o.buyer_city||''} ${o.buyer_state||''}</small><br><b style="color:#1a7a4a">${usd(o.total_amount)}</b><br><small style="color:#aaa">${o.date}</small></div>`)
        m.addTo(markersLayer.current); bounds.push([+o.lat,+o.lng])
      })
    }
    if (filter==='all'||filter==='wholesale') {
      distributors.forEach(d=>(d.distributor_locations||[]).filter(l=>l.lat&&l.lng).forEach(loc=>{
        const total = orders.filter(o=>o.distributor_id===d.id).reduce((a,o)=>a+ +o.total_amount,0)
        const size = Math.max(10,Math.min(24,10+total/400))
        const m = L.circleMarker([+loc.lat,+loc.lng],{radius:size,fillColor:'#1a7a4a',color:'#fff',weight:2,fillOpacity:0.85})
        m.bindPopup(`<div style="font-family:system-ui;min-width:160px"><b>${d.name}</b><br><small style="color:#888">${loc.city||''}, ${loc.state||''}</small>${total>0?`<br><b style="color:#1a7a4a">${usd(total)}</b>`:''}</div>`)
        m.addTo(markersLayer.current); bounds.push([+loc.lat,+loc.lng])
      }))
    }
    if (bounds.length>0) { try { mapInstance.current.fitBounds(L.latLngBounds(bounds),{padding:[50,50],maxZoom:10}) } catch(e){} }
  }

  const ecomOrders = orders.filter(o=>o.channel==='E-commerce')
  const needsGeocode = ecomOrders.filter(o=>!o.lat&&o.buyer_address&&o.buyer_city).length
  const totalEcom = ecomOrders.reduce((a,o)=>a+ +o.total_amount,0)
  const totalWS = orders.filter(o=>o.channel!=='E-commerce').reduce((a,o)=>a+ +o.total_amount,0)
  const states = new Set(orders.filter(o=>o.buyer_state).map(o=>o.buyer_state))

  const geocodeAll = async () => {
    setGeocoding(true); let count=0
    for (const order of ecomOrders.filter(o=>!o.lat&&o.buyer_address&&o.buyer_city)) {
      try {
        const r = await fetch('/api/geocode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:order.buyer_address,city:order.buyer_city,state:order.buyer_state,zip:order.buyer_zip})})
        const {lat,lng} = await r.json()
        if (lat&&lng) { await fetch('/api/sales',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:order.id,lat,lng})}); setOrders(p=>p.map(o=>o.id===order.id?{...o,lat,lng}:o)); count++; setGeocodedCount(count) }
        await new Promise(r=>setTimeout(r,400))
      } catch(e){}
    }
    setGeocoding(false)
  }

  return (
    <div>
      <div className="page-header">
        <div><h1>Customer map</h1><p>{ecomOrders.filter(o=>o.lat).length} e-com · {distributors.reduce((a,d)=>(d.distributor_locations||[]).filter(l=>l.lat).length+a,0)} wholesale · {states.size} states</p></div>
        {needsGeocode>0&&!geocoding&&<button className="btn btn-outline" onClick={geocodeAll}>📍 Geocode {needsGeocode} address{needsGeocode!==1?'es':''}</button>}
        {geocoding&&<span style={{fontSize:12,color:'var(--text-3)'}}>Geocoding {geocodedCount}…</span>}
      </div>

      <div className="kpi-grid kpi-grid-4" style={{marginBottom:16}}>
        <div className="kpi"><div className="kpi-label">E-commerce</div><div className="kpi-value" style={{fontSize:18,color:'var(--blue)'}}>{usd(totalEcom)}</div></div>
        <div className="kpi"><div className="kpi-label">Wholesale</div><div className="kpi-value green" style={{fontSize:18}}>{usd(totalWS)}</div></div>
        <div className="kpi"><div className="kpi-label">Total revenue</div><div className="kpi-value" style={{fontSize:18}}>{usd(totalEcom+totalWS)}</div></div>
        <div className="kpi"><div className="kpi-label">States reached</div><div className="kpi-value" style={{fontSize:18}}>{states.size}</div></div>
      </div>

      <div style={{display:'flex',gap:8,marginBottom:12,alignItems:'center'}}>
        {[['all','All'],['ecom','E-commerce'],['wholesale','Wholesale']].map(([v,l])=>(
          <button key={v} className={`btn btn-sm ${filter===v?'btn-primary':'btn-outline'}`} onClick={()=>setFilter(v)}>{l}</button>
        ))}
        <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-3)'}}>● E-commerce &nbsp; ● Wholesale (size = revenue)</span>
      </div>

      <div className="card" style={{padding:0,overflow:'hidden',marginBottom:16}}>
        {needsGeocode>0&&<div className="alert alert-warning" style={{margin:0,borderRadius:0,borderBottom:'1px solid var(--border)'}}><span>⚠ {needsGeocode} address{needsGeocode!==1?'es':''} not geocoded</span><button className="btn btn-sm" style={{marginLeft:'auto',background:'var(--amber)',color:'white',border:'none'}} onClick={geocodeAll}>{geocoding?'…':'Geocode now'}</button></div>}
        {loading ? <div className="loading">Loading…</div> : <div ref={mapRef} style={{height:480,width:'100%'}} />}
      </div>

      <div className="table-wrap">
        <table>
          <thead><tr><th>Type</th><th>Name</th><th>Address</th><th>State</th><th className="td-right">Revenue</th><th>On map</th></tr></thead>
          <tbody>
            {ecomOrders.filter(o=>o.buyer_address).map(o=>(
              <tr key={o.id}>
                <td><span className="badge badge-blue">E-com</span></td>
                <td style={{fontWeight:500}}>{o.buyer_name||'—'}</td>
                <td className="td-muted" style={{fontSize:12}}>{o.buyer_address}, {o.buyer_city}</td>
                <td className="td-muted">{o.buyer_state}</td>
                <td className="td-right td-mono" style={{fontWeight:600,color:'var(--green)'}}>{usd(o.total_amount)}</td>
                <td style={{textAlign:'center'}}>{o.lat?'✓':'—'}</td>
              </tr>
            ))}
            {distributors.flatMap(d=>(d.distributor_locations||[]).filter(l=>l.address).map(l=>(
              <tr key={l.id}>
                <td><span className="badge badge-green">Wholesale</span></td>
                <td style={{fontWeight:500}}>{d.name}</td>
                <td className="td-muted" style={{fontSize:12}}>{l.address}, {l.city}</td>
                <td className="td-muted">{l.state}</td>
                <td className="td-right td-muted">—</td>
                <td style={{textAlign:'center'}}>{l.lat?'✓':'—'}</td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
