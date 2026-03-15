import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import { usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

export default function MapPage() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const [orders, setOrders] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [geocoding, setGeocoding] = useState(false)
  const [geocodedCount, setGeocodedCount] = useState(0)
  const [mapReady, setMapReady] = useState(false)
  const [filter, setFilter] = useState('all') // all, ecom, wholesale, gifted
  const [stats, setStats] = useState({ total: 0, ecom: 0, wholesale: 0, states: new Set() })

  useEffect(() => {
    Promise.all([
      fetch('/api/sales').then(r => r.json()),
      fetch('/api/locations').then(r => r.json()),
    ]).then(([o, l]) => {
      setOrders(Array.isArray(o) ? o : [])
      setLocations(Array.isArray(l) ? l : [])
      setLoading(false)
    })
  }, [])

  // Load Leaflet dynamically
  useEffect(() => {
    if (typeof window === 'undefined') return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setMapReady(true)
    document.head.appendChild(script)
  }, [])

  // Init map
  useEffect(() => {
    if (!mapReady || !mapRef.current || mapInstanceRef.current) return
    const L = window.L
    const map = L.map(mapRef.current, { zoomControl: true, scrollWheelZoom: true }).setView([39.5, -98.35], 4)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap © CARTO',
      maxZoom: 19
    }).addTo(map)
    mapInstanceRef.current = map
  }, [mapReady])

  // Plot points when data + map ready
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current || loading) return
    const L = window.L
    const map = mapInstanceRef.current

    // Clear existing markers
    map.eachLayer(layer => { if (layer instanceof L.Marker || layer instanceof L.CircleMarker) map.removeLayer(layer) })

    const points = []

    // E-commerce orders with lat/lng
    if (filter === 'all' || filter === 'ecom') {
      orders.filter(o => o.channel === 'E-commerce' && o.lat && o.lng).forEach(o => {
        const marker = L.circleMarker([o.lat, o.lng], {
          radius: 8, fillColor: '#6A1B9A', color: '#fff', weight: 1.5, opacity: 1, fillOpacity: 0.8
        }).addTo(map)
        marker.bindPopup(`
          <div style="font-family: DM Sans, sans-serif; min-width: 180px">
            <div style="font-weight: 600; margin-bottom: 4px">${o.buyer_name || 'Customer'}</div>
            <div style="font-size: 12px; color: #666">${o.buyer_address || ''}</div>
            <div style="font-size: 12px; color: #666">${o.buyer_city || ''} ${o.buyer_state || ''} ${o.buyer_zip || ''}</div>
            <div style="margin-top: 6px; font-weight: 600; color: #2A6B4A">${usd(o.total_amount)}</div>
            <div style="font-size: 11px; color: #999">${o.date} · ${o.channel}</div>
          </div>
        `)
        points.push([o.lat, o.lng])
      })
    }

    // Wholesale locations
    if (filter === 'all' || filter === 'wholesale') {
      locations.filter(l => l.lat && l.lng).forEach(loc => {
        const locOrders = orders.filter(o => o.location_id === loc.id)
        const totalCA = locOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
        const size = Math.max(10, Math.min(24, 10 + (totalCA / 500)))
        const marker = L.circleMarker([loc.lat, loc.lng], {
          radius: size, fillColor: '#2A6B4A', color: '#fff', weight: 1.5, opacity: 1, fillOpacity: 0.85
        }).addTo(map)
        marker.bindPopup(`
          <div style="font-family: DM Sans, sans-serif; min-width: 200px">
            <div style="font-weight: 600; margin-bottom: 2px">${loc.name}</div>
            ${loc.contact_name ? '<div style="font-size: 12px; color: #666">' + loc.contact_name + '</div>' : ''}
            <div style="font-size: 12px; color: #666">${loc.address || ''}</div>
            <div style="font-size: 12px; color: #666">${loc.city || ''} ${loc.state || ''} ${loc.zip || ''}</div>
            ${totalCA > 0 ? '<div style="margin-top: 6px; font-weight: 600; color: #2A6B4A">' + usd(totalCA) + ' total</div>' : ''}
            <div style="font-size: 11px; color: #999">${locOrders.length} order${locOrders.length !== 1 ? 's' : ''} · Wholesale</div>
          </div>
        `)
        points.push([loc.lat, loc.lng])
      })
    }

    // Stats
    const ecomTotal = orders.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
    const wsTotal = orders.filter(o => o.channel !== 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
    const stateSet = new Set(orders.filter(o => o.buyer_state).map(o => o.buyer_state))
    setStats({ total: ecomTotal + wsTotal, ecom: ecomTotal, wholesale: wsTotal, states: stateSet })

    if (points.length > 0) {
      try { map.fitBounds(L.latLngBounds(points), { padding: [40, 40] }) } catch(e) {}
    }
  }, [mapReady, orders, locations, loading, filter])

  // Geocode all orders/locations that don't have coordinates
  const geocodeAll = async () => {
    setGeocoding(true)
    let count = 0

    // Geocode e-commerce orders
    const ordersToGeocode = orders.filter(o => o.channel === 'E-commerce' && !o.lat && o.buyer_address && o.buyer_city)
    for (const order of ordersToGeocode) {
      try {
        const resp = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: order.buyer_address, city: order.buyer_city, state: order.buyer_state, zip: order.buyer_zip }) })
        const { lat, lng } = await resp.json()
        if (lat && lng) {
          await fetch('/api/sales', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: order.id, lat, lng }) })
          setOrders(prev => prev.map(o => o.id === order.id ? { ...o, lat, lng } : o))
          count++; setGeocodedCount(count)
        }
        await new Promise(r => setTimeout(r, 300)) // Rate limit
      } catch(e) {}
    }

    // Geocode locations
    const locsToGeocode = locations.filter(l => !l.lat && l.address && l.city)
    for (const loc of locsToGeocode) {
      try {
        const resp = await fetch('/api/geocode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: loc.address, city: loc.city, state: loc.state, zip: loc.zip }) })
        const { lat, lng } = await resp.json()
        if (lat && lng) {
          await fetch('/api/locations', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: loc.id, lat, lng }) })
          setLocations(prev => prev.map(l => l.id === loc.id ? { ...l, lat, lng } : l))
          count++; setGeocodedCount(count)
        }
        await new Promise(r => setTimeout(r, 300))
      } catch(e) {}
    }

    setGeocoding(false)
  }

  const needsGeocode = orders.filter(o => o.channel === 'E-commerce' && !o.lat && o.buyer_address).length + locations.filter(l => !l.lat && l.address).length

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Customer Map</h1>
          <p>Interactive map of all orders & distributor locations</p>
        </div>
        {needsGeocode > 0 && !geocoding && (
          <button className="primary" onClick={geocodeAll}>
            📍 Geocode {needsGeocode} address{needsGeocode !== 1 ? 'es' : ''}
          </button>
        )}
        {geocoding && (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            ⏳ Geocoding… {geocodedCount} done
          </div>
        )}
      </div>

      {/* Metrics */}
      <div className="metrics-grid" style={{ marginBottom: '1.25rem' }}>
        {[
          ['E-commerce', usd(stats.ecom), '#6A1B9A'],
          ['Wholesale', usd(stats.wholesale), 'var(--green)'],
          ['Total revenue', usd(stats.total), 'var(--navy)'],
          ['States reached', stats.states.size, 'var(--blue-pearl)'],
        ].map(([l, v, c]) => (
          <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
        {[['all', 'All orders'], ['ecom', '🟣 E-commerce'], ['wholesale', '🟢 Wholesale']].map(([v, l]) => (
          <button key={v} onClick={() => setFilter(v)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 20, background: filter === v ? 'var(--navy)' : 'var(--white)', color: filter === v ? 'white' : 'var(--text-muted)', borderColor: filter === v ? 'var(--navy)' : 'var(--border)' }}>{l}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
          <span>🟣 E-commerce customer</span>
          <span>🟢 Wholesale location (size = revenue)</span>
        </div>
      </div>

      {/* Map */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading">Loading…</div>
        ) : (
          <>
            {needsGeocode > 0 && (
              <div style={{ padding: '10px 16px', background: 'var(--amber-light)', borderBottom: '1px solid rgba(139,94,26,0.15)', fontSize: 13, color: 'var(--amber)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>⚠ {needsGeocode} address{needsGeocode !== 1 ? 'es' : ''} need geocoding to appear on the map</span>
                <button onClick={geocodeAll} style={{ fontSize: 12, padding: '4px 12px', background: 'var(--amber)', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Geocode now</button>
              </div>
            )}
            <div ref={mapRef} style={{ height: 560, width: '100%' }} />
          </>
        )}
      </div>

      {/* Address list */}
      <div className="card" style={{ marginTop: '1.25rem', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          All addresses
        </div>
        <table>
          <thead><tr><th>Type</th><th>Name</th><th>Address</th><th>State</th><th style={{ textAlign: 'right' }}>Revenue</th><th>Mapped</th></tr></thead>
          <tbody>
            {orders.filter(o => o.channel === 'E-commerce' && o.buyer_address).map(o => (
              <tr key={o.id}>
                <td><span className="pill" style={{ background: '#E8EAF6', color: '#283593', fontSize: 11 }}>E-com</span></td>
                <td style={{ fontWeight: 500, fontSize: 13 }}>{o.buyer_name || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.buyer_address}, {o.buyer_city}</td>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{o.buyer_state}</td>
                <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{usd(o.total_amount)}</td>
                <td>{o.lat ? <span style={{ color: 'var(--green)' }}>✓</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
              </tr>
            ))}
            {locations.filter(l => l.address).map(l => (
              <tr key={l.id}>
                <td><span className="pill" style={{ background: 'var(--green-light)', color: 'var(--green)', fontSize: 11 }}>Wholesale</span></td>
                <td style={{ fontWeight: 500, fontSize: 13 }}>{l.name}</td>
                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.address}, {l.city}</td>
                <td style={{ fontSize: 12, fontWeight: 600 }}>{l.state}</td>
                <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>—</td>
                <td>{l.lat ? <span style={{ color: 'var(--green)' }}>✓</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
