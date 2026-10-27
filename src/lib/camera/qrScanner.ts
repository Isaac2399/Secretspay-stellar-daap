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
  attempts = 40,
): Promise<HTMLElement> {
  for (let i = 0; i < attempts; i += 1) {
    const el = document.getElementById(elementId)
    if (el) {
      // Fuerza layout antes de medir (móvil a veces monta con alto 0 un frame)
      el.getBoundingClientRect()
      if (el.clientWidth >= 200 && el.clientHeight >= 200) {
        return el
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 50))
  }
  const el = document.getElementById(elementId)
  if (el && el.clientWidth > 0) {
    return el
  }
  throw new Error(`No apareció el visor de cámara (#${elementId}).`)
}

function safeQrbox(viewWidth: number, viewHeight: number) {
  const edge = Math.max(
    120,
    Math.min(Math.floor(Math.min(viewWidth, viewHeight) * 0.72), 280),
  )
  const width = Math.min(edge, Math.max(50, viewWidth - 8))
  const height = Math.min(edge, Math.max(50, viewHeight - 8))
  return { width, height }
}

async function ensureCameraPermission(): Promise<void> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('Este navegador no soporta cámara'), {
      name: 'NotSupportedError',
    })
  }

  // Si ya hay permiso, no abras/cierres un stream previo: en iOS eso deja el
  // preview cortado o negro hasta bloquear/desbloquear el teléfono.
  const nav = navigator as Navigator & {
    permissions?: { query: (desc: { name: string }) => Promise<{ state: string }> }
  }
  try {
    const status = await nav.permissions?.query({ name: 'camera' })
    if (status?.state === 'granted') {
      return
    }
  } catch {
    // Safari a menudo no soporta permissions.query('camera')
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' } },
  })
  for (const track of stream.getTracks()) {
    track.stop()
  }
  // Dale un respiro al hardware antes del segundo getUserMedia de html5-qrcode
  await new Promise((resolve) => window.setTimeout(resolve, 120))
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

/** Asegura que el <video> llene el marco y esté reproduciendo (iOS/Android). */
async function settleVideoPreview(elementId: string): Promise<void> {
  const root = document.getElementById(elementId)
  if (!root) {
    return
  }
  const video = root.querySelector('video')
  if (!video) {
    return
  }

  video.setAttribute('playsinline', 'true')
  video.setAttribute('webkit-playsinline', 'true')
  video.muted = true
  video.playsInline = true

  const play = async () => {
    try {
      await video.play()
    } catch {
      // autoplay policies; el stream igual puede verse
    }
  }

  if (video.readyState < 2) {
    await new Promise<void>((resolve) => {
      const done = () => resolve()
      video.addEventListener('loadeddata', done, { once: true })
      video.addEventListener('loadedmetadata', done, { once: true })
      window.setTimeout(done, 800)
    })
  }

  await play()

  // Fuerza un layout pass: sin esto algunos Android/iOS dejan el video a mitad
  root.style.transform = 'translateZ(0)'
  void root.offsetHeight
  window.dispatchEvent(new Event('resize'))
  await new Promise((resolve) => window.setTimeout(resolve, 50))
  await play()
}

/**
 * Arranca el escáner de forma compatible con iOS/Android/desktop.
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

  try {
    await ensureCameraPermission()
  } catch (error) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: true,
      })
      for (const track of stream.getTracks()) {
        track.stop()
      }
      await new Promise((resolve) => window.setTimeout(resolve, 120))
    } catch (fallbackError) {
      throw fallbackError ?? error
    }
  }

  // Re-medir después del prompt de permisos (el viewport puede haber cambiado)
  await waitForScannerElement(elementId)

  const scanConfig: Html5QrcodeCameraScanConfig = {
    fps: config.fps ?? 10,
    qrbox: safeQrbox,
    aspectRatio: 3 / 4,
    disableFlip: false,
  }

  const cameras = await Html5Qrcode.getCameras().catch(() => [])
  const rear = cameras.find((cam) =>
    /back|rear|environment|trasera|posterior/i.test(cam.label ?? ''),
  )

  // facingMode primero: un solo getUserMedia, preview más estable en móvil
  const candidates: Array<string | MediaTrackConstraints> = [
    { facingMode: { ideal: 'environment' } },
    { facingMode: 'environment' },
  ]
  if (rear?.id) {
    candidates.push(rear.id)
  }
  for (const cam of cameras) {
    if (cam.id && cam.id !== rear?.id) {
      candidates.push(cam.id)
    }
  }
  candidates.push({ facingMode: 'user' })

  let lastError: unknown
  for (const camera of candidates) {
    const scanner = new Html5Qrcode(elementId, { verbose: false })
    try {
      await scanner.start(camera, scanConfig, onSuccess, () => undefined)
      await settleVideoPreview(elementId)
      return scanner
    } catch (error) {
      lastError = error
      await stopWithoutClear(scanner)
      try {
        scanner.clear()
      } catch {
        // ignore
      }
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
