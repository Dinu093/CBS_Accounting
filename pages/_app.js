import '../styles/globals.css'
import { AuthProvider } from '../lib/auth'
import { useRouter } from 'next/router'
import { useAuth } from '../lib/auth'
import { useEffect } from 'react'

function AuthGate({ Component, pageProps }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user && router.pathname !== '/login') {
      router.replace('/login')
    }
  }, [user, loading, router.pathname])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: 'Arial', color: '#888' }}>
      Loading...
    </div>
  )

  if (!user && router.pathname !== '/login') return null

  return <Component {...pageProps} />
}

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AuthGate Component={Component} pageProps={pageProps} />
    </AuthProvider>
  )
}
