import { createContext, useContext } from 'react'

export const AuthContext = createContext({ role: 'admin', user: null, isAdmin: true, isViewer: false })
export function useAuth() { return useContext(AuthContext) }
