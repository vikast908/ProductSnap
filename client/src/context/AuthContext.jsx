import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const API_BASE = ''

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Get token from localStorage
  const getToken = useCallback(() => {
    return localStorage.getItem('auth_token')
  }, [])

  // Save token to localStorage
  const saveToken = useCallback((token) => {
    if (token) {
      localStorage.setItem('auth_token', token)
    } else {
      localStorage.removeItem('auth_token')
    }
  }, [])

  // Fetch current user
  const fetchUser = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setUser(null)
      setLoading(false)
      return null
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        return userData
      } else if (response.status === 401) {
        // Token expired or invalid
        saveToken(null)
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
  }, [getToken, saveToken])

  // Check URL for token (after OAuth redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')

    if (token) {
      saveToken(token)
      // Remove token from URL
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    fetchUser()
  }, [fetchUser, saveToken])

  // Login with Google
  const loginWithGoogle = useCallback(() => {
    window.location.href = `${API_BASE}/api/auth/google`
  }, [])

  // Logout
  const logout = useCallback(async () => {
    const token = getToken()
    if (token) {
      try {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
      } catch (err) {
        console.error('Logout error:', err)
      }
    }

    saveToken(null)
    setUser(null)
  }, [getToken, saveToken])

  // Update user settings
  const updateSettings = useCallback(async (preferences) => {
    const token = getToken()
    if (!token) return { success: false, error: 'Not authenticated' }

    try {
      const response = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
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
      } else {
        const error = await response.json()
        return { success: false, error: error.error }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [getToken])

  // Save API keys
  const saveApiKeys = useCallback(async (apiKeys) => {
    const token = getToken()
    if (!token) return { success: false, error: 'Not authenticated' }

    try {
      const response = await fetch(`${API_BASE}/api/settings/api-keys`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
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
      } else {
        const error = await response.json()
        return { success: false, error: error.error }
      }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }, [getToken])

  // Check if user is admin
  const isAdmin = user?.role === 'admin'

  // Make authenticated request helper
  const authFetch = useCallback(async (url, options = {}) => {
    const token = getToken()
    if (!token) {
      throw new Error('Not authenticated')
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${token}`
      }
    })

    if (response.status === 401) {
      saveToken(null)
      setUser(null)
      throw new Error('Session expired')
    }

    return response
  }, [getToken, saveToken])

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
    authFetch,
    getToken
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
