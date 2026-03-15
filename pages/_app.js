import '../styles/globals.css'
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { AuthContext } from '../lib/auth'

const PUBLIC_PAGES = ['/login']

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)
  const [role, setRole] = useState(null)
  const [user, setUser] = useState(null)

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setChecked(true)
          if (!PUBLIC_PAGES.includes(router.pathname)) {
            router.replace('/login')
          }
          return
        }
        const u = session.user
        setUser(u)
        setRole(u.user_metadata?.role || 'viewer')
        setChecked(true)
      } catch (err) {
        console.error('Auth error:', err)
        setChecked(true)
        router.replace('/login')
      }
    }

    init()
  }, []) // Run once on mount only

  if (!checked) {
    return (
      <div style={{ minHeight:'100vh', background:'#111827', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'system-ui', color:'rgba(255,255,255,0.4)', fontSize:14 }}>
        Loading…
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ role, user, isAdmin: role==='admin', isViewer: role==='viewer' }}>
      <Component {...pageProps} />
    </AuthContext.Provider>
  )
}
