import { randomBytes } from 'node:crypto'
import {
  createApprovedMerchant,
  findUserByEmail,
  passwordMatches,
  sealPassword,
  type BusinessProfile,
} from './auth.js'
import { AuthError } from './errors.js'
import { isPlaceCategory } from './places.js'
import {
  loadStore,
  saveStore,
  type MerchantApplication,
} from './userStore.js'

export type MerchantApplicationView = {
  id: string
  status: MerchantApplication['status']
  createdAt: string
  decidedAt?: string
  rejectionNote?: string
  email: string
  businessName: string
  contactName: string
  phone: string
  taxId: string
  category: string
  address: string
  description: string
  acceptsRojos: boolean
  userId?: string
}

export type MerchantApplicationInput = {
  email: string
  password: string
  businessName: string
  contactName: string
  phone: string
  taxId: string
  category: string
  address: string
  description: string
  acceptsRojos: boolean
}

export async function submitMerchantApplication(
  raw: MerchantApplicationInput,
): Promise<{ ok: true; businessName: string }> {
  const application = validateApplication(raw)
  const sealed = sealPassword(application.password)
  const store = await loadStore()
  const apps = store.merchantApplications ?? []

  if (await findUserByEmail(application.email)) {
    throw new AuthError('Ya existe una cuenta con ese email', 409)
  }

  const open = apps.find(
    (row) =>
      row.email === application.email &&
      (row.status === 'pending' || row.status === 'approving'),
  )
  if (open?.status === 'approving') {
    throw new AuthError(
      'Tu solicitud ya fue aceptada y se está creando la cuenta.',
      409,
    )
  }
  if (open) {
    throw new AuthError(
      'Ya enviaste una solicitud con ese email. Está en revisión.',
      409,
    )
  }

  apps.push({
    id: randomBytes(12).toString('hex'),
    status: 'pending',
    createdAt: new Date().toISOString(),
    email: application.email,
    salt: sealed.salt,
    passwordHash: sealed.passwordHash,
    businessName: application.businessName,
    contactName: application.contactName,
    phone: application.phone,
    taxId: application.taxId,
    category: application.category,
    address: application.address,
    description: application.description,
    acceptsRojos: application.acceptsRojos,
  })
  store.merchantApplications = apps
  await saveStore(store)
  return { ok: true, businessName: application.businessName }
}

export async function listMerchantApplications(): Promise<MerchantApplicationView[]> {
  const store = await loadStore()
  return (store.merchantApplications ?? [])
    .map(toView)
    .sort((a, b) => {
      const rank = statusRank(a.status) - statusRank(b.status)
      if (rank !== 0) {
        return rank
      }
      return b.createdAt.localeCompare(a.createdAt)
    })
}

export async function decideMerchantApplication(input: {
  id: string
  action: 'approve' | 'reject'
  note?: string
  reviewerId: string
}): Promise<MerchantApplicationView> {
  const id = input.id.trim()
  if (!id) {
    throw new AuthError('Falta la solicitud', 400)
  }

  const store = await loadStore()
  const apps = store.merchantApplications ?? []
  const app = apps.find((row) => row.id === id)
  if (!app) {
    throw new AuthError('No existe esa solicitud', 404)
  }

  if (input.action === 'reject') {
    return rejectApplication(store, apps, app, input.note, input.reviewerId)
  }
  if (input.action !== 'approve') {
    throw new AuthError('La decisión tiene que ser aceptar o rechazar', 400)
  }
  return approveApplication(store, app, input.reviewerId)
}

export async function explainMerchantApplicationLogin(
  email: string,
  password: string,
): Promise<string | null> {
  const normalized = normalizeEmail(email)
  const store = await loadStore()
  const latest = (store.merchantApplications ?? [])
    .filter((row) => row.email === normalized)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  if (!latest || !passwordMatches(password, latest.salt, latest.passwordHash)) {
    return null
  }
  if (latest.status === 'pending') {
    return 'Tu solicitud de empresa está en revisión. Podrás entrar cuando el super admin la acepte.'
  }
  if (latest.status === 'approving') {
    return 'Tu solicitud ya fue aceptada y se está creando la cuenta. Intenta entrar en un momento.'
  }
  if (latest.status === 'rejected') {
    return latest.rejectionNote
      ? `La solicitud de empresa fue rechazada: ${latest.rejectionNote}`
      : 'La solicitud de empresa fue rechazada. Puedes enviar otra con los datos corregidos.'
  }
  return null
}

async function rejectApplication(
  store: Awaited<ReturnType<typeof loadStore>>,
  apps: MerchantApplication[],
  app: MerchantApplication,
  note: string | undefined,
  reviewerId: string,
): Promise<MerchantApplicationView> {
  if (app.status !== 'pending') {
    throw new AuthError('Solo se puede rechazar una solicitud en revisión', 400)
  }
  const rejectionNote = cleanNote(note)
  app.status = 'rejected'
  app.decidedAt = new Date().toISOString()
  app.reviewerId = reviewerId
  app.rejectionNote = rejectionNote
  store.merchantApplications = apps
  await saveStore(store)
  return toView(app)
}

