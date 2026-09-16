import { randomBytes, scryptSync } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { Keypair } from '@stellar/stellar-sdk'

const file = 'data/users.json'
const accounts = [
  {
    email: 'caja@stellarpay.local',
    password: 'CajaRojo#16Sep26',
    role: 'cashier',
  },
  {
    email: 'sinpe@stellarpay.local',
    password: 'SinpeMatch#16Sep26',
    role: 'sinpe_ops',
  },
]

mkdirSync('data', { recursive: true })
const store = existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8'))
  : { users: [] }
store.users = Array.isArray(store.users) ? store.users : []

for (const account of accounts) {
  const salt = randomBytes(16).toString('hex')
  const passwordHash = scryptSync(account.password, salt, 64).toString('hex')
  const existing = store.users.find(
    (user) => String(user.email).toLowerCase() === account.email,
  )
  if (existing) {
    existing.role = account.role
    existing.salt = salt
    existing.passwordHash = passwordHash
    delete existing.secretKeyEnc
    delete existing.sinpeCode
    delete existing.place
    if (!existing.publicKey) {
      existing.publicKey = Keypair.random().publicKey()
    }
  } else {
    store.users.push({
      id: randomBytes(12).toString('hex'),
      email: account.email,
      salt,
      passwordHash,
      role: account.role,
      publicKey: Keypair.random().publicKey(),
      createdAt: new Date().toISOString(),
    })
  }
}

writeFileSync(file, JSON.stringify(store, null, 2), 'utf8')
console.log('created caja@stellarpay.local and sinpe@stellarpay.local')
