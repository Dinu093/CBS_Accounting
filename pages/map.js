import dynamic from 'next/dynamic'
import Layout from '../components/Layout'

export async function getServerSideProps() { return { props: {} } }

// Load map component client-side only — Leaflet doesn't work with SSR
const MapComponent = dynamic(() => import('../components/MapComponent'), { 
  ssr: false,
  loading: () => <div style={{ height: 520, background: '#f5f5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: 13 }}>Loading map…</div>
})

export default function MapPage() {
  return (
    <Layout>
      <MapComponent />
    </Layout>
  )
}
