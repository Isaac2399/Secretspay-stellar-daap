import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { findUserById } from '../auth.js'
import { AuthError } from '../errors.js'

const META_FILE = join('data', 'event-screen.json')
const BLOB_DIR = join('data', 'event-screen')
const KV_META = 'stellar-web-app:event-screen'
const MAX_SPONSORS = 16
const MAX_CLIPS = 20
const MAX_LOGO = 220_000
const MAX_STILL = 900_000
const MAX_VIDEO = 14_000_000

export type EventSponsorLogo = {
  id: string
  name: string
  logo: string
}

export type EventScreenClipMeta = {
  id: string
  title: string
  kind: 'image' | 'video'
}

export type EventScreenPlayback = {
  id: string
  title: string
  kind: 'image' | 'video'
  until: string | null
}

export type EventBoardScreen = {
  sponsors: EventSponsorLogo[]
  playback: EventScreenPlayback | null
}

export type EventScreenLibrary = {
  sponsors: EventSponsorLogo[]
  clips: EventScreenClipMeta[]
  playback: EventScreenPlayback | null
}

type ScreenClip = EventScreenClipMeta & { mime: string }

type MerchantScreen = {
  sponsors: EventSponsorLogo[]
  clips: ScreenClip[]
  playing: { clipId: string; until: string | null } | null
}

type ScreenStore = {
  merchants: Record<string, MerchantScreen>
}

const IMAGE_MIME = /^image\/(jpeg|jpg|png|webp|gif)$/
const VIDEO_MIME = /^video\/(mp4|webm)$/

let writeQueue: Promise<unknown> = Promise.resolve()

function withScreenLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn)
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

export function emptyBoardScreen(): EventBoardScreen {
  return { sponsors: [], playback: null }
}

export async function publicBoardScreen(merchantId: string): Promise<EventBoardScreen> {
  return withScreenLock(async () => {
    const store = await loadScreenStore()
    const row = store.merchants[merchantId]
    if (!row) {
      return emptyBoardScreen()
    }
    const playback = await settlePlayback(store, merchantId, row)
    return {
      sponsors: row.sponsors.map((sponsor) => ({
        id: sponsor.id,
        name: sponsor.name,
        logo: sponsor.logo,
      })),
      playback,
    }
  })
}

export async function getScreenAsset(merchantId: string, clipId: string) {
  const id = cleanId(clipId)
  const store = await loadScreenStore()
  const row = store.merchants[merchantId]
  const clip = row?.clips.find((item) => item.id === id)
  if (!clip) {
    throw new AuthError('Esa pieza no está en la pantalla', 404)
  }
  const src = await readBlob(id)
  if (!src) {
    throw new AuthError('No se encontró el archivo de esa pieza', 404)
  }
  return { id: clip.id, title: clip.title, kind: clip.kind, src }
}

export async function getScreenLibrary(merchantId: string): Promise<EventScreenLibrary> {
  return withScreenLock(async () => {
    await assertMerchant(merchantId)
    const store = await loadScreenStore()
    const row = store.merchants[merchantId]
    if (row) {
      await settlePlayback(store, merchantId, row)
    }
    return libraryOf(row)
  })
}

export async function addScreenSponsor(
  merchantId: string,
  input: Record<string, unknown>,
): Promise<EventScreenLibrary> {
  return withScreenLock(async () => {
    await assertMerchant(merchantId)
    const name = String(input.name ?? '').trim()
    if (!name) {
      throw new AuthError('Indica el nombre del patrocinador', 400)
    }
    const logo = parseDataUrl(input.logo, IMAGE_MIME, MAX_LOGO, 'logo')
    const store = await loadScreenStore()
    const row = ensureRow(store, merchantId)
    if (row.sponsors.length >= MAX_SPONSORS) {
      throw new AuthError('Ya hay 16 logos. Quita uno para añadir otro.', 400)
    }
    row.sponsors.push({
      id: randomUUID(),
      name: name.slice(0, 40),
      logo: logo.src,
    })
    await saveScreenStore(store)
    return libraryOf(row)
  })
}

