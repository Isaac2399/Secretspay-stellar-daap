const STELLAR_SECRET = /\bS[A-Z2-7]{55}\b/g
const RESET_TOKEN = /([?&]token=)[^&\s]+/gi

export function containsSecret(value: string): boolean {
  STELLAR_SECRET.lastIndex = 0
  RESET_TOKEN.lastIndex = 0
  return STELLAR_SECRET.test(value) || RESET_TOKEN.test(value)
}

/** Quita claves Stellar y tokens de reset antes de un log o un texto de error. */
export function scrubSecrets(value: string): string {
  return value.replace(STELLAR_SECRET, '[clave]').replace(RESET_TOKEN, '$1[omitido]')
}

export function publicErrorMessage(value: string): string {
  const clean = scrubSecrets(value).trim()
  if (!clean || containsSecret(value)) {
    return 'No se pudo completar la operación.'
  }
  return clean
}
