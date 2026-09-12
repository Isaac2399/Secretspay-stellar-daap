import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FILES = ['.env.local', '.env']

let loaded = false

/** Carga .env.local / .env en process.env para el middleware de Vite. */
export function loadLocalEnv(): void {
  if (loaded) {
    return
  }
  loaded = true
  for (const name of FILES) {
    const file = resolve(process.cwd(), name)
    if (!existsSync(file)) {
      continue
    }
    const text = readFileSync(file, 'utf8')
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      const cut = trimmed.indexOf('=')
      if (cut <= 0) {
        continue
      }
      const key = trimmed.slice(0, cut).trim()
      let value = trimmed.slice(cut + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (key && !(process.env[key] ?? '').trim()) {
        process.env[key] = value
      }
    }
  }
}
