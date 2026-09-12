import { useCallback, useEffect, useState } from 'react'
import {
  EMPTY_BALANCES,
  getBalances,
  type AccountBalances,
} from '@/lib/stellar/getBalances'
import { stellarConfig } from '@/lib/stellar/config'

const POLL_MS = 12_000

export function useAccountBalances(publicKey: string) {
  const [balances, setBalances] = useState<AccountBalances>(EMPTY_BALANCES)
  const [error, setError] = useState<string | null>(null)

  const loadBalances = useCallback(async () => {
    if (!publicKey) {
      return
    }
    try {
      let next = await getBalances(publicKey)
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const funded = Number(next.xlm) > 0
        const loyaltyReady =
          !stellarConfig.loyalty.issuer ||
          next.raw.some(
            (entry) =>
              entry.assetCode?.toUpperCase() ===
              stellarConfig.loyalty.code.toUpperCase(),
          )
        if (funded && loyaltyReady) {
          break
        }
        await new Promise((resolve) => window.setTimeout(resolve, 1000))
        next = await getBalances(publicKey)
      }
      setBalances(next)
      setError(null)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudieron leer los saldos',
      )
    }
  }, [publicKey])

  useEffect(() => {
    void loadBalances()
    const id = window.setInterval(() => {
      void loadBalances()
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [loadBalances])

  return { balances, error, reload: loadBalances }
}

export function formatAmount(value: string): string {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) {
    return value
  }
  const abs = Math.abs(numeric)
  const minDigits = abs > 0 && abs < 0.01 ? 4 : 2
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: 7,
  }).format(numeric)
}
