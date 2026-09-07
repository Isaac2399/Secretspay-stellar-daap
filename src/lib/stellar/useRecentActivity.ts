import { useCallback, useEffect, useRef, useState } from 'react'
import {
  activityFromSep24Deposit,
  getRecentPayments,
  mergeHorizonActivity,
  type AccountActivity,
} from '@/lib/stellar/getPayments'
import type { Sep24Transaction } from '@/lib/sep24/types'

const POLL_MS = 12_000

export function useRecentActivity(publicKey: string) {
  const [items, setItems] = useState<AccountActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const itemsRef = useRef<AccountActivity[]>([])
  const optimisticRef = useRef<AccountActivity[]>([])

  const publish = useCallback((horizon: AccountActivity[]) => {
    const merged = mergeHorizonActivity(horizon, optimisticRef.current)
    optimisticRef.current = merged.filter((item) => item.id.startsWith('sep24:'))
    itemsRef.current = merged
    setItems(merged)
  }, [])

  const load = useCallback(
    async (signal?: AbortSignal): Promise<AccountActivity[]> => {
      if (!publicKey) {
        itemsRef.current = []
        setItems([])
        setLoading(false)
        return []
      }
      try {
        const horizon = await getRecentPayments(publicKey, signal)
        if (signal?.aborted) {
          return itemsRef.current
        }
        publish(horizon)
        setError(null)
        return itemsRef.current
      } catch (err) {
        if (signal?.aborted) {
          return itemsRef.current
        }
        setError(
          err instanceof Error ? err.message : 'No se pudo cargar la actividad',
        )
        return itemsRef.current
      } finally {
        if (!signal?.aborted) {
          setLoading(false)
        }
      }
    },
    [publicKey, publish],
  )

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    void load(controller.signal)

    const id = window.setInterval(() => {
      if (document.hidden) {
        return
      }
      void load()
    }, POLL_MS)

    return () => {
      controller.abort()
      window.clearInterval(id)
    }
  }, [load])

  const reload = useCallback(async () => {
    await load()
  }, [load])

  const recordDeposit = useCallback((tx: Sep24Transaction) => {
    const item = activityFromSep24Deposit(tx)
    optimisticRef.current = [
      item,
      ...optimisticRef.current.filter((row) => row.id !== item.id),
    ]
    const horizonOnly = itemsRef.current.filter((row) => !row.id.startsWith('sep24:'))
    publish(horizonOnly)
  }, [publish])

  const reloadAfterDeposit = useCallback(
    async (tx?: Sep24Transaction) => {
      if (tx) {
        recordDeposit(tx)
      }
      const previousUsdc = new Set(
        itemsRef.current
          .filter((item) => item.kind === 'received' && item.asset === 'USDC')
          .map((item) => item.id),
      )
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const next = await load()
        const credited = next.some(
          (item) =>
            item.kind === 'received' &&
            item.asset === 'USDC' &&
            !item.id.startsWith('sep24:') &&
            !previousUsdc.has(item.id),
        )
        if (credited) {
          return
        }
        await wait(1_500)
      }
    },
    [load, recordDeposit],
  )

  return { items, loading, error, reload, recordDeposit, reloadAfterDeposit }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}
