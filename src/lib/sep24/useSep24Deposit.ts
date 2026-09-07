import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ensureUsdcTrustline,
  fetchSep24Transaction,
  Sep24ApiError,
  startSep24Deposit,
} from './api'
import {
  isTerminalSep24Status,
  type Sep24InteractiveResponse,
  type Sep24Rail,
  type Sep24Transaction,
} from './types'

const POLL_MS = 4_000

export type Sep24Phase =
  | 'idle'
  | 'trustline'
  | 'starting'
  | 'interactive'
  | 'completed'
  | 'error'

export function useSep24Deposit(onCompleted?: (tx: Sep24Transaction) => void) {
  const [phase, setPhase] = useState<Sep24Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | undefined>()
  const [session, setSession] = useState<Sep24InteractiveResponse | null>(null)
  const [transaction, setTransaction] = useState<Sep24Transaction | null>(null)
  const onCompletedRef = useRef(onCompleted)
  onCompletedRef.current = onCompleted
  const notifiedRef = useRef(false)

  const notifyCompleted = useCallback((tx: Sep24Transaction) => {
    if (notifiedRef.current) {
      return
    }
    notifiedRef.current = true
    onCompletedRef.current?.(tx)
  }, [])

  const reset = useCallback(() => {
    notifiedRef.current = false
    setPhase('idle')
    setError(null)
    setErrorCode(undefined)
    setSession(null)
    setTransaction(null)
  }, [])

  const openTrustline = useCallback(async () => {
    setPhase('trustline')
    setError(null)
    setErrorCode(undefined)
    try {
      await ensureUsdcTrustline()
      setPhase('idle')
      return true
    } catch (err) {
      applyError(err, setError, setErrorCode, setPhase)
      return false
    }
  }, [])

  const start = useCallback(async (amount: string | undefined, rail: Sep24Rail) => {
    notifiedRef.current = false
    setPhase('trustline')
    setError(null)
    setErrorCode(undefined)
    setTransaction(null)
    try {
      await ensureUsdcTrustline()
      setPhase('starting')
      const next = await startSep24Deposit({ amount, rail })
      setSession(next)
      setPhase('interactive')
      return next
    } catch (err) {
      applyError(err, setError, setErrorCode, setPhase)
      return null
    }
  }, [])

  useEffect(() => {
    if (phase !== 'interactive' || !session) {
      return
    }
    let cancelled = false

    async function poll() {
      if (document.hidden || !session) {
        return
      }
      try {
        const next = await fetchSep24Transaction(session.id)
        if (cancelled) {
          return
        }
        setTransaction(next)
        if (next.status === 'completed') {
          setPhase('completed')
          notifyCompleted(next)
          return
        }
        if (isTerminalSep24Status(next.status)) {
          setPhase('error')
          setError(next.message || `El depósito terminó: ${next.status}`)
        }
      } catch (err) {
        if (cancelled) {
          return
        }
        if (err instanceof Sep24ApiError && err.code === 'expired_session') {
          setPhase('error')
          setErrorCode(err.code)
          setError(err.message)
        }
      }
    }

    void poll()
    const id = window.setInterval(() => {
      void poll()
    }, POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [phase, session, notifyCompleted])

  useEffect(() => {
    if (!session) {
      return
    }

    function onMessage(event: MessageEvent) {
      if (!isAnchorOrigin(event.origin, session?.homeDomain, session?.url)) {
        return
      }
      const payload = event.data
      const tx = extractPostedTransaction(payload)
      if (!tx) {
        return
      }
      setTransaction((current) => ({
        id: String(tx.id ?? session?.id ?? current?.id ?? ''),
        kind: String(tx.kind ?? 'deposit'),
        status: String(tx.status ?? current?.status ?? 'unknown'),
        message: tx.message ? String(tx.message) : current?.message,
        amount_out: tx.amount_out ? String(tx.amount_out) : current?.amount_out,
        stellar_transaction_id: tx.stellar_transaction_id
          ? String(tx.stellar_transaction_id)
          : current?.stellar_transaction_id,
      }))
      if (tx.status === 'completed') {
        setPhase('completed')
        notifyCompleted({
          id: String(tx.id ?? session?.id ?? ''),
          kind: String(tx.kind ?? 'deposit'),
          status: String(tx.status),
          message: tx.message ? String(tx.message) : null,
          amount_out: tx.amount_out ? String(tx.amount_out) : undefined,
          stellar_transaction_id: tx.stellar_transaction_id
            ? String(tx.stellar_transaction_id)
            : null,
        })
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [session, notifyCompleted])

  return {
    phase,
    error,
    errorCode,
    session,
    transaction,
    start,
    openTrustline,
    reset,
  }
}

function isAnchorOrigin(
  origin: string,
  homeDomain?: string,
  interactiveUrl?: string,
): boolean {
  try {
    const host = new URL(origin).hostname
    if (homeDomain && (host === homeDomain || host.endsWith(`.${homeDomain}`))) {
      return true
    }
    if (interactiveUrl) {
      return host === new URL(interactiveUrl).hostname
    }
  } catch {
    return false
  }
  return false
}

function extractPostedTransaction(
  payload: unknown,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const record = payload as Record<string, unknown>
  if (record.transaction && typeof record.transaction === 'object') {
    return record.transaction as Record<string, unknown>
  }
  if (typeof record.status === 'string') {
    return record
  }
  return null
}

function applyError(
  err: unknown,
  setError: (value: string | null) => void,
  setErrorCode: (value: string | undefined) => void,
  setPhase: (value: Sep24Phase) => void,
) {
  setPhase('error')
  if (err instanceof Sep24ApiError) {
    setError(err.message)
    setErrorCode(err.code)
    return
  }
  setError(err instanceof Error ? err.message : 'No se pudo iniciar el depósito')
  setErrorCode(undefined)
}
