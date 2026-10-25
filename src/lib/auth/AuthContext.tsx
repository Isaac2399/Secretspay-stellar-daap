import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { AppUser } from '@/types/user'
import {
  fetchSession,
  loginUser,
  logoutUser,
  registerUser,
  startGuestDemo as startGuestDemoSession,
  updateStoredPublicKey,
} from '@/lib/auth/api'
import { clearGuestDemo, syncGuestFlag, writeGuestDemo } from '@/lib/auth/guestDemo'

type AuthContextValue = {
  user: AppUser | null
  loading: boolean
  isGuestDemo: boolean
  login: (input: { email: string; password: string }) => Promise<void>
  register: (input: {
    email: string
    password: string
    role: AppUser['role']
  }) => Promise<void>
  logout: () => Promise<void>
  startGuestDemo: () => Promise<void>
  resetGuestDemo: () => Promise<void>
  syncPublicKey: (publicKey: string) => Promise<void>
  setUser: (user: AppUser | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [isGuestDemo, setIsGuestDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void fetchSession()
      .then((next) => {
        if (cancelled) {
          return
        }
        setUser(next)
        setIsGuestDemo(syncGuestFlag(next))
      })
      .catch(() => {
        if (cancelled) {
          return
        }
        clearGuestDemo()
        setUser(null)
        setIsGuestDemo(false)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (input: { email: string; password: string }) => {
    const next = await loginUser(input)
    clearGuestDemo()
    setIsGuestDemo(false)
    setUser(next)
  }, [])

  const register = useCallback(
    async (input: {
      email: string
      password: string
      role: AppUser['role']
    }) => {
      const next = await registerUser(input)
      clearGuestDemo()
      setIsGuestDemo(false)
      setUser(next)
    },
    [],
  )

  const logout = useCallback(async () => {
    await logoutUser()
    clearGuestDemo()
    setIsGuestDemo(false)
    setUser(null)
  }, [])

  const startGuestDemo = useCallback(async () => {
    const next = await startGuestDemoSession()
    writeGuestDemo(next.publicKey)
    setIsGuestDemo(true)
    setUser({ ...next, isGuestDemo: true })
  }, [])

  const resetGuestDemo = useCallback(async () => {
    await logout()
  }, [logout])

  const syncPublicKey = useCallback(async (publicKey: string) => {
    setUser(await updateStoredPublicKey(publicKey))
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      isGuestDemo,
      login,
      register,
      logout,
      startGuestDemo,
      resetGuestDemo,
      syncPublicKey,
      setUser,
    }),
    [
      user,
      loading,
      isGuestDemo,
      login,
      register,
      logout,
      startGuestDemo,
      resetGuestDemo,
      syncPublicKey,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