export async function removeScreenSponsor(
  merchantId: string,
  sponsorId: string,
): Promise<EventScreenLibrary> {
  return withScreenLock(async () => {
    await assertMerchant(merchantId)
    const store = await loadScreenStore()
    const row = ensureRow(store, merchantId)
    row.sponsors = row.sponsors.filter((sponsor) => sponsor.id !== cleanId(sponsorId))
    await saveScreenStore(store)
    return libraryOf(row)
  })
}

export async function addScreenClip(
  merchantId: string,
  input: Record<string, unknown>,
): Promise<EventScreenLibrary> {
  const title = String(input.title ?? '').trim().slice(0, 60) || 'Sin título'
  const kind = input.kind === 'video' ? 'video' : 'image'
  const parsed = parseDataUrl(
    input.src,
    kind === 'video' ? VIDEO_MIME : IMAGE_MIME,
    kind === 'video' ? MAX_VIDEO : MAX_STILL,
    kind === 'video' ? 'video' : 'imagen',
  )
  if (kind === 'video' && !VIDEO_MIME.test(parsed.mime)) {
    throw new AuthError('El video tiene que ser MP4 o WebM', 400)
  }
  const id = randomUUID()
  await writeBlob(id, parsed.src)
  try {
    return await withScreenLock(async () => {
      await assertMerchant(merchantId)
      const store = await loadScreenStore()
      const row = ensureRow(store, merchantId)
      if (row.clips.length >= MAX_CLIPS) {
        throw new AuthError('Ya hay 20 piezas. Quita una para añadir otra.', 400)
      }
      row.clips.push({ id, title, kind, mime: parsed.mime })
      await saveScreenStore(store)
      return libraryOf(row)
    })
  } catch (error) {
    await deleteBlob(id)
    throw error
  }
}

export async function removeScreenClip(
  merchantId: string,
  clipId: string,
): Promise<EventScreenLibrary> {
  const id = cleanId(clipId)
  const library = await withScreenLock(async () => {
    await assertMerchant(merchantId)
    const store = await loadScreenStore()
    const row = ensureRow(store, merchantId)
    row.clips = row.clips.filter((clip) => clip.id !== id)
    if (row.playing?.clipId === id) {
      row.playing = null
    }
    await saveScreenStore(store)
    return libraryOf(row)
  })
  await deleteBlob(id)
  return library
}

export async function playScreenClip(
  merchantId: string,
  clipId: string,
  seconds: unknown,
): Promise<EventScreenLibrary> {
  return withScreenLock(async () => {
    await assertMerchant(merchantId)
    const id = cleanId(clipId)
    const store = await loadScreenStore()
    const row = ensureRow(store, merchantId)
    const clip = row.clips.find((item) => item.id === id)
    if (!clip) {
      throw new AuthError('Esa pieza no está en la pantalla', 404)
    }
    const duration = parseSeconds(seconds)
    row.playing = {
      clipId: id,
      until: duration
        ? new Date(Date.now() + duration * 1000).toISOString()
        : null,
    }
    await saveScreenStore(store)
    return libraryOf(row)
  })
}

export async function stopScreenClip(merchantId: string): Promise<EventScreenLibrary> {
  return withScreenLock(async () => {
    await assertMerchant(merchantId)
    const store = await loadScreenStore()
    const row = ensureRow(store, merchantId)
    row.playing = null
    await saveScreenStore(store)
    return libraryOf(row)
  })
}

