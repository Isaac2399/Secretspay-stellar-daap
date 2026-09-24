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
  googleAuthUser,
  loginUser,
  logoutUser,
  registerUser,
  updateStoredPublicKey,
} from '@/lib/auth/api'

type AuthContextValue = {
  user: AppUser | null
  loading: boolean
  login: (input: { email: string; password: string }) => Promise<void>
  register: (input: {
    email: string
    password: string
    role: AppUser['role']
  }) => Promise<void>
  loginWithGoogle: (accessToken: string) => Promise<void>
  registerWithGoogle: (input: {
    accessToken: string
    role: AppUser['role']
  }) => Promise<void>
  logout: () => Promise<void>
  syncPublicKey: (publicKey: string) => Promise<void>
  setUser: (user: AppUser | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void fetchSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (input: { email: string; password: string }) => {
    setUser(await loginUser(input))
  }, [])

  const register = useCallback(
    async (input: {
      email: string
      password: string
      role: AppUser['role']
    }) => {
      setUser(await registerUser(input))
    },
    [],
  )

  const loginWithGoogle = useCallback(async (accessToken: string) => {
    setUser(await googleAuthUser({ accessToken, mode: 'login' }))
  }, [])

  const registerWithGoogle = useCallback(
    async (input: { accessToken: string; role: AppUser['role'] }) => {
      setUser(
        await googleAuthUser({
          accessToken: input.accessToken,
          mode: 'register',
          role: input.role,
        }),
      )
    },
    [],
  )

  const logout = useCallback(async () => {
    await logoutUser()
    setUser(null)
  }, [])

  const syncPublicKey = useCallback(async (publicKey: string) => {
    setUser(await updateStoredPublicKey(publicKey))
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      login,
      register,
      loginWithGoogle,
      registerWithGoogle,
      logout,
      syncPublicKey,
      setUser,
    }),
    [
      user,
      loading,
      login,
      register,
      loginWithGoogle,
      registerWithGoogle,
      logout,
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
