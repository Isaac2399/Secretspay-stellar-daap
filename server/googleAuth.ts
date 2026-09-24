import { AuthError } from './errors.js'

export function googleClientId(): string {
  return (
    process.env.GOOGLE_CLIENT_ID ??
    process.env.VITE_GOOGLE_CLIENT_ID ??
    ''
  ).trim()
}

export async function verifyGoogleAccessToken(accessToken: string): Promise<{
  email: string
  googleId: string
}> {
  const clientId = googleClientId()
  if (!clientId) {
    throw new AuthError(
      'Google no está configurado. Añade GOOGLE_CLIENT_ID en el servidor.',
      503,
    )
  }
  const token = accessToken.trim()
  if (!token) {
    throw new AuthError('Falta el token de Google', 400)
  }

  const infoUrl = `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(token)}`
  const infoRes = await fetch(infoUrl)
  if (!infoRes.ok) {
    throw new AuthError('El inicio de sesión con Google no es válido', 401)
  }
  const info = (await infoRes.json()) as {
    aud?: string
    azp?: string
    sub?: string
    email?: string
    email_verified?: string | boolean
    exp?: string
  }

  if (info.aud !== clientId && info.azp !== clientId) {
    throw new AuthError('El inicio de sesión con Google no es válido', 401)
  }
  if (info.exp && Number(info.exp) * 1000 < Date.now()) {
    throw new AuthError('El inicio de sesión con Google caducó. Inténtalo de nuevo.', 401)
  }

  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!profileRes.ok) {
    throw new AuthError('No se pudo leer la cuenta de Google', 401)
  }
  const profile = (await profileRes.json()) as {
    sub?: string
    email?: string
    email_verified?: string | boolean
  }

  const email = (profile.email ?? info.email ?? '').trim().toLowerCase()
  const googleId = (profile.sub ?? info.sub ?? '').trim()
  const verified = profile.email_verified ?? info.email_verified
  if (!googleId || !email) {
    throw new AuthError('La cuenta de Google no incluye un email', 401)
  }
  if (verified !== true && verified !== 'true') {
    throw new AuthError('El email de Google no está verificado', 401)
  }

  return { email, googleId }
}
