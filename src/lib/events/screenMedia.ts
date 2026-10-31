const LOGO_SIDE = 640
const STILL_SIDE = 1600
const LOGO_MAX = 180_000
const STILL_MAX = 700_000
const VIDEO_MAX_BYTES = 8 * 1024 * 1024

export async function compressSponsorLogo(file: File): Promise<string> {
  return compressStill(file, LOGO_SIDE, LOGO_MAX)
}

export async function prepareScreenClip(file: File): Promise<{
  kind: 'image' | 'video'
  src: string
  title: string
}> {
  const title = file.name.replace(/\.[^.]+$/, '').slice(0, 60) || 'Sin título'
  if (file.type.startsWith('video/')) {
    if (file.type !== 'video/mp4' && file.type !== 'video/webm') {
      throw new Error('El video tiene que ser MP4 o WebM.')
    }
    if (file.size > VIDEO_MAX_BYTES) {
      throw new Error('El video tiene que pesar menos de 8 MB.')
    }
    return { kind: 'video', src: await readDataUrl(file), title }
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('Sube una imagen o un video MP4 o WebM.')
  }
  return {
    kind: 'image',
    src: await compressStill(file, STILL_SIDE, STILL_MAX),
    title,
  }
}

function compressStill(file: File, maxSide: number, maxChars: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('No se pudo leer la imagen'))
      img.onload = () => {
        try {
          resolve(fitJpeg(img, maxSide, maxChars))
        } catch {
          reject(new Error('No se pudo preparar la imagen'))
        }
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function fitJpeg(img: HTMLImageElement, maxSide: number, maxChars: number): string {
  let side = maxSide
  let quality = 0.86
  let dataUrl = ''
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const scale = Math.min(1, side / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('No se pudo preparar la imagen')
    }
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    dataUrl = canvas.toDataURL('image/jpeg', quality)
    if (dataUrl.length <= maxChars) {
      return dataUrl
    }
    quality -= 0.1
    side = Math.round(side * 0.8)
  }
  if (dataUrl.length > maxChars) {
    throw new Error('La imagen sigue siendo demasiado pesada. Prueba con otra más simple.')
  }
  return dataUrl
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer el video'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(file)
  })
}
