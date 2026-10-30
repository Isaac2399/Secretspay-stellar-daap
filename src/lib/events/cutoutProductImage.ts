const MAX_SIDE = 560
const MAX_DATA_URL = 340_000

/** Separa la cerveza del fondo y la deja sobre un fondo suave, sin borde pixelado. */
export function cutoutProductImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('No se pudo leer la foto'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('No se pudo leer la foto'))
      img.onload = () => {
        try {
          resolve(exportCutout(img))
        } catch {
          reject(new Error('No se pudo leer la foto'))
        }
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

function exportCutout(img: HTMLImageElement): string {
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height))
  const width = Math.max(1, Math.round(img.width * scale))
  const height = Math.max(1, Math.round(img.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) {
    throw new Error('No se pudo leer la foto')
  }
  ctx.drawImage(img, 0, 0, width, height)
  const image = ctx.getImageData(0, 0, width, height)
  const mask = backgroundMask(image.data, width, height)
  const separated = mask.some((value) => value === 1)
  const alpha = separated
    ? blurAlpha(alphaFromMask(mask), width, height, 14)
    : centerFalloff(width, height)
  paintStudio(canvas, image, alpha, width, height)
  return fitDataUrl(canvas)
}

function backgroundMask(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const ref = cornerColor(data, width, height) ?? borderColor(data, width, height)
  if (!ref) {
    return new Uint8Array(width * height)
  }
  let best: Uint8Array | null = null
  for (const limit of [26, 40, 54]) {
    const mask = floodBackground(data, width, height, limit * limit, ref)
    const keep = foregroundRatio(mask)
    if (keep < 0.12) {
      break
    }
    if (keep <= 0.88) {
      best = mask
      break
    }
  }
  return best ?? new Uint8Array(width * height)
}

function cornerColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { r: number; g: number; b: number } | null {
  const size = Math.max(4, Math.round(Math.min(width, height) * 0.06))
  const patches = [
    averagePatch(data, width, 0, 0, size, size),
    averagePatch(data, width, width - size, 0, size, size),
    averagePatch(data, width, 0, height - size, size, size),
    averagePatch(data, width, width - size, height - size, size, size),
  ].filter((patch): patch is { r: number; g: number; b: number } => patch != null)
  if (patches.length < 3) {
    return null
  }
  const mean = {
    r: patches.reduce((sum, patch) => sum + patch.r, 0) / patches.length,
    g: patches.reduce((sum, patch) => sum + patch.g, 0) / patches.length,
    b: patches.reduce((sum, patch) => sum + patch.b, 0) / patches.length,
  }
  const alike = patches.every((patch) => dist2(patch, mean) < 42 * 42)
  return alike ? mean : null
}

function floodBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  limit2: number,
  ref: { r: number; g: number; b: number },
): Uint8Array {
  const count = width * height
  const mask = new Uint8Array(count)
  const queue: number[] = []
  let head = 0

  const tryPixel = (index: number) => {
    if (index < 0 || index >= count || mask[index]) {
      return
    }
    const offset = index * 4
    if (data[offset + 3] < 16) {
      mask[index] = 1
      queue.push(index)
      return
    }
    const dr = data[offset] - ref.r
    const dg = data[offset + 1] - ref.g
    const db = data[offset + 2] - ref.b
    if (dr * dr + dg * dg + db * db <= limit2) {
      mask[index] = 1
      queue.push(index)
    }
  }

  for (let x = 0; x < width; x += 1) {
    tryPixel(x)
    tryPixel((height - 1) * width + x)
  }
  for (let y = 0; y < height; y += 1) {
    tryPixel(y * width)
    tryPixel(y * width + width - 1)
  }

  while (head < queue.length) {
    const index = queue[head]
    head += 1
    const x = index % width
    if (x > 0) {
      tryPixel(index - 1)
    }
    if (x < width - 1) {
      tryPixel(index + 1)
    }
    if (index >= width) {
      tryPixel(index - width)
    }
    if (index < count - width) {
      tryPixel(index + width)
    }
  }

  return mask
}

function alphaFromMask(mask: Uint8Array): Float32Array {
  const alpha = new Float32Array(mask.length)
  for (let index = 0; index < mask.length; index += 1) {
    alpha[index] = mask[index] ? 0 : 255
  }
  return alpha
}

function centerFalloff(width: number, height: number): Float32Array {
  const alpha = new Float32Array(width * height)
  const cx = width / 2
  const cy = height * 0.46
  const rx = width * 0.36
  const ry = height * 0.42
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - cx) / rx
      const ny = (y - cy) / ry
      const distance = Math.sqrt(nx * nx + ny * ny)
      const fade = smoothstep(0.55, 1.2, distance)
      alpha[y * width + x] = (1 - fade) * 255
    }
  }
  return alpha
}

function blurAlpha(
  alpha: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  return boxBlur(boxBlur(alpha, width, height, radius), width, height, radius)
}

