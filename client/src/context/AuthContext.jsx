import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const API_BASE = ''

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // SECURITY: Token is now stored in httpOnly cookie (not accessible from JS)
  // All requests use credentials: 'include' to send cookies automatically

  // Fetch current user (uses httpOnly cookie automatically)
  const fetchUser = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: 'include' // Send httpOnly cookies
      })

      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        return userData
      } else if (response.status === 401) {
        // Not authenticated or token expired
        setUser(null)
        return null
      } else {
        throw new Error('Failed to fetch user')
      }
    } catch (err) {
      console.error('Error fetching user:', err)
      setError(err.message)
      setUser(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // Check URL for auth success (after OAuth redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const authSuccess = params.get('auth')

    if (authSuccess === 'success') {
      // Remove auth param from URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    // Also handle legacy token param for backwards compatibility during migration
    const legacyToken = params.get('token')
    if (legacyToken) {
      // Clear legacy token from URL - the new httpOnly cookie system is now in use
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    fetchUser()
  }, [fetchUser])

  // Login with Google
  const loginWithGoogle = useCallback(() => {
    window.location.href = `${API_BASE}/api/auth/google`
  }, [])

  // Logout (clears httpOnly cookie on server)
  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include' // Send httpOnly cookies
      })
    } catch (err) {
      console.error('Logout error:', err)
    }

    setUser(null)
  }, [])

  // Update user settings
  const updateSettings = useCallback(async (preferences) => {
    try {
      const response = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ preferences })
      })

      if (response.ok) {
        const data = await response.json()
        // Update local user state
        setUser(prev => ({
          ...prev,
          settings: {
            ...prev?.settings,
            preferences: data.preferences
          }
        }))
        return { success: true, data }
      } else if (response.status === 401) {
        setUser(null)
        return { success: false, error: 'Session expired' }
      } else {
        const error = await response.json()
        return { success: false, error: error.error }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Save API keys
  const saveApiKeys = useCallback(async (apiKeys) => {
    try {
      const response = await fetch(`${API_BASE}/api/settings/api-keys`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ apiKeys })
      })

      if (response.ok) {
        const data = await response.json()
        // Update local user state with hasApiKeys and keyPreviews
        setUser(prev => ({
          ...prev,
          settings: {
            ...prev?.settings,
            hasApiKeys: data.hasApiKeys,
            keyPreviews: data.keyPreviews
          }
        }))
        return { success: true, data }
      } else if (response.status === 401) {
        setUser(null)
        return { success: false, error: 'Session expired' }
      } else {
        const error = await response.json()
        return { success: false, error: error.error }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [])

  // Check if user is admin
  const isAdmin = user?.role === 'admin'

  // Make authenticated request helper (uses httpOnly cookie)
  const authFetch = useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      credentials: 'include', // Send httpOnly cookies
      headers: {
        ...options.headers
      }
    })

    if (response.status === 401) {
      setUser(null)
      throw new Error('Session expired')
    }

    return response
  }, [])

  const value = {
    user,
    loading,
    error,
    isAuthenticated: !!user,
    isAdmin,
    loginWithGoogle,
    logout,
    fetchUser,
    updateSettings,
    saveApiKeys,
    authFetch
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export default AuthContext
