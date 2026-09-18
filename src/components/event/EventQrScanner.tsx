import { useEffect, useId, useRef, useState } from 'react'
import { Camera, CameraOff } from 'lucide-react'
import { Html5Qrcode } from 'html5-qrcode'
import { fieldClass } from '@/components/auth/AuthLayout'
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
}: {
  onScan: (value: string) => void
  busy?: boolean
}) {
  const rawId = useId().replace(/:/g, '')
  const scannerId = `event-qr-${rawId}`
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handlingRef = useRef(false)
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraAllowed, setCameraAllowed] = useState(readCameraAllowed)
  const [pasted, setPasted] = useState('')
  const [scanError, setScanError] = useState<string | null>(null)

  useEffect(() => {
    if (!cameraOn) {
      return
    }
    let cancelled = false
    handlingRef.current = false
    const scanner = new Html5Qrcode(scannerId, { verbose: false })
    scannerRef.current = scanner

    async function start() {
      try {
        const cameras = await Html5Qrcode.getCameras()
        if (cancelled) {
          return
        }
        if (!cameras.length) {
          setScanError('No hay cámara. Pega el texto del QR abajo.')
          setCameraOn(false)
          return
        }
        const rear = cameras.find((cam) =>
          /back|rear|environment|trasera/i.test(cam.label),
        )
        await scanner.start(
          rear?.id ?? cameras[0].id,
          { fps: 12, qrbox: { width: 220, height: 220 } },
          (decoded) => {
            if (handlingRef.current || busy) {
              return
            }
            handlingRef.current = true
            onScanRef.current(decoded)
            window.setTimeout(() => {
              handlingRef.current = false
            }, 1600)
          },
          () => undefined,
        )
      } catch {
        if (!cancelled) {
          setScanError('No se pudo abrir la cámara.')
          setCameraOn(false)
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      void stopScanner(scanner)
      scannerRef.current = null
    }
  }, [busy, cameraOn, scannerId])

  return (
    <div className="space-y-3">
      {cameraOn ? <div id={scannerId} className="qr-scanner" /> : null}
      {!cameraOn ? (
        <div className="space-y-3 rounded-2xl bg-app-chip p-4">
          <p className="text-sm text-white/80">
            {cameraAllowed
              ? 'Enciende la cámara para leer el QR del pedido.'
              : 'Activa la cámara para marcar el pedido como entregado.'}
          </p>
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-app-accent py-2.5 text-sm font-medium text-white"
            onClick={() => {
              writeCameraAllowed(true)
              setCameraAllowed(true)
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
        disabled={busy}
        onClick={() => onScan(pasted)}
      >
        Usar código
      </button>
      {scanError ? <p className="text-sm text-red-400">{scanError}</p> : null}
    </div>
  )
}

async function stopScanner(scanner: Html5Qrcode) {
  try {
    await scanner.stop()
    scanner.clear()
  } catch {
    // already stopped
  }
}
