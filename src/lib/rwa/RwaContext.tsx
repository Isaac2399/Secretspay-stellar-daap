import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  claimRwaDividends,
  fetchRwaListings,
  fetchRwaPortfolio,
  fetchRwaRequests,
  investInRwa,
  submitTokenization,
  updateRwaRequest,
} from '@/lib/rwa/api'
import { useAuth } from '@/lib/auth/AuthContext'
import type {
  MarketplaceListing,
  RwaHolding,
  TokenizationRequest,
  TokenizationWizardPayload,
} from '@/types/rwa'

type RwaContextValue = {
  listings: MarketplaceListing[]
  requests: TokenizationRequest[]
  holdings: RwaHolding[]
  loading: boolean
  error: string | null
  reload: () => Promise<void>
  submit: (payload: TokenizationWizardPayload) => Promise<TokenizationRequest>
  patchRequest: (input: Parameters<typeof updateRwaRequest>[0]) => Promise<TokenizationRequest>
  invest: (input: { listingId: string; amount: string }) => Promise<{
    listing: MarketplaceListing
    holding: RwaHolding
    txHash?: string
  }>
  claim: () => Promise<RwaHolding[]>
}

const RwaContext = createContext<RwaContextValue | null>(null)

export function RwaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [listings, setListings] = useState<MarketplaceListing[]>([])
  const [requests, setRequests] = useState<TokenizationRequest[]>([])
  const [holdings, setHoldings] = useState<RwaHolding[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!user) {
      setListings([])
      setRequests([])
      setHoldings([])
      return
    }
    setLoading(true)
    try {
      const [nextListings, nextRequests, nextHoldings] = await Promise.all([
        fetchRwaListings(),
        fetchRwaRequests(),
        fetchRwaPortfolio(),
      ])
      setListings(nextListings)
      setRequests(nextRequests)
      setHoldings(nextHoldings)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar RWA')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void reload()
  }, [reload])

  const submit = useCallback(async (payload: TokenizationWizardPayload) => {
    const request = await submitTokenization(payload)
    setRequests((current) => [request, ...current.filter((row) => row.id !== request.id)])
    return request
  }, [])

  const patchRequest = useCallback(async (input: Parameters<typeof updateRwaRequest>[0]) => {
    const request = await updateRwaRequest(input)
    setRequests((current) =>
      current.map((row) => (row.id === request.id ? request : row)),
    )
    await reload()
    return request
  }, [reload])

  const invest = useCallback(
    async (input: { listingId: string; amount: string }) => {
      const result = await investInRwa(input)
      setListings((current) =>
        current.map((row) => (row.id === result.listing.id ? result.listing : row)),
      )
      setHoldings((current) => {
        const others = current.filter((row) => row.listingId !== result.holding.listingId)
        return [result.holding, ...others]
      })
      return result
    },
    [],
  )

  const claim = useCallback(async () => {
    const next = await claimRwaDividends()
    setHoldings(next)
    return next
  }, [])

  const value = useMemo(
    () => ({
      listings,
      requests,
      holdings,
      loading,
      error,
      reload,
      submit,
      patchRequest,
      invest,
      claim,
    }),
    [
      listings,
      requests,
      holdings,
      loading,
      error,
      reload,
      submit,
      patchRequest,
      invest,
      claim,
    ],
  )

  return <RwaContext.Provider value={value}>{children}</RwaContext.Provider>
}

export function useRwa(): RwaContextValue {
  const context = useContext(RwaContext)
  if (!context) {
    throw new Error('useRwa debe usarse dentro de RwaProvider')
  }
  return context
}
