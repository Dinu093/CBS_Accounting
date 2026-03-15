import '../styles/globals.css'
import { AuthContext } from '../lib/auth'

export default function App({ Component, pageProps }) {
  return (
    <AuthContext.Provider value={{ role: 'admin', user: { email: 'dinu@cliquebeauty.com' }, isAdmin: true, isViewer: false }}>
      <Component {...pageProps} />
    </AuthContext.Provider>
  )
}
