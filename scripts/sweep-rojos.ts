/**
 * Devuelve a la tesorería todo el saldo de ROJOS de cuentas custodiales.
 *
 * Uso:
 *   npx tsx scripts/sweep-rojos.ts           # dry-run (solo lista)
 *   npx tsx scripts/sweep-rojos.ts --apply   # ejecuta las transferencias
 *
 * Lee .env / .env.local (SESSION_SECRET, LOYALTY_*, SINPE_TREASURY_SECRET_KEY
 * o ROJOS_DISTRIBUTOR_SECRET_KEY, y KV_* si los usuarios están en Vercel).
 */
import { Asset, Horizon, Keypair, StrKey } from '@stellar/stellar-sdk'
import { loadLocalEnv } from '../server/loadLocalEnv.js'
import { secretKeyForUser, superAdminPublicKey } from '../server/auth.js'
import { loadStore } from '../server/userStore.js'
import {
  horizonUrl,
  loyaltyAssetFromEnv,
} from '../server/provisionAccount.js'
import { submitCustodialPayment } from '../server/submitPayment.js'

loadLocalEnv()

const apply = process.argv.includes('--apply')

function treasuryPublicKey(): string {
  const names = [
    'SINPE_TREASURY_SECRET_KEY',
    'ROJOS_DISTRIBUTOR_SECRET_KEY',
    'SPONSOR_SECRET_KEY',
  ]
  for (const name of names) {
    const secret = (process.env[name] ?? '')
      .trim()
      .replace(/^['"]+|['"]+$/g, '')
    if (secret && StrKey.isValidEd25519SecretSeed(secret)) {
      return Keypair.fromSecret(secret).publicKey()
    }
  }
  throw new Error(
    'Falta SINPE_TREASURY_SECRET_KEY o ROJOS_DISTRIBUTOR_SECRET_KEY en el entorno',
  )
}

function loyaltyBalance(
  account: Horizon.AccountResponse,
  asset: Asset,
): string {
  const line = account.balances.find((entry) => {
    if (entry.asset_type === 'native' || entry.asset_type === 'liquidity_pool_shares') {
      return false
    }
    return (
      entry.asset_code === asset.getCode() && entry.asset_issuer === asset.getIssuer()
    )
  })
  return line && 'balance' in line ? line.balance : '0'
}

function formatAmount(value: string): string {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) {
    return '0'
  }
  return n.toFixed(7).replace(/\.?0+$/, '') || '0'
}

async function main() {
  const loyalty = loyaltyAssetFromEnv()
  const treasury = treasuryPublicKey()
  const adminKey = (() => {
    try {
      return superAdminPublicKey()
    } catch {
      return null
    }
  })()
  const server = new Horizon.Server(horizonUrl())
  const store = await loadStore()
  const custodial = store.users.filter(
    (user) =>
      user.secretKeyEnc &&
      user.publicKey !== treasury &&
      user.publicKey !== adminKey,
  )

  console.log(
    apply
      ? `Aplicando barrido de ${loyalty.getCode()} → ${treasury}`
      : `Dry-run: listando ${loyalty.getCode()} (pasa --apply para transferir) → ${treasury}`,
  )
  console.log(`Cuentas custodiales: ${custodial.length}`)

  let swept = 0
  let skipped = 0
  let failed = 0
  let total = 0

  for (const user of custodial) {
    let balance = '0'
    try {
      const account = await server.loadAccount(user.publicKey)
      balance = loyaltyBalance(account, loyalty)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      console.log(`  skip ${user.email} (${user.publicKey.slice(0, 8)}…) sin cuenta: ${detail}`)
      skipped += 1
      continue
    }

    const amount = formatAmount(balance)
    if (Number(amount) <= 0) {
      skipped += 1
      continue
    }

    total += Number(amount)
    const label = `${user.email}${user.guestDemo ? ' [demo]' : ''} ${amount} ${loyalty.getCode()}`

    if (!apply) {
      console.log(`  would sweep ${label}`)
      swept += 1
      continue
    }

    try {
      // Asegura que la llave desencripta antes de pagar
      await secretKeyForUser(user.id)
      const result = await submitCustodialPayment({
        userId: user.id,
        destination: treasury,
        amount,
        asset: loyalty.getCode(),
        memo: 'piloto-reset',
      })
      console.log(`  swept ${label} → ${result.hash}`)
      swept += 1
    } catch (error) {
      failed += 1
      const detail = error instanceof Error ? error.message : String(error)
      console.error(`  FAIL ${label}: ${detail}`)
    }
  }

  console.log(
    `\nListo. ${apply ? 'Transferidos' : 'Pendientes'}: ${swept}, omitidos: ${skipped}, fallidos: ${failed}, total ~${total.toFixed(4)} ${loyalty.getCode()}`,
  )
  if (!apply && swept > 0) {
    console.log('Vuelve a correr con --apply para vaciar esos saldos.')
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