function boxBlur(
  src: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const tmp = new Float32Array(src.length)
  const dst = new Float32Array(src.length)
  const window = radius * 2 + 1
  for (let y = 0; y < height; y += 1) {
    const row = y * width
    let sum = 0
    for (let x = -radius; x <= radius; x += 1) {
      sum += src[row + clamp(x, 0, width - 1)]
    }
    for (let x = 0; x < width; x += 1) {
      tmp[row + x] = sum / window
      sum -= src[row + clamp(x - radius, 0, width - 1)]
      sum += src[row + clamp(x + radius + 1, 0, width - 1)]
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0
    for (let y = -radius; y <= radius; y += 1) {
      sum += tmp[clamp(y, 0, height - 1) * width + x]
    }
    for (let y = 0; y < height; y += 1) {
      dst[y * width + x] = sum / window
      sum -= tmp[clamp(y - radius, 0, height - 1) * width + x]
      sum += tmp[clamp(y + radius + 1, 0, height - 1) * width + x]
    }
  }
  return dst
}

function paintStudio(
  canvas: HTMLCanvasElement,
  source: ImageData,
  alpha: Float32Array,
  width: number,
  height: number,
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('No se pudo leer la foto')
  }
  ctx.clearRect(0, 0, width, height)
  const backdrop = ctx.createLinearGradient(0, 0, 0, height)
  backdrop.addColorStop(0, '#2a2a2e')
  backdrop.addColorStop(1, '#1c1c1e')
  ctx.fillStyle = backdrop
  ctx.fillRect(0, 0, width, height)

  const glow = subjectColor(source.data, alpha, width, height)
  const light = ctx.createRadialGradient(
    width / 2,
    height * 0.42,
    width * 0.04,
    width / 2,
    height * 0.46,
    width * 0.62,
  )
  light.addColorStop(0, `rgba(${glow.r}, ${glow.g}, ${glow.b}, 0.5)`)
  light.addColorStop(1, 'rgba(28, 28, 30, 0)')
  ctx.fillStyle = light
  ctx.fillRect(0, 0, width, height)

  const plate = ctx.getImageData(0, 0, width, height)
  const src = source.data
  const dst = plate.data
  for (let index = 0; index < alpha.length; index += 1) {
    const cover = alpha[index] / 255
    const offset = index * 4
    dst[offset] = src[offset] * cover + dst[offset] * (1 - cover)
    dst[offset + 1] = src[offset + 1] * cover + dst[offset + 1] * (1 - cover)
    dst[offset + 2] = src[offset + 2] * cover + dst[offset + 2] * (1 - cover)
    dst[offset + 3] = 255
  }
  ctx.putImageData(plate, 0, 0)
}

function subjectColor(
  data: Uint8ClampedArray,
  alpha: Float32Array,
  width: number,
  height: number,
): { r: number; g: number; b: number } {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  const x0 = Math.round(width * 0.35)
  const x1 = Math.round(width * 0.65)
  const y0 = Math.round(height * 0.3)
  const y1 = Math.round(height * 0.7)
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const index = y * width + x
      if (alpha[index] < 180) {
        continue
      }
      const offset = index * 4
      r += data[offset]
      g += data[offset + 1]
      b += data[offset + 2]
      n += 1
    }
  }
  if (n === 0) {
    return { r: 212, g: 164, b: 76 }
  }
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) }
}

function fitDataUrl(canvas: HTMLCanvasElement): string {
  let current = canvas
  let url = current.toDataURL('image/jpeg', 0.86)
  while (url.length > MAX_DATA_URL && current.width > 180) {
    const next = document.createElement('canvas')
    next.width = Math.max(1, Math.round(current.width * 0.82))
    next.height = Math.max(1, Math.round(current.height * 0.82))
    const ctx = next.getContext('2d')
    if (!ctx) {
      break
    }
    ctx.drawImage(current, 0, 0, next.width, next.height)
    current = next
    url = current.toDataURL('image/jpeg', 0.86)
  }
  return url
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function foregroundRatio(mask: Uint8Array): number {
  let background = 0
  for (const value of mask) {
    background += value
  }
  return 1 - background / mask.length
}

function borderColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): { r: number; g: number; b: number } | null {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  const take = (x: number, y: number) => {
    const offset = (y * width + x) * 4
    if (data[offset + 3] < 16) {
      return
    }
    r += data[offset]
    g += data[offset + 1]
    b += data[offset + 2]
    n += 1
  }
  for (let x = 0; x < width; x += 1) {
    take(x, 0)
    take(x, height - 1)
  }
  for (let y = 1; y < height - 1; y += 1) {
    take(0, y)
    take(width - 1, y)
  }
  if (n === 0) {
    return null
  }
  return { r: r / n, g: g / n, b: b / n }
}

function averagePatch(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): { r: number; g: number; b: number } | null {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const offset = (y * width + x) * 4
      if (data[offset + 3] < 16) {
        continue
      }
      r += data[offset]
      g += data[offset + 1]
      b += data[offset + 2]
      n += 1
    }
  }
  if (n === 0) {
    return null
  }
  return { r: r / n, g: g / n, b: b / n }
}

function dist2(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): number {
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return dr * dr + dg * dg + db * db
}
