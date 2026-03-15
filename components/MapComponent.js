import { useState, useEffect, useRef } from 'react'
import { usd } from '../lib/constants'
import 'leaflet/dist/leaflet.css'

export default function MapComponent() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersLayer = useRef(null)
  const [orders, setOrders] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [geocodedCount, setGeocodedCount] = useState(0)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    Promise.all([
      fetch('/api/sales?t=' + Date.now()).then(r => r.json()),
      fetch('/api/locations?t=' + Date.now()).then(r => r.json()),
    ]).then(([o, l]) => {
      setOrders(Array.isArray(o) ? o : [])
      setLocations(Array.isArray(l) ? l : [])
      setLoading(false)
    })
  }, [])

  // Init map
  useEffect(() => {
    if (loading || mapInstance.current) return
    
    const L = require('leaflet')
    
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    const map = L.map(mapRef.current, { center: [39.5, -98.35], zoom: 4 })
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO', maxZoom: 19, subdomains: 'abcd'
    }).addTo(map)

    mapInstance.current = map
    markersLayer.current = L.layerGroup().addTo(map)
  }, [loading])

  // Update markers
  useEffect(() => {
    if (!mapInstance.current || !markersLayer.current) return
    const L = require('leaflet')
    markersLayer.current.clearLayers()
    const bounds = []

    if (filter === 'all' || filter === 'ecom') {
      orders.filter(o => o.channel === 'E-commerce' && o.lat && o.lng).forEach(o => {
        const m = L.circleMarker([+o.lat, +o.lng], { radius: 9, fillColor: '#6A1B9A', color: '#fff', weight: 2, fillOpacity: 0.85 })
        m.bindPopup(`<div style="font-family:sans-serif;min-width:180px"><b>${o.buyer_name || 'Customer'}</b><br/><small>${o.buyer_address || ''}, ${o.buyer_city || ''} ${o.buyer_state || ''}</small><br/><b style="color:#2A6B4A">${usd(o.total_amount)}</b><br/><small style="color:#999">${o.date}</small></div>`)
        m.addTo(markersLayer.current)
        bounds.push([+o.lat, +o.lng])
      })
    }

    if (filter === 'all' || filter === 'wholesale') {
      locations.filter(l => l.lat && l.lng).forEach(loc => {
        const total = orders.filter(o => o.location_id === loc.id).reduce((a, o) => a + +o.total_amount, 0)
        const size = Math.max(10, Math.min(26, 10 + total / 300))
        const m = L.circleMarker([+loc.lat, +loc.lng], { radius: size, fillColor: '#2A6B4A', color: '#fff', weight: 2, fillOpacity: 0.85 })
        m.bindPopup(`<div style="font-family:sans-serif;min-width:180px"><b>${loc.name}</b><br/><small>${loc.address || ''}, ${loc.city || ''} ${loc.state || ''}</small>${total > 0 ? `<br/><b style="color:#2A6B4A">${usd(total)}</b>` : ''}</div>`)
        m.addTo(markersLayer.current)
        bounds.push([+loc.lat, +loc.lng])
      })
    }

    if (bounds.length > 0) {
      try { mapInstance.current.fitBounds(require('leaflet').latLngBounds(bounds), { padding: [50, 50], maxZoom: 10 }) } catch(e) {}
    }
  }, [orders, locations, filter])

  const needsGeocode = orders.filter(o => o.channel === 'E-commerce' && !o.lat && o.buyer_address).length + locations.filter(l => !l.lat && l.address).length
  const totalEcom = orders.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + +o.total_amount, 0)
  const totalWS = orders.filter(o => o.channel !== 'E-commerce').reduce((a, o) => a + +o.total_amount, 0)
  const states = new Set(orders.filter(o => o.buyer_state).map(o => o.buyer_state))

  const geocodeAll = async () => {
    setGeocoding(true); let count = 0
    for (const order of orders.filter(o => o.channel === 'E-commerce' && !o.lat && o.buyer_address && o.buyer_city)) {
      try {
        const r = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: order.buyer_address, city: order.buyer_city, state: order.buyer_state, zip: order.buyer_zip }) })
        const { lat, lng } = await r.json()
        if (lat && lng) {
          await fetch('/api/sales', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, lat, lng }) })
          setOrders(prev => prev.map(o => o.id === order.id ? { ...o, lat, lng } : o))
          count++; setGeocodedCount(count)
        }
        await new Promise(r => setTimeout(r, 400))
      } catch(e) {}
    }
    for (const loc of locations.filter(l => !l.lat && l.address && l.city)) {
      try {
        const r = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: loc.address, city: loc.city, state: loc.state, zip: loc.zip }) })
        const { lat, lng } = await r.json()
        if (lat && lng) {
          await fetch('/api/locations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: loc.id, lat, lng }) })
          setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, lat, lng } : l))
          count++; setGeocodedCount(count)
        }
        await new Promise(r => setTimeout(r, 400))
      } catch(e) {}
    }
    setGeocoding(false)
  }

  return (
    <div>
      <div className="page-header">
        <div><h1>Customer Map</h1><p>{orders.filter(o => o.channel === 'E-commerce' && o.lat).length} e-com · {locations.filter(l => l.lat).length} wholesale · {states.size} states</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {geocoding && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏳ {geocodedCount} geocoded…</span>}
          {needsGeocode > 0 && !geocoding && <button className="primary" onClick={geocodeAll}>📍 Geocode {needsGeocode} address{needsGeocode !== 1 ? 'es' : ''}</button>}
        </div>
      </div>

      <div className="metrics-grid" style={{ marginBottom: '1.25rem' }}>
        {[['E-commerce', usd(totalEcom), '#6A1B9A'], ['Wholesale', usd(totalWS), 'var(--green)'], ['Total', usd(totalEcom + totalWS), 'var(--navy)'], ['States', states.size, 'var(--blue-pearl)']].map(([l, v, c]) => (
          <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', alignItems: 'center' }}>
        {[['all', 'All'], ['ecom', '🟣 E-commerce'], ['wholesale', '🟢 Wholesale']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 20, background: filter === v ? 'var(--navy)' : 'var(--white)', color: filter === v ? 'white' : 'var(--text-muted)', borderColor: filter === v ? 'var(--navy)' : 'var(--border)' }}>{l}</button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>🟣 E-commerce &nbsp; 🟢 Wholesale (size = revenue)</div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
        {needsGeocode > 0 && (
          <div style={{ padding: '10px 16px', background: 'var(--amber-light)', borderBottom: '1px solid rgba(139,94,26,0.15)', fontSize: 13, color: 'var(--amber)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠ {needsGeocode} address{needsGeocode !== 1 ? 'es' : ''} not yet on map</span>
            <button onClick={geocodeAll} disabled={geocoding} style={{ fontSize: 12, padding: '4px 12px', background: 'var(--amber)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>{geocoding ? 'Geocoding…' : 'Geocode now'}</button>
          </div>
        )}
        {loading ? <div className="loading">Loading…</div> : <div ref={mapRef} style={{ height: 520, width: '100%' }} />}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>All addresses</div>
        <table>
          <thead><tr><th>Type</th><th>Name</th><th>Address</th><th>State</th><th style={{ textAlign: 'right' }}>Revenue</th><th>On map</th></tr></thead>
          <tbody>
            {orders.filter(o => o.channel === 'E-commerce' && o.buyer_address).map(o => (
              <tr key={o.id}>
                <td><span className="pill" style={{ background: '#E8EAF6', color: '#283593', fontSize: 11 }}>E-com</span></td>
                <td style={{ fontWeight: 500, fontSize: 13 }}>{o.buyer_name || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.buyer_address}, {o.buyer_city}</td>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{o.buyer_state}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{usd(o.total_amount)}</td>
                <td style={{ textAlign: 'center' }}>{o.lat ? <span style={{ color: 'var(--green)' }}>✓</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
              </tr>
            ))}
            {locations.filter(l => l.address).map(l => (
              <tr key={l.id}>
                <td><span className="pill" style={{ background: 'var(--green-light)', color: 'var(--green)', fontSize: 11 }}>Wholesale</span></td>
                <td style={{ fontWeight: 500, fontSize: 13 }}>{l.name}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.address}, {l.city}</td>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{l.state}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                <td style={{ textAlign: 'center' }}>{l.lat ? <span style={{ color: 'var(--green)' }}>✓</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
