import '../styles/globals.css'
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState, createContext, useContext } from 'react'
import { useRouter } from 'next/router'

const PUBLIC_PAGES = ['/login']

export const AuthContext = createContext({ role: null, user: null })
export function useAuth() { return useContext(AuthContext) }

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
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        if (!PUBLIC_PAGES.includes(router.pathname)) router.replace('/login')
        else setChecked(true)
        return
      }
      const u = session.user
      setUser(u)
      setRole(u.user_metadata?.role || 'viewer')
      setChecked(true)
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null); setRole(null)
        router.replace('/login')
      }
      if (event === 'SIGNED_IN' && session) {
        const u = session.user
        setUser(u)
        setRole(u.user_metadata?.role || 'viewer')
        setChecked(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [router.pathname])

  if (!checked && !PUBLIC_PAGES.includes(router.pathname)) {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'DM Sans, sans-serif', color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>
        Checking access…
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{ role, user, isAdmin: role === 'admin', isViewer: role === 'viewer' }}>
      <Component {...pageProps} />
    </AuthContext.Provider>
  )
}