async function approveApplication(
  store: Awaited<ReturnType<typeof loadStore>>,
  app: MerchantApplication,
  reviewerId: string,
): Promise<MerchantApplicationView> {
  if (app.status === 'approved' && app.userId) {
    return toView(app)
  }
  if (app.status === 'rejected') {
    throw new AuthError('Esa solicitud ya fue rechazada', 400)
  }
  if (app.status !== 'pending' && app.status !== 'approving') {
    throw new AuthError('Esa solicitud ya no está en revisión', 400)
  }

  const existing = await findUserByEmail(app.email)
  if (existing) {
    app.status = 'approved'
    app.userId = existing.id
    app.decidedAt = app.decidedAt ?? new Date().toISOString()
    app.reviewerId = reviewerId
    delete app.passwordHash
    delete app.salt
    await saveStore(store)
    return toView(app)
  }

  if (!app.passwordHash || !app.salt) {
    throw new AuthError('La solicitud ya no tiene contraseña para crear la cuenta', 400)
  }

  const salt = app.salt
  const passwordHash = app.passwordHash
  app.status = 'approving'
  await saveStore(store)

  try {
    const user = await createApprovedMerchant({
      email: app.email,
      salt,
      passwordHash,
      business: businessFrom(app),
    })
    const fresh = await loadStore()
    const current = fresh.merchantApplications?.find((row) => row.id === app.id)
    if (!current) {
      return toView({ ...app, status: 'approved', userId: user.id })
    }
    current.status = 'approved'
    current.userId = user.id
    current.decidedAt = new Date().toISOString()
    current.reviewerId = reviewerId
    delete current.passwordHash
    delete current.salt
    await saveStore(fresh)
    return toView(current)
  } catch (error) {
    const fresh = await loadStore()
    const current = fresh.merchantApplications?.find((row) => row.id === app.id)
    if (current && current.status === 'approving' && !current.userId) {
      current.status = 'pending'
      await saveStore(fresh)
    }
    throw error
  }
}

function validateApplication(raw: MerchantApplicationInput): MerchantApplicationInput & {
  email: string
} {
  const email = normalizeEmail(raw.email)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new AuthError('El email no es válido', 400)
  }
  const businessName = clip(raw.businessName, 2, 80, 'El nombre comercial')
  const contactName = clip(raw.contactName, 2, 80, 'El nombre de quien solicita')
  const phone = digits(raw.phone)
  if (phone.length < 8 || phone.length > 15) {
    throw new AuthError('El teléfono no es válido', 400)
  }
  const taxId = digits(raw.taxId)
  if (taxId.length < 9 || taxId.length > 12) {
    throw new AuthError('La cédula jurídica no es válida', 400)
  }
  const category = String(raw.category ?? '').trim()
  if (!isPlaceCategory(category)) {
    throw new AuthError('Elige un tipo de negocio válido', 400)
  }
  const address = clip(raw.address, 4, 200, 'La dirección')
  const description = clip(raw.description, 8, 500, 'La descripción del negocio')
  return {
    email,
    password: String(raw.password ?? ''),
    businessName,
    contactName,
    phone,
    taxId,
    category,
    address,
    description,
    acceptsRojos: Boolean(raw.acceptsRojos),
  }
}

function businessFrom(app: MerchantApplication): BusinessProfile {
  return {
    businessName: app.businessName,
    contactName: app.contactName,
    phone: app.phone,
    taxId: app.taxId,
    category: app.category,
    address: app.address,
    description: app.description,
    acceptsRojos: app.acceptsRojos,
  }
}

function toView(app: MerchantApplication): MerchantApplicationView {
  return {
    id: app.id,
    status: app.status,
    createdAt: app.createdAt,
    decidedAt: app.decidedAt,
    rejectionNote: app.rejectionNote,
    email: app.email,
    businessName: app.businessName,
    contactName: app.contactName,
    phone: app.phone,
    taxId: app.taxId,
    category: app.category,
    address: app.address,
    description: app.description,
    acceptsRojos: app.acceptsRojos,
    userId: app.userId,
  }
}

function statusRank(status: MerchantApplication['status']): number {
  if (status === 'pending' || status === 'approving') {
    return 0
  }
  return 1
}

function clip(value: unknown, min: number, max: number, label: string): string {
  const text = String(value ?? '').trim()
  if (text.length < min || text.length > max) {
    throw new AuthError(`${label} debe tener entre ${min} y ${max} caracteres`, 400)
  }
  return text
}

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function cleanNote(value: string | undefined): string | undefined {
  const note = String(value ?? '').trim()
  if (!note) {
    return undefined
  }
  if (note.length > 280) {
    throw new AuthError('La nota de rechazo es demasiado larga', 400)
  }
  return note
}

function normalizeEmail(email: string): string {
  return String(email ?? '').trim().toLowerCase()
}
