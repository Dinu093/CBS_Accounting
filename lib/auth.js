import { createContext, useContext } from 'react'

export const AuthContext = createContext({ role: null, user: null, isAdmin: false, isViewer: false })
export function useAuth() { return useContext(AuthContext) }
