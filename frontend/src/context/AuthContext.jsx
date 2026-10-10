import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, getToken, setToken } from '../lib/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!getToken())

  // Restore the session from a saved token
  useEffect(() => {
    if (!getToken()) return
    api('/auth/me')
      .then(({ user }) => setUser(user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false))
  }, [])

  const authenticate = useCallback(async (mode, fields) => {
    const { token, user } = await api(`/auth/${mode}`, { method: 'POST', body: fields })
    setToken(token)
    setUser(user)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, setUser, loading, authenticate, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
