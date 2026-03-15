import dynamic from 'next/dynamic'
import Layout from '../components/Layout'

export async function getServerSideProps() { return { props: {} } }

const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false,
  loading: () => <div style={{height:500,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--text-3)',fontSize:13}}>Loading map…</div>
})

export default function Map() {
  return (
    <Layout>
      <MapComponent />
    </Layout>
  )
}
