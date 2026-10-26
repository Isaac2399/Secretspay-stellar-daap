import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { Address, Keypair, Networks, Operation, TransactionBuilder, rpc, StrKey } from '@stellar/stellar-sdk'
import { Client, KeypairSigner } from '@stellar/stellar-sdk/contract'

const root = new URL('..', import.meta.url)
const envPath = new URL('../.env', import.meta.url)
const wasmPath = new URL(
  '../contracts/partypay-escrow/target/wasm32v1-none/release/partypay_escrow.wasm',
  import.meta.url,
)
const passphrase = Networks.TESTNET
const rpcUrl = 'https://soroban-testnet.stellar.org'
const candidates = [
  'ROJOS_DISTRIBUTOR_SECRET_KEY',
  'SINPE_TREASURY_SECRET_KEY',
  'SUPER_ADMIN_SECRET_KEY',
  'SPONSOR_SECRET_KEY',
]

const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const cut = line.indexOf('=')
      let value = line.slice(cut + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      return [line.slice(0, cut).trim(), value]
    }),
)

const issuer = env.LOYALTY_ISSUER || env.VITE_LOYALTY_ISSUER
const secretName = candidates.find((name) => {
  const secret = env[name]
  return secret && StrKey.isValidEd25519SecretSeed(secret) && Keypair.fromSecret(secret).publicKey() === issuer
})
if (!secretName) {
  throw new Error('No hay una secret key del emisor de ROJOS en .env')
}

const signer = Keypair.fromSecret(env[secretName])
const server = new rpc.Server(rpcUrl)
const wasm = readFileSync(wasmPath)
const wasmHash = createHash('sha256').update(wasm).digest()
const existing = process.argv[2]

let contractId = existing
if (!contractId) {
  const upload = await submit(Operation.uploadContractWasm({ wasm }))
  console.log('upload', upload.hash)
  const created = await submit(
    Operation.createCustomContract({
      address: new Address(signer.publicKey()),
      wasmHash,
      salt: Keypair.random().rawPublicKey(),
    }),
  )
  contractId = created.contractId
  console.log('create', created.hash)
}
if (!contractId || !StrKey.isValidContract(contractId)) {
  throw new Error('No se pudo leer la dirección del contrato')
}
console.log('contract', contractId)

const client = await Client.from({
  contractId,
  rpcUrl,
  networkPassphrase: passphrase,
  publicKey: signer.publicKey(),
  signTransaction: new KeypairSigner(signer, passphrase),
})
const init = await client.initialize({ admin: signer.publicKey(), fee_bps: 250 })
const sent = await init.signAndSend()
console.log('initialize', sent.sendTransactionResponse?.hash)

const text = readFileSync(envPath, 'utf8')
const line = `ESCROW_CONTRACT_ID=${contractId}`
const next = /^ESCROW_CONTRACT_ID=/m.test(text)
  ? text.replace(/^ESCROW_CONTRACT_ID=.*$/m, line)
  : `${text.trimEnd()}\n${line}\n`
writeFileSync(envPath, next)
console.log('env', 'ESCROW_CONTRACT_ID')

async function submit(operation) {
  const account = await server.getAccount(signer.publicKey())
  let tx = new TransactionBuilder(account, {
    fee: '1000000',
    networkPassphrase: passphrase,
  })
    .addOperation(operation)
    .setTimeout(180)
    .build()
  const simulation = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(simulation)) {
    throw new Error(simulation.error)
  }
  tx = rpc.assembleTransaction(tx, simulation).build()
  tx.sign(signer)
  const sentTx = await server.sendTransaction(tx)
  if (sentTx.status === 'ERROR') {
    throw new Error(sentTx.errorResult?.toXDR('base64') ?? 'send error')
  }
  const hash = sentTx.hash
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    const got = await server.getTransaction(hash)
    if (got.status === 'NOT_FOUND') {
      continue
    }
    if (got.status === 'FAILED') {
      throw new Error(`failed ${hash}`)
    }
    if (got.status === 'SUCCESS') {
      let contractId
      if (got.returnValue) {
        try {
          contractId = Address.fromScVal(got.returnValue).toString()
        } catch {
          contractId = undefined
        }
      }
      return { hash, contractId }
    }
  }
  throw new Error(`timeout ${hash}`)
}