async function settlePlayback(
  store: ScreenStore,
  merchantId: string,
  row: MerchantScreen,
): Promise<EventScreenPlayback | null> {
  const playing = row.playing
  if (!playing) {
    return null
  }
  const clip = row.clips.find((item) => item.id === playing.clipId)
  const expired =
    Boolean(playing.until) && Date.parse(playing.until ?? '') <= Date.now()
  if (!clip || expired) {
    row.playing = null
    store.merchants[merchantId] = row
    await saveScreenStore(store)
    return null
  }
  return {
    id: clip.id,
    title: clip.title,
    kind: clip.kind,
    until: playing.until,
  }
}

function libraryOf(row: MerchantScreen | undefined): EventScreenLibrary {
  if (!row) {
    return { sponsors: [], clips: [], playback: null }
  }
  const clip = row.playing
    ? row.clips.find((item) => item.id === row.playing?.clipId)
    : undefined
  return {
    sponsors: row.sponsors.map((sponsor) => ({ ...sponsor })),
    clips: row.clips.map((item) => ({
      id: item.id,
      title: item.title,
      kind: item.kind,
    })),
    playback:
      clip && row.playing
        ? {
            id: clip.id,
            title: clip.title,
            kind: clip.kind,
            until: row.playing.until,
          }
        : null,
  }
}

function ensureRow(store: ScreenStore, merchantId: string): MerchantScreen {
  const current = store.merchants[merchantId]
  if (current) {
    current.sponsors = Array.isArray(current.sponsors) ? current.sponsors : []
    current.clips = Array.isArray(current.clips) ? current.clips : []
    return current
  }
  const created: MerchantScreen = { sponsors: [], clips: [], playing: null }
  store.merchants[merchantId] = created
  return created
}

async function assertMerchant(merchantId: string) {
  const merchant = await findUserById(merchantId)
  if (!merchant || merchant.role !== 'merchant') {
    throw new AuthError('Elige una empresa registrada', 404)
  }
}

function parseSeconds(value: unknown): number | null {
  if (value === undefined || value === null || value === '' || value === 0 || value === '0') {
    return null
  }
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null
  }
  return Math.min(Math.round(seconds), 600)
}

function cleanId(value: unknown): string {
  const id = String(value ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new AuthError('Pieza no válida', 400)
  }
  return id
}

function parseDataUrl(
  value: unknown,
  mimePattern: RegExp,
  maxLength: number,
  label: string,
): { mime: string; src: string } {
  const src = String(value ?? '').trim()
  const match = /^data:([\w.+-]+\/[\w.+-]+);base64,([a-z0-9+/=\s]+)$/i.exec(src)
  if (!match || src.length > maxLength || src.length < 32) {
    throw new AuthError(
      label === 'video'
        ? 'El video tiene que ser MP4 o WebM y pesar menos de 8 MB.'
        : `Esa ${label} es demasiado pesada o no es una imagen válida.`,
      400,
    )
  }
  const mime = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase()
  if (!mimePattern.test(mime)) {
    throw new AuthError(
      label === 'video'
        ? 'El video tiene que ser MP4 o WebM.'
        : `Esa ${label} tiene que ser JPG, PNG o WebP.`,
      400,
    )
  }
  return { mime, src }
}

async function loadScreenStore(): Promise<ScreenStore> {
  if (kvConfigured()) {
    const raw = await kvCommand<string | ScreenStore | null>(['GET', KV_META])
    if (!raw) {
      return emptyStore()
    }
    if (typeof raw === 'string') {
      return parseStore(raw)
    }
    return normalizeStore(raw)
  }
  if (process.env.VERCEL) {
    throw new AuthError('En Vercel hace falta KV para la pantalla del evento.', 503)
  }
  if (!existsSync(META_FILE)) {
    return emptyStore()
  }
  return parseStore(readFileSync(META_FILE, 'utf8'))
}

async function saveScreenStore(store: ScreenStore): Promise<void> {
  const payload = JSON.stringify(store)
  if (kvConfigured()) {
    await kvCommand(['SET', KV_META, payload])
    return
  }
  if (process.env.VERCEL) {
    throw new AuthError('En Vercel hace falta KV para la pantalla del evento.', 503)
  }
  mkdirSync(BLOB_DIR, { recursive: true })
  writeFileSync(META_FILE, payload, 'utf8')
}

