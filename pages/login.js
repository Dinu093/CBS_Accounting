import { useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useRouter } from 'next/router'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const login = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      )
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      router.push('/')
    } catch (err) {
      setError('Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight:'100vh', background:'#111827', display:'flex', alignItems:'center', justifyContent:'center', padding:24, fontFamily:'-apple-system,system-ui,sans-serif' }}>
      <div style={{ width:'100%', maxWidth:380 }}>
        <div style={{ textAlign:'center', marginBottom:32 }}>
          <div style={{ fontSize:18, fontWeight:600, color:'white', letterSpacing:'0.04em' }}>CLIQUE BEAUTY</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:6, textTransform:'uppercase', letterSpacing:'0.1em' }}>Finance & Operations</div>
        </div>
        <div style={{ background:'white', borderRadius:12, padding:32, boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
          <h2 style={{ fontSize:18, fontWeight:600, marginBottom:4, color:'#111' }}>Sign in</h2>
          <p style={{ fontSize:13, color:'#888', marginBottom:24 }}>Authorized access only</p>
          {error && (
            <div style={{ background:'#fdf0ee', color:'#c0392b', padding:'10px 14px', borderRadius:8, fontSize:13, marginBottom:16 }}>
              {error}
            </div>
          )}
          <form onSubmit={login}>
            <div style={{ marginBottom:16 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em', color:'#888', marginBottom:6 }}>Email</label>
              <input type="email" required autoFocus value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com"
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #e2e2e2', borderRadius:8, fontSize:14, outline:'none', boxSizing:'border-box' }} />
            </div>
            <div style={{ marginBottom:24 }}>
              <label style={{ display:'block', fontSize:11, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.06em', color:'#888', marginBottom:6 }}>Password</label>
              <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                style={{ width:'100%', padding:'9px 12px', border:'1px solid #e2e2e2', borderRadius:8, fontSize:14, outline:'none', boxSizing:'border-box' }} />
            </div>
            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:11, background:'#111', color:'white', border:'none', borderRadius:8, fontSize:14, fontWeight:600, cursor:loading?'not-allowed':'pointer', opacity:loading?0.7:1 }}>
              {loading ? 'Signing in…' : 'Sign in →'}
            </button>
          </form>
        </div>
        <div style={{ textAlign:'center', marginTop:20, fontSize:11, color:'rgba(255,255,255,0.2)' }}>
          Clique Beauty Skincare LLC · Confidential
        </div>
      </div>
    </div>
  )
}
