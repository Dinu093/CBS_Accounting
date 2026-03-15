import { useAuth } from '../pages/_app'

// Wraps any button/action that requires admin role
// Shows nothing for viewers by default, or a disabled tooltip
export default function ProtectedAction({ children, fallback = null }) {
  const { isAdmin, role } = useAuth()
  if (isAdmin) return children
  if (fallback) return fallback
  return null
}

// Hook version for conditional rendering
export function useCanEdit() {
  const { isAdmin } = useAuth()
  return isAdmin
}
