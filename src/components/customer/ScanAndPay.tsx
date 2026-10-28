import { useEffect, useId, useRef, useState } from 'react'
import { ErrorModal } from '@/components/feedback/ErrorModal'
import { Camera, CameraOff } from 'lucide-react'
import type { Html5Qrcode } from 'html5-qrcode'
import {
  deserializePaymentPayload,
  type PaymentQrPayload,
} from '@/lib/stellar/qrPayload'
import { confirmPaymentWithFeeBump } from '@/lib/stellar/feeBump'
import { stellarConfig } from '@/lib/stellar/config'
import { fieldClass } from '@/components/auth/AuthLayout'
import {
  cameraErrorMessage,
  startQrScanner,
  stopQrScanner,
} from '@/lib/camera/qrScanner'
import './ScanAndPay.css'

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

function shortKey(publicKey: string): string {
  return `${publicKey.slice(0, 6)}…${publicKey.slice(-6)}`
}

export function ScanAndPay() {
  const rawId = useId().replace(/:/g, '')
  const scannerId = `qr-scan-${rawId}`
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handlingRef = useRef(false)

  const [cameraOn, setCameraOn] = useState(false)
  const [cameraAllowed, setCameraAllowed] = useState(readCameraAllowed)
  const [payload, setPayload] = useState<PaymentQrPayload | null>(null)
  const [pasted, setPasted] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!cameraOn || payload) {
      return
    }

    let cancelled = false
    handlingRef.current = false

    async function start() {
      try {
        await new Promise<void>((resolve) => {
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => resolve())
          })
        })
        if (cancelled) {
          return
        }
        const scanner = await startQrScanner(scannerId, (decoded) => {
          if (cancelled || handlingRef.current) {
            return
          }
          try {
            const parsed = deserializePaymentPayload(decoded)
            handlingRef.current = true
            setScanError(null)
            setPayload(parsed)
            setCameraOn(false)
          } catch (err) {
            setScanError(
              err instanceof Error ? err.message : 'QR de pago inválido',
            )
          }
        })
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
      handlingRef.current = true
      void stopQrScanner(scannerRef.current)
      scannerRef.current = null
    }
  }, [cameraOn, payload, scannerId])

  function enableCamera() {
    setScanError(null)
    setCameraOn(true)
  }

  function usePastedPayload() {
    try {
      const parsed = deserializePaymentPayload(pasted)
      setScanError(null)
      setPayload(parsed)
      setCameraOn(false)
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Payload inválido')
    }
  }

  async function onConfirm() {
    if (!payload || submitting) {
      return
    }
    setSubmitting(true)
    setStatus(null)
    try {
      const result = await confirmPaymentWithFeeBump(payload)
      const gift = result.rewardHash
        ? ` Regalo de ${payload.reward} ${stellarConfig.loyalty.code} enviado.`
        : ''
      setStatus(`Pago enviado. Hash: ${result.hash}.${gift}`)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'No se pudo confirmar el pago')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-4">
      <div
        id={scannerId}
        className="qr-scanner"
        style={{ display: !payload && cameraOn ? 'block' : 'none' }}
        aria-hidden={Boolean(payload) || !cameraOn}
      />

      {!payload && !cameraOn ? (
        <div className="space-y-3 rounded-2xl bg-app-chip p-4">
          <p className="text-sm text-white/80">
            {cameraAllowed
              ? 'La cámara está apagada. Puedes encenderla otra vez en esta sesión.'
              : 'Al activar la cámara el navegador pedirá permiso. Usa Safari o Chrome, no un WebView de Instagram/Facebook.'}
          </p>
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-app-accent py-5 text-lg font-semibold text-white"
            onClick={enableCamera}
          >
            <Camera className="h-6 w-6" />
            {cameraAllowed ? 'Encender cámara' : 'Activar cámara'}
          </button>
        </div>
      ) : null}

      {!payload && cameraOn ? (
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-app-chip py-2.5 text-sm text-white/80"
          onClick={() => setCameraOn(false)}
        >
          <CameraOff className="h-4 w-4" />
          Apagar cámara
        </button>
      ) : null}

      {!payload ? (
        <div className="space-y-2">
          <label className="grid gap-1 text-sm font-medium">
            Pegar texto del QR
            <textarea
              className={`${fieldClass} min-h-20 font-mono text-xs`}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="SP1|G...|10|ROJOS|ORD-1"
            />
          </label>
          <button
            type="button"
            className="rounded-xl bg-app-chip px-4 py-2 text-sm"
            onClick={usePastedPayload}
          >
            Usar payload
          </button>
        </div>
      ) : null}

      {payload ? (
        <div className="space-y-4">
          <dl className="divide-y divide-white/10">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-app-muted">Comercio destino</dt>
              <dd className="font-mono" title={payload.destination}>
                {shortKey(payload.destination)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-app-muted">Monto a pagar</dt>
              <dd>
                {payload.amount} {payload.asset}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-app-muted">Concepto</dt>
              <dd>{payload.memo || '—'}</dd>
            </div>
            {payload.reward ? (
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-app-muted">
                  Regalo de {stellarConfig.loyalty.code}
                </dt>
                <dd>
                  {payload.reward} {stellarConfig.loyalty.code}
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="flex gap-3">
            <button
              type="button"
              className="flex-1 rounded-[24px] bg-app-chip py-4 text-base font-medium"
              onClick={() => {
                handlingRef.current = false
                setPayload(null)
                if (readCameraAllowed()) {
                  setCameraOn(true)
                }
              }}
            >
              Volver a escanear
            </button>
            <button
              type="button"
              className="flex-1 rounded-[24px] bg-app-accent py-4 text-base font-semibold text-white disabled:opacity-60"
              onClick={() => void onConfirm()}
              disabled={submitting}
            >
              {submitting ? 'Enviando…' : 'Confirmar Pago'}
            </button>
          </div>
        </div>
      ) : null}

      {!payload && scanError ? (
        <ErrorModal
          title="Cámara"
          message={scanError}
          onClose={() => setScanError(null)}
        />
      ) : null}

      {status ? (
        <p className="break-all text-sm text-white/70">{status}</p>
      ) : null}
    </div>
  )
}
