import '../styles/globals.css'
import { createClient } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'

const PUBLIC_PAGES = ['/login']

export default function App({ Component, pageProps }) {
  const router = useRouter()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session && !PUBLIC_PAGES.includes(router.pathname)) {
        router.replace('/login')
      } else {
        setChecked(true)
      }
    }

    checkAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !PUBLIC_PAGES.includes(router.pathname)) {
        router.replace('/login')
      }
      if (event === 'SIGNED_IN') {
        setChecked(true)
      }
    })

    return () => subscription.unsubscribe()
  }, [router.pathname])

  if (!checked && !PUBLIC_PAGES.includes(router.pathname)) {
    return (
      <div style={{
        minHeight: '100vh', background: 'var(--navy)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'DM Sans, sans-serif', color: 'rgba(255,255,255,0.4)', fontSize: 14
      }}>
        Checking access…
      </div>
    )
  }

  return <Component {...pageProps} />
}
