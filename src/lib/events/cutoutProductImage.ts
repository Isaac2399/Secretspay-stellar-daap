const MAX_SIDE = 560
const MAX_DATA_URL = 340_000
const WHITE_LIMIT = 18

/** Quita el fondo blanco y deja el producto en PNG transparente, sin óvalo. */
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
  const white = whiteBackground(image.data, width, height)
  const whiteKeep = foregroundRatio(white)
  let alpha: Float32Array
  if (whiteKeep >= 0.02 && whiteKeep <= 0.82) {
    alpha = alphaFromMask(white)
    featherAgainstBackground(alpha, image.data, width, height)
  } else {
    const mask = backgroundMask(image.data, width, height)
    const keep = foregroundRatio(mask)
    alpha =
      mask.some((value) => value === 1) && keep >= 0.12 && keep <= 0.88
        ? blurAlpha(alphaFromMask(mask), width, height, 2)
        : opaque(width, height)
  }
  applyAlpha(image.data, alpha)
  return fitDataUrl(trimToSubject(image, 16))
}

function whiteBackground(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8Array {
  const count = width * height
  const dist = new Int16Array(count)
  const chroma = new Uint8Array(count)
  for (let index = 0; index < count; index += 1) {
    const offset = index * 4
    const r = data[offset]
    const g = data[offset + 1]
    const b = data[offset + 2]
    dist[index] = data[offset + 3] < 16 ? 0 : Math.max(255 - r, 255 - g, 255 - b)
    chroma[index] = Math.max(r, g, b) - Math.min(r, g, b)
  }

  const mask = new Uint8Array(count)
  const queue: number[] = []
  let head = 0
  const tryPixel = (index: number) => {
    if (index < 0 || index >= count || mask[index] || dist[index] > WHITE_LIMIT) {
      return
    }
    mask[index] = 1
    queue.push(index)
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

  const colored = new Uint8Array(count)
  for (let index = 0; index < count; index += 1) {
    colored[index] = chroma[index] > 40 ? 1 : 0
  }
  const protect = dilate(colored, width, height, 2)
  for (let index = 0; index < count; index += 1) {
    if (!mask[index] && dist[index] <= WHITE_LIMIT && !protect[index]) {
      mask[index] = 1
    }
  }
  return mask
}

function featherAgainstBackground(
  alpha: Float32Array,
  data: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const next = new Float32Array(alpha)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (alpha[index] === 0) {
        continue
      }
      let touches = false
      if (x > 0 && alpha[index - 1] === 0) touches = true
      if (x < width - 1 && alpha[index + 1] === 0) touches = true
      if (y > 0 && alpha[index - width] === 0) touches = true
      if (y < height - 1 && alpha[index + width] === 0) touches = true
      if (!touches) {
        continue
      }
      const offset = index * 4
      const distance = Math.max(
        255 - data[offset],
        255 - data[offset + 1],
        255 - data[offset + 2],
      )
      if (distance < WHITE_LIMIT + 28) {
        next[index] = Math.max(0, Math.min(255, ((distance - WHITE_LIMIT) / 28) * 255))
      }
    }
  }
  alpha.set(next)
}

function applyAlpha(data: Uint8ClampedArray, alpha: Float32Array): void {
  for (let index = 0; index < alpha.length; index += 1) {
    data[index * 4 + 3] = Math.max(0, Math.min(255, Math.round(alpha[index])))
  }
}

function trimToSubject(source: ImageData, pad: number): HTMLCanvasElement {
  const { width, height, data } = source
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 16) {
        continue
      }
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  const canvas = document.createElement('canvas')
  if (maxX < minX || maxY < minY) {
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('No se pudo leer la foto')
    }
    ctx.putImageData(source, 0, 0)
    return canvas
  }
  const x0 = Math.max(0, minX - pad)
  const y0 = Math.max(0, minY - pad)
  const x1 = Math.min(width, maxX + pad + 1)
  const y1 = Math.min(height, maxY + pad + 1)
  canvas.width = x1 - x0
  canvas.height = y1 - y0
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('No se pudo leer la foto')
  }
  ctx.putImageData(source, -x0, -y0)
  return canvas
}

function opaque(width: number, height: number): Float32Array {
  const alpha = new Float32Array(width * height)
  alpha.fill(255)
  return alpha
}

function dilate(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  const out = new Uint8Array(mask.length)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let on = 0
      for (let dy = -radius; dy <= radius && !on; dy += 1) {
        const ny = y + dy
        if (ny < 0 || ny >= height) {
          continue
        }
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx
          if (nx < 0 || nx >= width) {
            continue
          }
          if (mask[ny * width + nx]) {
            on = 1
            break
          }
        }
      }
      out[y * width + x] = on
    }
  }
  return out
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

function fitDataUrl(canvas: HTMLCanvasElement): string {
  let current = canvas
  let url = current.toDataURL('image/png')
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
    url = current.toDataURL('image/png')
  }
  return url
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
