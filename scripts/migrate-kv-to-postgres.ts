import { loadLocalEnv } from '../server/loadLocalEnv.js'

loadLocalEnv()
const directUrl = process.env.DATABASE_URL_UNPOOLED?.trim()
if (directUrl) {
  process.env.DATABASE_URL = directUrl
}

const { migrateKvToPostgres, MigrationStopped } = await import('../server/db/migrateKv.js')

const result = await migrateKvToPostgres().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'El pase falló'
  console.error(message)
  if (!(error instanceof MigrationStopped)) {
    console.error(error)
  }
  process.exit(1)
})

console.log(
  `Pase único desde ${result.source}: ${result.users} usuarios, ${result.transactions} transacciones SINPE, ${result.deposits} depósitos. Postgres queda marcado y los endpoints de cuentas y SINPE lo usan en el próximo arranque.`,
)
