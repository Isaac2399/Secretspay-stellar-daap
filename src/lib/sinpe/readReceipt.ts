/** Saca el número de comprobante del texto que leyó el OCR del screenshot. */
export function referenceFromReceiptText(text: string): string | null {
  const flat = text.replace(/\s+/g, ' ').trim()
  if (!flat) {
    return null
  }

  const labeled = [
    /referencia\s+sinpe\s*[:.]?\s*([0-9oOilI|sS][0-9oOilI|sS\s.-]{5,56})/i,
    /comprobante\s*(?:n[o°.]{0,2}|num(?:ero)?)?\s*[:#-]?\s*([0-9oOilI|sS][0-9oOilI|sS\s.-]{5,56})/i,
    /referencias?\s*[:#-]?\s*([0-9oOilI|sS][0-9oOilI|sS\s.-]{5,56})/i,
    /autorizaci[oó]n\s*[:#-]?\s*([0-9oOilI|sS][0-9oOilI|sS\s.-]{5,56})/i,
    /transacci[oó]n\s*(?:n[o°.]{0,2})?\s*[:#-]?\s*([0-9oOilI|sS][0-9oOilI|sS\s.-]{5,56})/i,
    /clave\s*[:#-]?\s*([0-9oOilI|sS][0-9oOilI|sS\s.-]{5,56})/i,
  ]
  for (const pattern of labeled) {
    const digits = cleanDigits(pattern.exec(flat)?.[1] ?? '')
    if (isReference(digits)) {
      return digits
    }
  }

  const runs = [...flat.matchAll(/\d{6,40}/g)].map((match) => match[0])
  const ranked = runs.filter(isReference).sort((a, b) => score(b) - score(a))
  return ranked[0] ?? null
}

export async function readReceiptImage(file: Blob): Promise<{
  text: string
  referenceId: string | null
}> {
  const prepared = await prepareReceiptImage(file)
  const { createWorker, PSM } = await import('tesseract.js')
  const worker = await createWorker('spa', 1, {
    workerBlobURL: true,
  })
  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    })
    const result = await worker.recognize(prepared)
    const text = result.data.text ?? ''
    return { text, referenceId: referenceFromReceiptText(text) }
  } finally {
    await worker.terminate()
  }
}

function cleanDigits(raw: string): string {
  return raw
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/\D/g, '')
}

function isReference(digits: string): boolean {
  if (digits.length < 6 || digits.length > 40) {
    return false
  }
  if (digits === '86266696' || digits === '62951541') {
    return false
  }
  return true
}

function score(digits: string): number {
  if (digits.length >= 12) {
    return 100 + digits.length
  }
  return digits.length
}

async function prepareReceiptImage(file: Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') {
    return file
  }
  const bitmap = await createImageBitmap(file)
  const maxEdge = 1800
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return file
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((next) => resolve(next), 'image/png')
  })
  return blob ?? file
}
