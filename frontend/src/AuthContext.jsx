import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest } from './api'
import { AuthContext } from './auth'

const TAB_SESSION_KEY = 'danna-tab-session'

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('checking')
  const [error, setError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)

  const refreshUser = useCallback(async () => {
    setStatus('checking')
    setError('')

    try {
      const payload = await apiRequest('/api/user')
      setUser(payload.user)
      setStatus('authenticated')
      setSessionExpired(false)
    } catch (requestError) {
      setUser(null)
      if (requestError.status === 401) {
        setStatus('unauthenticated')
        setError('')
        setSessionExpired(false)
      } else {
        setStatus('error')
        setError(
          requestError instanceof TypeError
            ? 'Could not connect to the DHANA authentication service. Check the Laravel server and API URL.'
            : requestError.message
        )
      }
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function loadCurrentUser() {
      try {
        const payload = await apiRequest('/api/user', { signal: controller.signal })

        // تاب جديد (مفيش علامة) + جلسة قديمة في الكوكي: نلغيها
        if (!sessionStorage.getItem(TAB_SESSION_KEY)) {
          try {
            await apiRequest('/api/logout', { method: 'POST' })
          } catch {
            // لو فشل، هنعرض صفحة الدخول برضه
          }
          if (active) {
            setUser(null)
            setStatus('unauthenticated')
            setError('')
            setSessionExpired(false)
          }
          return
        }

        if (active) {
          setUser(payload.user)
          setStatus('authenticated')
          setError('')
        }
      } catch (requestError) {
        if (!active || requestError.name === 'AbortError') {
          return
        }

        setUser(null)
        if (requestError.status === 401) {
          setStatus('unauthenticated')
          setSessionExpired(false)
        } else {
          setStatus('error')
          setError(
            requestError instanceof TypeError
              ? 'Could not connect to the DHANA authentication service. Check the Laravel server and API URL.'
              : requestError.message
          )
        }
      }
    }

    function handleUnauthorized() {
      setUser(null)
      setStatus('unauthenticated')
      setSessionExpired(true)
    }

    window.addEventListener('dhana:unauthorized', handleUnauthorized)
    loadCurrentUser()

    return () => {
      active = false
      controller.abort()
      window.removeEventListener('dhana:unauthorized', handleUnauthorized)
    }
  }, [])

  const login = useCallback(async (credentials) => {
    const payload = await apiRequest('/api/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    })

    sessionStorage.setItem(TAB_SESSION_KEY, '1')

    setUser(payload.user)
    setStatus('authenticated')
    setError('')
    setSessionExpired(false)

    return payload.user
  }, [])

  const logout = useCallback(async () => {
    await apiRequest('/api/logout', { method: 'POST' })
    sessionStorage.removeItem(TAB_SESSION_KEY)
    setUser(null)
    setStatus('unauthenticated')
    setError('')
    setSessionExpired(false)
  }, [])

  const value = useMemo(
    () => ({
      user,
      status,
      error,
      sessionExpired,
      login,
      logout,
      refreshUser,
    }),
    [user, status, error, sessionExpired, login, logout, refreshUser]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}