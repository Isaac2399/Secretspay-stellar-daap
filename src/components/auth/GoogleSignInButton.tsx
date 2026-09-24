import { useEffect, useRef, useState } from 'react'
import { fetchGoogleAuthConfig } from '@/lib/auth/api'

type GoogleTokenClient = {
  requestAccessToken: (opts?: { prompt?: string }) => void
}

type GoogleAccounts = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: { access_token?: string; error?: string }) => void
        error_callback?: (error: { type?: string; message?: string }) => void
      }) => GoogleTokenClient
    }
  }
}

declare global {
  interface Window {
    google?: GoogleAccounts
  }
}

let scriptPromise: Promise<void> | null = null

function loadGoogleScript(): Promise<void> {
  if (window.google?.accounts?.oauth2) {
    return Promise.resolve()
  }
  if (scriptPromise) {
    return scriptPromise
  }
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]',
    )
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google')), {
        once: true,
      })
      return
    }
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('No se pudo cargar Google'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export function GoogleSignInButton({
  label,
  disabled,
  onToken,
}: {
  label: string
  disabled?: boolean
  onToken: (accessToken: string) => Promise<void>
}) {
  const [ready, setReady] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hint, setHint] = useState<string | null>(null)
  const clientIdRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const config = await fetchGoogleAuthConfig()
        if (cancelled) {
          return
        }
        clientIdRef.current = config.clientId
        setEnabled(config.enabled && Boolean(config.clientId))
        if (!config.enabled || !config.clientId) {
          setHint('Para usar Google, añade GOOGLE_CLIENT_ID en el servidor.')
          setReady(true)
          return
        }
        await loadGoogleScript()
        if (!cancelled) {
          setReady(true)
        }
      } catch {
        if (!cancelled) {
          setHint('No se pudo preparar el inicio de sesión con Google.')
          setReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleClick() {
    const clientId = clientIdRef.current
    if (!clientId || disabled || busy) {
      return
    }
    setBusy(true)
    setHint(null)
    try {
      await loadGoogleScript()
      const oauth = window.google?.accounts.oauth2
      if (!oauth) {
        throw new Error('Google no está disponible en este navegador')
      }
      await new Promise<void>((resolve, reject) => {
        const client = oauth.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: (response) => {
            if (response.error || !response.access_token) {
              reject(new Error('No se completó el inicio de sesión con Google'))
              return
            }
            void onToken(response.access_token).then(resolve).catch(reject)
          },
          error_callback: () => {
            reject(new Error('Se canceló el inicio de sesión con Google'))
          },
        })
        client.requestAccessToken({ prompt: 'select_account' })
      })
    } catch (err) {
      setHint(err instanceof Error ? err.message : 'No se pudo entrar con Google')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={!ready || !enabled || disabled || busy}
        onClick={() => void handleClick()}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-app-line bg-white py-3 text-sm font-medium text-neutral-900 disabled:opacity-60"
      >
        <GoogleMark />
        {busy ? 'Conectando con Google…' : label}
      </button>
      {hint ? <p className="text-center text-xs text-app-muted">{hint}</p> : null}
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.6.1-1.17.26-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96L3.97 7.3C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
