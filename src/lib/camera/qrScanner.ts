import { Html5Qrcode, type Html5QrcodeCameraScanConfig } from 'html5-qrcode'

export type QrScannerConfig = {
  fps?: number
}

export function cameraErrorMessage(error: unknown): string {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return 'La cámara solo funciona en HTTPS o localhost. Abre https://partypay-stellar-daap.vercel.app'
  }
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: string }).name)
      : ''
  const message =
    typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : String(error ?? '')
  const raw = `${name} ${message}`.toLowerCase()

  if (
    name === 'NotAllowedError' ||
    raw.includes('permission') ||
    raw.includes('notallowed') ||
    raw.includes('denied') ||
    raw.includes('not allowed')
  ) {
    return 'Permiso de cámara denegado. Toca el candado de la URL → Cámara → Permitir, recarga y vuelve a intentar.'
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    raw.includes('requested device not found') ||
    raw.includes('no camera') ||
    raw.includes('no devices')
  ) {
    return 'No se encontró una cámara. Puedes pegar el texto del QR abajo.'
  }
  if (
    name === 'NotReadableError' ||
    name === 'TrackStartError' ||
    raw.includes('could not start video source') ||
    raw.includes('in use') ||
    raw.includes('aborterror')
  ) {
    return 'La cámara está ocupada por otra app o pestaña. Ciérrala y vuelve a intentar.'
  }
  if (raw.includes('qrbox') || raw.includes('dimensions should not be greater')) {
    return 'El visor de la cámara es demasiado pequeño. Gira el teléfono o usa pantalla completa e intenta de nuevo.'
  }
  if (raw.includes('https') || raw.includes('secure') || name === 'SecurityError') {
    return 'La cámara requiere HTTPS. Usa el enlace de Vercel.'
  }
  if (message.trim()) {
    return `No se pudo abrir la cámara: ${message}`
  }
  return 'No se pudo abrir la cámara. Revisa el permiso del navegador o pega el texto del QR.'
}

export async function waitForScannerElement(
  elementId: string,
  attempts = 30,
): Promise<HTMLElement> {
  for (let i = 0; i < attempts; i += 1) {
    const el = document.getElementById(elementId)
    if (el && el.clientWidth > 0) {
      return el
    }
    // Fuerza layout si el contenedor todavía mide 0
    if (el) {
      el.style.minHeight = el.style.minHeight || '280px'
      el.getBoundingClientRect()
      if (el.clientWidth > 0) {
        return el
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50))
  }
  const el = document.getElementById(elementId)
  if (el) {
    return el
  }
  throw new Error(`No apareció el visor de cámara (#${elementId}).`)
}

function safeQrbox(viewWidth: number, viewHeight: number) {
  const edge = Math.max(
    120,
    Math.min(Math.floor(Math.min(viewWidth, viewHeight) * 0.7), 280),
  )
  // html5-qrcode falla si qrbox > viewfinder
  const width = Math.min(edge, Math.max(50, viewWidth - 8))
  const height = Math.min(edge, Math.max(50, viewHeight - 8))
  return { width, height }
}

async function warmPermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('Este navegador no soporta cámara'), {
      name: 'NotSupportedError',
    })
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' } },
  })
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

async function stopWithoutClear(scanner: Html5Qrcode): Promise<void> {
  try {
    const state = scanner.getState()
    if (state === 2 || state === 3) {
      await scanner.stop()
    }
  } catch {
    // ignore
  }
}

/**
 * Arranca el escáner de forma agresiva y compatible con iOS/Android/desktop.
 * No hace clear() entre reintentos (rompe el DOM de html5-qrcode).
 */
export async function startQrScanner(
  elementId: string,
  onSuccess: (decoded: string) => void,
  config: QrScannerConfig = {},
): Promise<Html5Qrcode> {
  if (!window.isSecureContext) {
    throw Object.assign(new Error('La cámara requiere HTTPS'), {
      name: 'SecurityError',
    })
  }

  await waitForScannerElement(elementId)

  // Pedir permiso primero; en iOS habilita labels de getCameras()
  try {
    await warmPermission()
  } catch (error) {
    // Si falla environment, probar cualquier cámara
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      })
      for (const track of stream.getTracks()) {
        track.stop()
      }
    } catch (fallbackError) {
      throw fallbackError ?? error
    }
  }

  const scanConfig: Html5QrcodeCameraScanConfig = {
    fps: config.fps ?? 10,
    qrbox: safeQrbox,
    disableFlip: false,
  }

  const cameras = await Html5Qrcode.getCameras().catch(() => [])
  const rear = cameras.find((cam) =>
    /back|rear|environment|trasera|posterior/i.test(cam.label ?? ''),
  )

  const candidates: Array<string | MediaTrackConstraints> = []
  if (rear?.id) {
    candidates.push(rear.id)
  }
  for (const cam of cameras) {
    if (cam.id && cam.id !== rear?.id) {
      candidates.push(cam.id)
    }
  }
  // facingMode al final: en desktop a veces falla environment
  candidates.push(
    { facingMode: 'environment' },
    { facingMode: 'user' },
  )

  if (candidates.length === 0) {
    throw Object.assign(new Error('No hay cámara disponible'), {
      name: 'NotFoundError',
    })
  }

  let lastError: unknown
  for (const camera of candidates) {
    const scanner = new Html5Qrcode(elementId, { verbose: false })
    try {
      await scanner.start(camera, scanConfig, onSuccess, () => undefined)
      return scanner
    } catch (error) {
      lastError = error
      await stopWithoutClear(scanner)
      try {
        scanner.clear()
      } catch {
        // ignore
      }
      // Recrea el contenedor vacío para el siguiente intento
      const el = document.getElementById(elementId)
      if (el) {
        el.innerHTML = ''
      }
    }
  }

  throw lastError ?? new Error('No hay cámara disponible')
}

export async function stopQrScanner(scanner: Html5Qrcode | null): Promise<void> {
  if (!scanner) {
    return
  }
  await stopWithoutClear(scanner)
  try {
    scanner.clear()
  } catch {
    // ignore
  }
}
