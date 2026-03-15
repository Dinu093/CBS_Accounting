import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import { usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

export default function MapPage() {
  const mapRef = useRef(null)
  const mapInstance = useRef(null)
  const markersLayer = useRef(null)
  const [orders, setOrders] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [geocodedCount, setGeocodedCount] = useState(0)
  const [filter, setFilter] = useState('all')
  const [leafletReady, setLeafletReady] = useState(false)

  // Load data
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

  // Load Leaflet CSS + JS
  useEffect(() => {
    if (typeof window === 'undefined') return

    // Add CSS
    if (!document.getElementById('leaflet-css')) {
      const link = document.createElement('link')
      link.id = 'leaflet-css'
      link.rel = 'stylesheet'
      link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      document.head.appendChild(link)
    }

    // Add JS
    if (window.L) { setLeafletReady(true); return }
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setLeafletReady(true)
    script.onerror = () => console.error('Failed to load Leaflet')
    document.head.appendChild(script)
  }, [])

  // Init map once Leaflet is ready and div is mounted
  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapInstance.current) return
    const L = window.L

    // Fix default marker icons
    delete L.Icon.Default.prototype._getIconUrl
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    })

    const map = L.map(mapRef.current, {
      center: [39.5, -98.35],
      zoom: 4,
      zoomControl: true,
      scrollWheelZoom: true,
    })

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 19,
      subdomains: 'abcd',
    }).addTo(map)

    mapInstance.current = map
    markersLayer.current = L.layerGroup().addTo(map)
  }, [leafletReady])

  // Plot markers when data + map ready
  useEffect(() => {
    if (!mapInstance.current || !markersLayer.current || loading) return
    const L = window.L
    if (!L) return

    markersLayer.current.clearLayers()
    const bounds = []

    // E-commerce customers
    if (filter === 'all' || filter === 'ecom') {
      orders
        .filter(o => o.channel === 'E-commerce' && o.lat && o.lng)
        .forEach(o => {
          const circle = L.circleMarker([parseFloat(o.lat), parseFloat(o.lng)], {
            radius: 9,
            fillColor: '#6A1B9A',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.85,
          })
          circle.bindPopup(`
            <div style="font-family:sans-serif;min-width:180px;padding:4px">
              <div style="font-weight:700;font-size:14px;margin-bottom:4px">${o.buyer_name || 'Customer'}</div>
              <div style="font-size:12px;color:#666">${o.buyer_address || ''}</div>
              <div style="font-size:12px;color:#666">${o.buyer_city || ''} ${o.buyer_state || ''} ${o.buyer_zip || ''}</div>
              <div style="font-size:12px;color:#666">${o.buyer_email || ''}</div>
              <div style="margin-top:6px;font-weight:700;color:#2A6B4A;font-size:13px">${usd(o.total_amount)}</div>
              <div style="font-size:11px;color:#999">${o.date} · E-commerce</div>
            </div>
          `)
          circle.addTo(markersLayer.current)
          bounds.push([parseFloat(o.lat), parseFloat(o.lng)])
        })
    }

    // Wholesale locations
    if (filter === 'all' || filter === 'wholesale') {
      locations
        .filter(l => l.lat && l.lng)
        .forEach(loc => {
          const locOrders = orders.filter(o => o.location_id === loc.id)
          const total = locOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
          const size = Math.max(10, Math.min(26, 10 + (total / 300)))

          const circle = L.circleMarker([parseFloat(loc.lat), parseFloat(loc.lng)], {
            radius: size,
            fillColor: '#2A6B4A',
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.85,
          })
          circle.bindPopup(`
            <div style="font-family:sans-serif;min-width:200px;padding:4px">
              <div style="font-weight:700;font-size:14px;margin-bottom:4px">${loc.name}</div>
              ${loc.contact_name ? `<div style="font-size:12px;color:#666">${loc.contact_name}</div>` : ''}
              <div style="font-size:12px;color:#666">${loc.address || ''}</div>
              <div style="font-size:12px;color:#666">${loc.city || ''} ${loc.state || ''} ${loc.zip || ''}</div>
              ${total > 0 ? `<div style="margin-top:6px;font-weight:700;color:#2A6B4A;font-size:13px">${usd(total)}</div>` : ''}
              <div style="font-size:11px;color:#999">${locOrders.length} order${locOrders.length !== 1 ? 's' : ''} · Wholesale</div>
            </div>
          `)
          circle.addTo(markersLayer.current)
          bounds.push([parseFloat(loc.lat), parseFloat(loc.lng)])
        })
    }

    // Fit bounds if we have points
    if (bounds.length > 0) {
      try {
        mapInstance.current.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 10 })
      } catch(e) {}
    }
  }, [orders, locations, filter, loading, leafletReady])

  const ecomWithCoords = orders.filter(o => o.channel === 'E-commerce' && o.lat && o.lng).length
  const locsWithCoords = locations.filter(l => l.lat && l.lng).length
  const ecomNeedGeocode = orders.filter(o => o.channel === 'E-commerce' && !o.lat && o.buyer_address && o.buyer_city).length
  const locsNeedGeocode = locations.filter(l => !l.lat && l.address && l.city).length
  const needsGeocode = ecomNeedGeocode + locsNeedGeocode

  const totalEcom = orders.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const totalWS = orders.filter(o => o.channel !== 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const stateSet = new Set(orders.filter(o => o.buyer_state).map(o => o.buyer_state))

  const geocodeAll = async () => {
    setGeocoding(true)
    let count = 0

    const ecomToGeocode = orders.filter(o => o.channel === 'E-commerce' && !o.lat && o.buyer_address && o.buyer_city)
    for (const order of ecomToGeocode) {
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

    const locsToGeocode = locations.filter(l => !l.lat && l.address && l.city)
    for (const loc of locsToGeocode) {
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
    <Layout>
      <div className="page-header">
        <div>
          <h1>Customer Map</h1>
          <p>{ecomWithCoords} e-com · {locsWithCoords} wholesale · {stateSet.size} states</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {geocoding && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>⏳ Geocoding {geocodedCount}…</span>}
          {needsGeocode > 0 && !geocoding && (
            <button className="primary" onClick={geocodeAll}>
              📍 Geocode {needsGeocode} address{needsGeocode !== 1 ? 'es' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Metrics */}
      <div className="metrics-grid" style={{ marginBottom: '1.25rem' }}>
        {[
          ['E-commerce revenue', usd(totalEcom), '#6A1B9A'],
          ['Wholesale revenue', usd(totalWS), 'var(--green)'],
          ['Total revenue', usd(totalEcom + totalWS), 'var(--navy)'],
          ['States reached', stateSet.size, 'var(--blue-pearl)'],
        ].map(([l, v, c]) => (
          <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', alignItems: 'center' }}>
        {[['all', 'All'], ['ecom', '🟣 E-commerce'], ['wholesale', '🟢 Wholesale']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 20, background: filter === v ? 'var(--navy)' : 'var(--white)', color: filter === v ? 'white' : 'var(--text-muted)', borderColor: filter === v ? 'var(--navy)' : 'var(--border)' }}>{l}</button>
        ))}
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
          Click on a dot for details
        </div>
      </div>

      {/* Map */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
        {needsGeocode > 0 && (
          <div style={{ padding: '10px 16px', background: 'var(--amber-light)', borderBottom: '1px solid rgba(139,94,26,0.15)', fontSize: 13, color: 'var(--amber)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>⚠ {needsGeocode} address{needsGeocode !== 1 ? 'es' : ''} not yet on map — click Geocode to place them</span>
            <button onClick={geocodeAll} disabled={geocoding} style={{ fontSize: 12, padding: '4px 12px', background: 'var(--amber)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              {geocoding ? 'Geocoding…' : 'Geocode now'}
            </button>
          </div>
        )}
        {loading ? (
          <div className="loading">Loading…</div>
        ) : !leafletReady ? (
          <div className="loading">Loading map…</div>
        ) : (
          <div ref={mapRef} style={{ height: 520, width: '100%', background: '#f5f5f0' }} />
        )}
      </div>

      {/* Address list */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          All addresses
        </div>
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
    </Layout>
  )
}
