import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))
const outDir = join(root, 'png')
const mermaidDir = join(root, 'mermaid')

const diagrams = [
  {
    file: '01-roles-navegacion',
    title: '1. Roles and navigation',
    caption:
      'Who reaches each screen. Event staff (cashier and SINPE desk) do not see Card, Map, or RWA.',
    mermaid: `flowchart TD
  A([Open app]) --> B{Session exists?}
  B -->|No| C[Login / Register]
  B -->|Yes| D{Role}
  D -->|Customer| E[Home · Card · Map · RWA · Profile]
  D -->|Merchant| F[Home · Card · Map · RWA · Profile]
  D -->|Admin| G[Distributor panel + Profile]
  D -->|Cashier| H[Cash desk + Profile]
  D -->|SINPE desk| I[Unassigned deposits + Profile]
  C --> B`,
  },
  {
    file: '02-registro',
    title: '2. Account registration',
    caption:
      'The user picks Customer or Merchant. The server creates a keypair, funds it on Testnet, and stores the secret encrypted. The browser never sees the private key.',
    mermaid: `flowchart TD
  A([Create account]) --> B[Email + password min 8]
  B --> C{Role}
  C -->|Customer| D[role = customer]
  C -->|Merchant| E[role = merchant]
  D --> F[POST register]
  E --> F
  F --> G[Generate Stellar keypair]
  G --> H[Friendbot Testnet]
  H --> I[Open ROJOS trustline]
  I --> J[Encrypt secret key and save user]
  J --> K[Assign SINPE code sc…ts]
  K --> L([Session + Home])
  F -->|Email taken / error| M([Show error])`,
  },
  {
    file: '03-login',
    title: '3. Sign in',
    caption: 'Guests go to /login. If a session cookie already exists, they are redirected to Home.',
    mermaid: `flowchart TD
  A([Login screen]) --> B[Email + password]
  B --> C[POST login]
  C -->|OK| D[Session cookie]
  D --> E([Home by role])
  C -->|Invalid credentials| F([Show error])
  G([Already signed in]) --> E`,
  },
  {
    file: '04-inicio-cliente',
    title: '4. Home — Customer',
    caption:
      'Dashboard with ROJOS / XLM / USDC balances, SINPE top-ups, activity, and QR pay.',
    mermaid: `flowchart TD
  A([Customer home]) --> B[View balances and copy public key]
  A --> C{Action}
  C -->|Add| D[Add-funds sheet]
  C -->|Send| E[Public-key form]
  C -->|Scan / QR| F[Pay with QR]
  C -->|Activity| G[Horizon list]
  A --> H[SINPE top-ups block if any]
  D --> I([Funding flows])
  E --> J([Custodial payment])
  F --> J`,
  },
  {
    file: '05-inicio-empresa',
    title: '5. Home — Merchant',
    caption:
      'Same wallet as the customer, plus charge via invoice QR instead of scanning to pay.',
    mermaid: `flowchart TD
  A([Merchant home]) --> B[ROJOS / XLM / USDC balances]
  A --> C{Action}
  C -->|Add| D[Add-funds sheet]
  C -->|Send| E[Transfer to public key]
  C -->|Charge| F[Invoice QR]
  F --> G[Amount + asset + memo + ROJOS reward]
  G --> H[Generate payload and QR]
  H --> I([Customer scans and pays])`,
  },
  {
    file: '06-enviar',
    title: '6. Send by public key',
    caption:
      'Custodial Testnet payment. The backend signs and may wrap a fee-bump. Default asset: ROJOS.',
    mermaid: `flowchart TD
  A([Send]) --> B[Destination G… + amount + asset + memo]
  B --> C{Valid public key?}
  C -->|No| D([Destination error])
  C -->|Yes| E{Amount > 0?}
  E -->|No| F([Amount error])
  E -->|Yes| G[POST /api/payments]
  G --> H[Server signs with custodial key]
  H --> I{Horizon OK?}
  I -->|Yes| J([Show hash])
  I -->|No| K([Show error])`,
  },
  {
    file: '07-pagar-qr',
    title: '7. Pay with QR',
    caption:
      'The customer opens the camera or pastes SP1|… text. Confirms destination, amount, memo, and optional ROJOS reward.',
    mermaid: `flowchart TD
  A([Pay with QR]) --> B{Camera allowed?}
  B -->|Yes| C[Scan QR]
  B -->|No| D[Paste QR text]
  C --> E{Valid payload?}
  D --> E
  E -->|No| F([Read error])
  E -->|Yes| G[Show merchant, amount, memo]
  G --> H{Confirm?}
  H -->|Back| A
  H -->|Yes| I[POST /api/payments]
  I -->|OK| J([Hash + optional ROJOS reward])
  I -->|Fail| K([Error])`,
  },
  {
    file: '08-factura-qr',
    title: '8. Charge / invoice QR',
    caption:
      'The merchant does not send the payment: they generate a QR that the customer settles on Testnet.',
    mermaid: `flowchart TD
  A([Charge]) --> B[Amount]
  B --> C[Asset USDC / XLM / ROJOS]
  C --> D[Memo / note]
  D --> E[Optional ROJOS reward]
  E --> F[Serialize payload]
  F --> G[Show QR + text]
  G --> H([Customer pays with ScanAndPay])
  H --> I([Merchant sees inflow in activity])`,
  },
  {
    file: '09-agregar-fondos',
    title: '9. Add funds',
    caption: 'Home → Add sheet. Four funding rails.',
    mermaid: `flowchart TD
  A([Add]) --> B{Method}
  B -->|MoneyGram| C[SEP-24 cash rail]
  B -->|Visa/MC card| D[SEP-24 card rail]
  B -->|SINPE Movil| E[Code sc…ts + phone]
  B -->|On-chain| F[QR / copy public key]
  C --> G([USDC in wallet])
  D --> G
  E --> H([ROJOS credited])
  F --> I([XLM/USDC/ROJOS by transfer])`,
  },
  {
    file: '10-sep24',
    title: '10. SEP-24 USDC deposit',
    caption:
      'MoneyGram cash or card. Requires a USDC trustline. The interactive anchor runs through server-side SEP-10/24.',
    mermaid: `flowchart TD
  A([Pick rail]) --> B{USDC trustline?}
  B -->|No| C[Open trustline]
  B -->|Yes| D[Start deposit]
  C --> D
  D --> E[SEP-10 server signing]
  E --> F[SEP-24 interactive session]
  F --> G[User completes the anchor]
  G --> H[Poll transaction]
  H --> I{Terminal status?}
  I -->|completed| J([Refresh USDC balance])
  I -->|error| K([Show error])
  I -->|pending| H`,
  },
  {
    file: '11-sinpe-cliente',
    title: '11. SINPE Movil top-up (customer)',
    caption:
      'Parity CRC 1,000 = 1 ROJO. Promo CRC 9,000 = 10 ROJOS. If the SMS has no account code, the deposit waits for a manual match.',
    mermaid: `flowchart TD
  A([SINPE Movil]) --> B[Show phone and code sc…ts]
  B --> C[User transfers via SINPE]
  C --> D[Webhook / SMS parsed]
  D --> E{Account code recognized?}
  E -->|Yes| F[Calculate ROJOS]
  F --> G[Credit on Stellar]
  G --> H([Shows in SINPE top-ups])
  E -->|No| I[PENDING_MANUAL_MATCH]
  I --> J{Customer claim?}
  J -->|Yes| K[Claim with receipt]
  K --> L{Match?}
  L -->|Yes| F
  L -->|No| M([SINPE desk assigns])
  J -->|No| M`,
  },
  {
    file: '12-tarjeta-virtual',
    title: '12. Virtual Visa',
    caption:
      'Rain Cards-style sandbox. Spendable balance is the Stellar account USDC. PAN/CVV only after Reveal details (20 s).',
    mermaid: `flowchart TD
  A([/card]) --> B{Has a card?}
  B -->|No| C[Issue card]
  C --> D[Bind to custodial public key]
  D --> E[Show card face and balance]
  B -->|Yes| E
  E --> F{Action}
  F -->|Reveal details| G[GET secure-details]
  G --> H([PAN/CVV for 20 seconds])
  F -->|Freeze / unfreeze| I[Change status]
  F -->|Apple / Google Pay| J[Wallet sandbox sheet]
  F -->|Deposit USDC| K[SEP-24 card]
  F -->|POS| L([POS simulator])`,
  },
  {
    file: '13-pos',
    title: '13. POS simulator',
    caption:
      'Sandbox Visa charge. If funds exist they are debited on Testnet to treasury. Frozen card or insufficient funds = declined.',
    mermaid: `flowchart TD
  A([Simulate charge]) --> B[Merchant + amount + USDC/XLM]
  B --> C[POST simulate-transaction]
  C --> D{Card active?}
  D -->|Frozen| E([Declined])
  D -->|Yes| F{Enough balance?}
  F -->|No| E
  F -->|Yes| G[Stellar payment to treasury]
  G --> H{Horizon OK?}
  H -->|Yes| I([Approved + txHash])
  H -->|No| E`,
  },
  {
    file: '14-mapa-cliente',
    title: '14. Map — Customer / Admin',
    caption: 'Pins for published venues. Filter by category or ROJOS promo.',
    mermaid: `flowchart TD
  A([/map]) --> B[Load published venues]
  B --> C[Dark Leaflet map]
  C --> D{Filter}
  D -->|Type| E[Hotel, restaurant, etc.]
  D -->|Promo| F[Story / purchase / USDC]
  D -->|All| C
  E --> G[Tap pin]
  F --> G
  G --> H([Card: name, address, promos, accepts ROJOS])`,
  },
  {
    file: '15-mapa-empresa',
    title: '15. Publish venue — Merchant',
    caption: 'Nominatim geocoding. ROJOS promos are visible to customers on the map.',
    mermaid: `flowchart TD
  A([Merchant map]) --> B[Name, category, note]
  B --> C[Search address]
  C --> D[Pick result or drop pin]
  D --> E[Accepts ROJOS?]
  E --> F[Promos: story / purchase / USDC]
  F --> G[Save venue]
  G --> H([Visible to customers])
  A --> I[Delete venue]
  I --> J([Removed from the map])`,
  },
  {
    file: '16-rwa-aprender',
    title: '16. RWA — Learn',
    caption:
      'Education and FAQ. Tokenization is merchant/admin only. Customers go to the marketplace.',
    mermaid: `flowchart TD
  A([/rwa]) --> B[Education content + FAQ]
  A --> C{Has holdings?}
  C -->|Yes| D[Portfolio summary]
  A --> E{Role}
  E -->|Merchant or admin| F[Tokenize my asset]
  E -->|Customer| G[Explore opportunities only]
  F --> H([/rwa/tokenizar])
  G --> I([/rwa/invertir])
  D --> J([/rwa/dividendos])`,
  },
  {
    file: '17-rwa-tokenizar',
    title: '17. RWA — Tokenize asset',
    caption:
      'Five-step wizard. The file lands in audit for the structuring panel.',
    mermaid: `flowchart TD
  A([Wizard]) --> B[1 Asset profile]
  B --> C[2 Type-specific form]
  C --> D[3 Legal backing and documents]
  D --> E[4 Params: raise, APY, frequency]
  E --> F[5 Summary]
  F --> G{Validation OK?}
  G -->|No| H([Fix the step])
  G -->|Yes| I[Submit request]
  I --> J([pending_audit])
  J --> K([Admin reviews in panel])`,
  },
  {
    file: '18-rwa-invertir',
    title: '18. RWA — Marketplace',
    caption: 'Buy with wallet USDC. Enforces minimum, remaining capacity, and the asset token trustline.',
    mermaid: `flowchart TD
  A([/rwa/invertir]) --> B[Published listings]
  B --> C[Compare APY / capacity / yield]
  C --> D[Open detail]
  D --> E[Investment amount]
  E --> F{>= min and <= capacity?}
  F -->|No| G([Min/capacity error])
  F -->|Yes| H{Enough USDC?}
  H -->|No| I([Go to Add funds])
  H -->|Yes| J[Invest]
  J --> K([txHash + holding])`,
  },
  {
    file: '19-rwa-dividendos',
    title: '19. RWA — Portfolio and dividends',
    caption: 'Invested capital, estimated yield, and claiming pending dividends.',
    mermaid: `flowchart TD
  A([/rwa/dividendos]) --> B[View holdings and charts]
  B --> C{Pending dividends?}
  C -->|Yes| D[Claim]
  D --> E{OK?}
  E -->|Yes| F([claimedDividendsUsd updated])
  E -->|No| G([Show error])
  C -->|No| H([View only])`,
  },
  {
    file: '20-rwa-estructuracion',
    title: '20. RWA — Structuring panel',
    caption: 'Admin only. Audit → legal → approve (marketplace) or reject.',
    mermaid: `flowchart TD
  A([Files]) --> B[Filter by status]
  B --> C[Open request]
  C --> D{Action}
  D -->|Audit OK| E[legal_review]
  D -->|RUGM data / contract hash| F[Save legal]
  D -->|Approve| G[approved + marketplace listing]
  D -->|Reject| H[rejected + reason]
  E --> C
  F --> C`,
  },
  {
    file: '21-admin',
    title: '21. Super admin / Distributor',
    caption:
      'Admin home: finance, merchants, customers, RWA, and SINPE. Event staff do not use this panel.',
    mermaid: `flowchart TD
  A([Admin home]) --> B{Tab}
  B -->|Finance| C[Distributor balances and issuance]
  B -->|Merchants| D[List + merchant detail]
  B -->|Customers| E[List + payment activity]
  B -->|RWA| F[Tokenization files]
  B -->|SINPE| G[Unassigned + claim lookup]
  G --> H[Assign deposit to account]
  H --> I([Credit ROJOS])`,
  },
  {
    file: '22-caja',
    title: '22. Event cash desk',
    caption:
      'Cashier role. Takes colones, finds the account, and credits ROJOS at the same SINPE parity.',
    mermaid: `flowchart TD
  A([Cash desk]) --> B[Search user]
  B --> C[Select account]
  C --> D[Enter colones]
  D --> E[Preview ROJOS]
  E --> F{Confirm credit?}
  F -->|No| D
  F -->|Yes| G[Credit ROJOS]
  G -->|OK| H([Credit history])
  G -->|Error| I([Show error])
  A --> J[Can also see unassigned SINPE deposits]`,
  },
  {
    file: '23-mesa-sinpe',
    title: '23. SINPE desk',
    caption:
      'sinpe_ops role. Same assignment tool as admin, without the rest of the panel.',
    mermaid: `flowchart TD
  A([SINPE desk]) --> B[List PENDING_MANUAL_MATCH]
  B --> C[Search by SMS / receipt / sc…ts]
  C --> D[Pick deposit]
  D --> E[Search destination user]
  E --> F[Assign]
  F --> G[Calculate ROJOS and credit]
  G --> H([Deposit closed])
  A --> I[Claim lookup]
  I --> J([View related tx or deposit])`,
  },
  {
    file: '24-perfil',
    title: '24. Profile and sign out',
    caption: 'Account details, SINPE code when applicable, public key, and logout.',
    mermaid: `flowchart TD
  A([/profile]) --> B[Email and role]
  B --> C{Role}
  C -->|Merchant| D[Show published venue]
  C -->|Customer/Merchant| E[SINPE code]
  C -->|Anyone| F[Public key + copy]
  C -->|Customer/Merchant/Admin| G[Shortcut to RWA]
  A --> H[Sign out]
  H --> I[Invalidate cookie]
  I --> J([/login])`,
  },
]

const THEME = `%%{init: {"theme": "neutral", "themeVariables": {"background": "#ffffff"}}}%%\n`

function withTheme(source) {
  return THEME + source
}

async function fetchPng(source) {
  const themed = withTheme(source)
  const encoded = Buffer.from(themed, 'utf8').toString('base64url')
  const ink = await fetch(`https://mermaid.ink/img/${encoded}?type=png&bgColor=!white`)
  if (ink.ok) {
    return Buffer.from(await ink.arrayBuffer())
  }
  throw new Error(`Render failed: mermaid.ink ${ink.status}`)
}

await mkdir(outDir, { recursive: true })
await mkdir(mermaidDir, { recursive: true })

for (const d of diagrams) {
  await writeFile(join(mermaidDir, `${d.file}.mmd`), d.mermaid, 'utf8')
  process.stdout.write(`Rendering ${d.file}...\n`)
  const png = await fetchPng(d.mermaid)
  await writeFile(join(outDir, `${d.file}.png`), png)
}

const manifest = diagrams.map((d) => ({
  file: d.file,
  title: d.title,
  caption: d.caption,
  png: join(outDir, `${d.file}.png`),
}))
await writeFile(join(root, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`Rendered ${diagrams.length} diagrams`)
