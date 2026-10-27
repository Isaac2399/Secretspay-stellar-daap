import { useEffect, useId, useRef, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { Camera, CameraOff } from 'lucide-react'
import type { Html5Qrcode } from 'html5-qrcode'
import { fieldClass } from '@/components/auth/AuthLayout'
import {
  cameraErrorMessage,
  startQrScanner,
  stopQrScanner,
} from '@/lib/camera/qrScanner'
import '@/components/customer/ScanAndPay.css'

const CAMERA_SESSION_KEY = 'stellar-pay:camera-allowed'

function readCameraAllowed(): boolean {
  try {
    return sessionStorage.getItem(CAMERA_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

function writeCameraAllowed(allowed: boolean) {
  try {
    if (allowed) {
      sessionStorage.setItem(CAMERA_SESSION_KEY, '1')
    } else {
      sessionStorage.removeItem(CAMERA_SESSION_KEY)
    }
  } catch {
    // private mode
  }
}

export function EventQrScanner({
  onScan,
  busy,
  resetKey = 0,
}: {
  onScan: (value: string) => void | Promise<void>
  busy?: boolean
  /** Increment after closing success/error so the operator can scan again. */
  resetKey?: number
}) {
  const rawId = useId().replace(/:/g, '')
  const scannerId = `event-qr-${rawId}`
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handlingRef = useRef(false)
  const busyRef = useRef(Boolean(busy))
  const onScanRef = useRef(onScan)
  const lastValueRef = useRef<string | null>(null)
  onScanRef.current = onScan
  busyRef.current = Boolean(busy)

  const [cameraOn, setCameraOn] = useState(false)
  const [cameraAllowed, setCameraAllowed] = useState(readCameraAllowed)
  const [pasted, setPasted] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)

  useEffect(() => {
    handlingRef.current = false
    lastValueRef.current = null
  }, [resetKey])

  useEffect(() => {
    if (!cameraOn) {
      return
    }
    let cancelled = false
    handlingRef.current = false

    async function start() {
      try {
        // Dos frames de layout antes de medir/abrir (evita preview a mitad)
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve())
          })
        })
        if (cancelled) {
          return
        }
        const scanner = await startQrScanner(
          scannerId,
          (decoded) => {
            if (handlingRef.current || busyRef.current || cancelled) {
              return
            }
            const value = decoded.trim()
            if (!value || value === lastValueRef.current) {
              return
            }
            // Lock immediately so fps callbacks cannot fire a second complete.
            handlingRef.current = true
            lastValueRef.current = value
            cancelled = true
            setCameraOn(false)
            void Promise.resolve(onScanRef.current(value)).catch(() => undefined)
          },
          { fps: 8 },
        )
        if (cancelled) {
          await stopQrScanner(scanner)
          return
        }
        scannerRef.current = scanner
        writeCameraAllowed(true)
        setCameraAllowed(true)
      } catch (error) {
        if (!cancelled) {
          setScanError(cameraErrorMessage(error))
          setCameraOn(false)
        }
      }
    }

    void start()

    return () => {
      cancelled = true
      void stopQrScanner(scannerRef.current)
      scannerRef.current = null
    }
  }, [cameraOn, scannerId])

  return (
    <div className="space-y-3">
      {/* Mantén el marco en el DOM al abrir para que el alto exista antes del stream */}
      <div
        id={scannerId}
        className="qr-scanner"
        style={{ display: cameraOn ? 'block' : 'none' }}
        aria-hidden={!cameraOn}
      />
      {!cameraOn ? (
        <div className="space-y-3 rounded-2xl bg-app-chip p-4">
          <p className="text-sm text-white/80">
            {cameraAllowed
              ? 'Enciende la cámara para leer el QR del pedido.'
              : 'Activa la cámara. Usa Safari o Chrome (no Instagram/Facebook). El navegador pedirá permiso.'}
          </p>
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent py-2.5 text-sm font-medium text-white"
            disabled={busy}
            onClick={() => {
              setScanError(null)
              handlingRef.current = false
              lastValueRef.current = null
              setCameraOn(true)
            }}
          >
            <Camera className="h-4 w-4" />
            {cameraAllowed ? 'Encender cámara' : 'Activar cámara'}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-app-chip py-2.5 text-sm text-white/80"
          onClick={() => setCameraOn(false)}
        >
          <CameraOff className="h-4 w-4" />
          Apagar cámara
        </button>
      )}
      <label className="grid gap-1 text-sm font-medium">
        Pegar texto del QR
        <textarea
          className={`${fieldClass} min-h-16 font-mono text-xs`}
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="BAR1|…"
        />
      </label>
      <button
        type="button"
        className="rounded-xl bg-app-chip px-4 py-2 text-sm disabled:opacity-60"
        disabled={busy || !pasted.trim()}
        onClick={() => {
          const value = pasted.trim()
          if (!value || handlingRef.current || busyRef.current) {
            return
          }
          handlingRef.current = true
          lastValueRef.current = value
          setCameraOn(false)
          void Promise.resolve(onScan(value)).catch(() => undefined)
        }}
      >
        Usar código
      </button>
      {scanError ? (
        <ErrorModal
          title="Cámara"
          message={scanError}
          onClose={() => setScanError(null)}
        />
      ) : null}
    </div>
  )
}
