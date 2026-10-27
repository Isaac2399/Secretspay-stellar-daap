import { Html5Qrcode, type CameraDevice, type Html5QrcodeCameraScanConfig } from 'html5-qrcode'

export type QrScannerConfig = {
  fps?: number
  qrbox?: Html5QrcodeCameraScanConfig['qrbox']
  aspectRatio?: number
}

export function cameraErrorMessage(error: unknown): string {
  if (!window.isSecureContext) {
    return 'La cámara solo funciona en HTTPS o localhost. Abre la app desde el enlace de Vercel.'
  }
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: string }).name)
      : ''
  const message = error instanceof Error ? error.message : String(error ?? '')
  const raw = `${name} ${message}`.toLowerCase()

  if (
    name === 'NotAllowedError' ||
    raw.includes('permission') ||
    raw.includes('notallowed') ||
    raw.includes('denied')
  ) {
    return 'Permiso de cámara denegado. En el navegador, toca el candado de la URL → Cámara → Permitir, y vuelve a intentar.'
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    raw.includes('requested device not found') ||
    raw.includes('no camera')
  ) {
    return 'No se encontró una cámara en este dispositivo. Puedes pegar el texto del QR abajo.'
  }
  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    raw.includes('could not start video source') ||
    raw.includes('in use')
  ) {
    return 'La cámara está ocupada por otra app. Ciérrala y vuelve a intentar.'
  }
  if (name === 'OverconstrainedError' || raw.includes('overconstrained')) {
    return 'Esta cámara no admite el modo pedido. Prueba otra vez o pega el texto del QR.'
  }
  if (raw.includes('https') || raw.includes('secure')) {
    return 'La cámara requiere una conexión segura (HTTPS).'
  }
  if (message.trim()) {
    return `No se pudo abrir la cámara: ${message}`
  }
  return 'No se pudo abrir la cámara. Revisa el permiso del navegador o pega el texto del QR.'
}

export async function waitForScannerElement(
  elementId: string,
  attempts = 20,
): Promise<HTMLElement> {
  for (let i = 0; i < attempts; i += 1) {
    const el = document.getElementById(elementId)
    if (el) {
      return el
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50))
  }
  throw new Error(`No apareció el visor de cámara (#${elementId}).`)
}

export async function startQrScanner(
  scanner: Html5Qrcode,
  onSuccess: (decoded: string) => void,
  config: QrScannerConfig = {},
): Promise<void> {
  if (!window.isSecureContext) {
    throw Object.assign(new Error('La cámara requiere HTTPS'), {
      name: 'SecurityError',
    })
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('Este navegador no soporta cámara'), {
      name: 'NotSupportedError',
    })
  }

  const scanConfig: Html5QrcodeCameraScanConfig = {
    fps: config.fps ?? 10,
    qrbox:
      config.qrbox ??
      ((viewWidth, viewHeight) => {
        const edge = Math.max(160, Math.floor(Math.min(viewWidth, viewHeight) * 0.72))
        return { width: edge, height: edge }
      }),
    aspectRatio: config.aspectRatio,
    disableFlip: false,
  }

  const candidates: Array<string | MediaTrackConstraints> = [
    { facingMode: { ideal: 'environment' } },
    { facingMode: 'environment' },
    { facingMode: 'user' },
  ]

  let cameras: CameraDevice[] = []
  try {
    cameras = await Html5Qrcode.getCameras()
  } catch {
    cameras = []
  }

  const rear = cameras.find((cam) =>
    /back|rear|environment|trasera|posterior/i.test(cam.label),
  )
  if (rear?.id) {
    candidates.push(rear.id)
  }
  for (const cam of cameras) {
    if (cam.id && cam.id !== rear?.id) {
      candidates.push(cam.id)
    }
  }

  let lastError: unknown
  for (const camera of candidates) {
    try {
      await scanner.start(camera, scanConfig, onSuccess, () => undefined)
      return
    } catch (error) {
      lastError = error
      await stopQrScanner(scanner)
    }
  }

  throw lastError ?? new Error('No hay cámara disponible')
}

export async function stopQrScanner(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) {
    return
  }
  try {
    const state = scanner.getState()
    // 2 = SCANNING, 3 = PAUSED
    if (state === 2 || state === 3) {
      await scanner.stop()
    }
  } catch {
    // already stopped
  }
  try {
    scanner.clear()
  } catch {
    // ignore
  }
}
