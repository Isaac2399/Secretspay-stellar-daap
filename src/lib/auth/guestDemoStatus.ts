import { useEffect, useState } from 'react'
import { fetchGuestDemoStatus } from '@/lib/auth/api'

export type GuestDemoStatus = {
  ready: boolean
  available: boolean
  merchantReady: boolean
  merchantName: string
}

let latest: GuestDemoStatus | null = null
let inflight: Promise<GuestDemoStatus> | null = null

export function loadGuestDemoStatus(): Promise<GuestDemoStatus> {
  if (inflight) {
    return inflight
  }
  inflight = fetchGuestDemoStatus()
    .then((status) => {
      latest = status
      return status
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

const visible: GuestDemoStatus = {
  ready: true,
  available: true,
  merchantReady: false,
  merchantName: '',
}

export function useGuestDemoEntry() {
  const [status, setStatus] = useState<GuestDemoStatus>(() => latest ?? visible)

  useEffect(() => {
    let cancelled = false
    let timer = 0

    async function poll() {
      try {
        const next = await loadGuestDemoStatus()
        if (cancelled) {
          return
        }
        setStatus(next)
        if (!next.available || next.ready) {
          return
        }
        timer = window.setTimeout(() => {
          void poll()
        }, 1200)
      } catch {
        if (!cancelled && !latest) {
          setStatus(visible)
        }
      }
    }

    if (latest) {
      setStatus(latest)
      if (latest.available && !latest.ready) {
        timer = window.setTimeout(() => {
          void poll()
        }, 1200)
      }
    } else {
      void poll()
    }

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [])

  return {
    available: status.available,
    merchantReady: status.merchantReady,
  }
}
