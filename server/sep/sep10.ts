/**
 * SEP-10 web auth against the anchor's WEB_AUTH_ENDPOINT (from stellar.toml).
 * Custodial Web2.5: the server signs the challenge with the user's wallet secret
 * so the browser never sees the key. Optional client_domain extra signature is
 * only used when SEP24_CLIENT_SIGNING_SECRET is set.
 */
import { FeeBumpTransaction, Keypair, TransactionBuilder } from '@stellar/stellar-sdk'
import { AuthError } from '../errors.js'
import {
  loadAnchorToml,
  sep24ClientDomain,
  sep24ClientSigningSecret,
  type AnchorToml,
} from './toml.js'

const tokenCache = new Map<
  string,
  { token: string; toml: AnchorToml; expMs: number }
>()

export async function authenticateSep10(input: {
  publicKey: string
  secretKey: string
}): Promise<{ token: string; toml: AnchorToml }> {
  const cached = tokenCache.get(input.publicKey)
  if (cached && cached.expMs - 30_000 > Date.now()) {
    return { token: cached.token, toml: cached.toml }
  }

  const toml = await loadAnchorToml()
  const challengeUrl = new URL(toml.webAuthEndpoint)
  challengeUrl.searchParams.set('account', input.publicKey)
  challengeUrl.searchParams.set('home_domain', toml.homeDomain)
  const clientDomain = sep24ClientDomain()
  if (clientDomain) {
    challengeUrl.searchParams.set('client_domain', clientDomain)
  }

  const challengeRes = await fetch(challengeUrl)
  const challengeBody = await readAnchorJson(challengeRes)
  if (!challengeRes.ok) {
    throw new AuthError(
      anchorMessage(challengeBody, 'El ancla rechazó el desafío SEP-10'),
      challengeRes.status === 401 ? 401 : 502,
      challengeRes.status === 401 ? 'expired_session' : 'sep10_challenge',
    )
  }

  const xdr = String(challengeBody.transaction ?? '')
  const passphrase = String(challengeBody.network_passphrase ?? toml.networkPassphrase)
  if (!xdr) {
    throw new AuthError('El ancla no devolvió una transacción de desafío', 502)
  }

  let signed: string
  try {
    signed = signChallenge({
      xdr,
      networkPassphrase: passphrase || 'Test SDF Network ; September 2015',
      userSecret: input.secretKey,
    })
  } catch (error) {
    if (error instanceof AuthError) {
      throw error
    }
    const detail = error instanceof Error ? error.message : 'XDR inválido'
    throw new AuthError(`No se pudo firmar el desafío SEP-10: ${detail}`, 502)
  }

  const tokenRes = await fetch(toml.webAuthEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transaction: signed }),
  })
  const tokenBody = await readAnchorJson(tokenRes)
  if (!tokenRes.ok) {
    throw new AuthError(
      anchorMessage(tokenBody, 'No se pudo autenticar con el ancla (SEP-10)'),
      tokenRes.status === 401 ? 401 : 502,
      tokenRes.status === 401 ? 'expired_session' : 'sep10_token',
    )
  }

  const token = String(tokenBody.token ?? '')
  if (!token) {
    throw new AuthError('El ancla no devolvió un JWT SEP-10', 502)
  }

  tokenCache.set(input.publicKey, {
    token,
    toml,
    expMs: jwtExpiryMs(token),
  })
  return { token, toml }
}

export function clearSep10Cache(publicKey?: string): void {
  if (publicKey) {
    tokenCache.delete(publicKey)
    return
  }
  tokenCache.clear()
}

function signChallenge(input: {
  xdr: string
  networkPassphrase: string
  userSecret: string
}): string {
  const tx = TransactionBuilder.fromXdr(input.xdr, input.networkPassphrase)
  if (tx instanceof FeeBumpTransaction) {
    throw new AuthError('El desafío SEP-10 no es una transacción válida', 502)
  }
  tx.sign(Keypair.fromSecret(input.userSecret))
  const clientSecret = sep24ClientSigningSecret()
  if (clientSecret) {
    tx.sign(Keypair.fromSecret(clientSecret))
  }
  return tx.toXdr()
}

function jwtExpiryMs(token: string): number {
  try {
    const payload = token.split('.')[1]
    if (!payload) {
      return Date.now() + 5 * 60_000
    }
    const json = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as { exp?: number }
    if (typeof json.exp === 'number') {
      return json.exp * 1000
    }
  } catch {
    // Fall through to a short TTL.
  }
  return Date.now() + 5 * 60_000
}

export async function readAnchorJson(
  response: Response,
): Promise<Record<string, unknown>> {
  const raw = await response.text()
  if (!raw.trim()) {
    return {}
  }
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { error: raw.slice(0, 240) }
  }
}

export function anchorMessage(
  body: Record<string, unknown>,
  fallback: string,
): string {
  const error = body.error
  const message = body.message
  if (typeof error === 'string' && error.trim()) {
    return error
  }
  if (typeof message === 'string' && message.trim()) {
    return message
  }
  return fallback
}