function emptyStore(): ScreenStore {
  return { merchants: {} }
}

function parseStore(raw: string): ScreenStore {
  try {
    return normalizeStore(JSON.parse(raw) as ScreenStore)
  } catch {
    return emptyStore()
  }
}

function normalizeStore(raw: Partial<ScreenStore> | null): ScreenStore {
  const merchants: Record<string, MerchantScreen> = {}
  const source = raw?.merchants
  if (!source || typeof source !== 'object') {
    return { merchants }
  }
  for (const [merchantId, value] of Object.entries(source)) {
    if (!value || typeof value !== 'object') {
      continue
    }
    const row = value as Partial<MerchantScreen>
    merchants[merchantId] = {
      sponsors: Array.isArray(row.sponsors) ? row.sponsors.filter(isSponsor) : [],
      clips: Array.isArray(row.clips) ? row.clips.filter(isClip) : [],
      playing:
        row.playing &&
        typeof row.playing === 'object' &&
        typeof row.playing.clipId === 'string'
          ? {
              clipId: row.playing.clipId,
              until: typeof row.playing.until === 'string' ? row.playing.until : null,
            }
          : null,
    }
  }
  return { merchants }
}

function isSponsor(value: unknown): value is EventSponsorLogo {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as EventSponsorLogo
  return Boolean(row.id && row.name && row.logo)
}

function isClip(value: unknown): value is ScreenClip {
  if (!value || typeof value !== 'object') {
    return false
  }
  const row = value as ScreenClip
  return Boolean(row.id && row.title && (row.kind === 'image' || row.kind === 'video'))
}

function blobFile(id: string): string {
  return join(BLOB_DIR, `${id}.media`)
}

async function writeBlob(id: string, src: string): Promise<void> {
  if (kvConfigured()) {
    await kvCommand(['SET', blobKey(id), src])
    return
  }
  if (process.env.VERCEL) {
    throw new AuthError('En Vercel hace falta KV para guardar videos de la pantalla.', 503)
  }
  mkdirSync(BLOB_DIR, { recursive: true })
  writeFileSync(blobFile(id), src, 'utf8')
}

async function readBlob(id: string): Promise<string | null> {
  if (kvConfigured()) {
    const raw = await kvCommand<string | null>(['GET', blobKey(id)])
    return typeof raw === 'string' && raw.startsWith('data:') ? raw : null
  }
  if (!existsSync(blobFile(id))) {
    return null
  }
  const raw = readFileSync(blobFile(id), 'utf8')
  return raw.startsWith('data:') ? raw : null
}

async function deleteBlob(id: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return
  }
  if (kvConfigured()) {
    await kvCommand(['DEL', blobKey(id)])
    return
  }
  if (existsSync(blobFile(id))) {
    rmSync(blobFile(id))
  }
}

function blobKey(id: string): string {
  return `stellar-web-app:event-blob:${id}`
}

function kvConfigured(): boolean {
  return Boolean(kvUrl() && kvToken())
}

function kvUrl(): string {
  return stripQuotes(process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL ?? '')
}

function kvToken(): string {
  return stripQuotes(
    process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '',
  )
}

function stripQuotes(value: string): string {
  return value.replace(/^['"]+|['"]+$/g, '').trim()
}

async function kvCommand<T>(command: unknown[]): Promise<T> {
  const response = await fetch(kvUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${kvToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  })
  if (!response.ok) {
    if (response.status === 413) {
      throw new AuthError('El archivo es demasiado pesado para guardarlo.', 413)
    }
    throw new AuthError('No se pudo guardar la pantalla del evento', 500)
  }
  const payload = (await response.json()) as { result: T }
  return payload.result
}
