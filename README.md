# SecretsPay

**SecretsPay** is a Web2.5 Stellar dApp (`Secretspay-stellar-daap`) for **Stellar Testnet**: **customer** and **merchant** wallets, QR payments, the **ROJOS** loyalty token, **SINPE recargas**, and **event bar** ordering.

Repository: [github.com/Isaac2399/Secretspay-stellar-daap](https://github.com/Isaac2399/Secretspay-stellar-daap)

This is not a mainnet app and not a bank. Balances are test funds (Friendbot / Horizon Testnet).

```bash
git clone https://github.com/Isaac2399/Secretspay-stellar-daap.git
cd Secretspay-stellar-daap
```

## MVP (this phase)

Customer and merchant accounts share a short bottom nav: **Inicio**, **Evento**, **Perfil**.

**Not in the MVP nav** (routes still exist in the codebase for later phases):

- `/card` — virtual Visa sandbox
- `/map` — merchant map
- `/rwa` — RWA learn / tokenize / invest (admin can still open RWA from Perfil)

## What it does

On sign-up, the server creates a Stellar keypair, funds it on Testnet, and stores the secret **encrypted** (custodial). The browser never sees the private key.

| Role | In the MVP app |
| --- | --- |
| **Customer** | Balances (ROJOS, XLM, USDC), send, pay with QR, SINPE recargas, **order at the event bar**, activity |
| **Merchant** | Same wallet features, plus **charge** (invoice QR) and **event bar** catalog, order queue, and TV display |
| **Cashier** | Event cash desk |
| **SINPE desk** | Match unassigned SINPE deposits |
| **Admin** | Distributor / ops panel |

Routes:

- `/login`, `/register` — guests
- `/` — home (wallet dashboard)
- `/event` — event bar (customer menu or merchant catalog/orders)
- `/event/display/:merchantId` — public TV board for a venue (no app login)
- `/profile` — session and public key

## Stack

- **Frontend:** Vite, React 19, TypeScript, Tailwind v4, React Router
- **Stellar:** `@stellar/stellar-sdk`, Horizon Testnet
- **API:** the same code in `server/` runs in the Vite plugin (`npm run dev`) and as Vercel functions (`api/`)
- **Users:** `data/users.json` locally; **Vercel KV** in production (it does not share your local JSON)

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:5173` and create an account (Friendbot plus the ROJOS trustline can take a few seconds).

On Windows, if PowerShell blocks `npm`:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

## Environment

Copy `.env.example`. The important ones:

| Variable | Purpose |
| --- | --- |
| `VITE_STELLAR_NETWORK` | `TESTNET` (recommended) |
| `VITE_HORIZON_URL` | `https://horizon-testnet.stellar.org` |
| `VITE_LOYALTY_CODE` / `VITE_LOYALTY_ISSUER` | Loyalty asset (defaults to ROJOS on Testnet) |
| `SESSION_SECRET` | Session cookie signing and secret-key encryption |
| `SEP24_HOME_DOMAIN` | SEP-24 anchor. Default `testanchor.stellar.org`. MoneyGram sandbox (`extmgxanchor.moneygram.com`) requires allowlisting |
| `KV_REST_API_*` | Vercel only, to persist users |

Do not commit `.env.local` or secret keys (`S…`).

## Layout

```
src/                 UI, auth, Stellar (balances, payments, SEP-24 client), event bar, cards
server/              Auth, custodial payments, events, SINPE, card issuing sandbox, SEP-10/24, places, KV
api/                 Vercel entry files that call server/vercelHandler.ts
docs/flujos          Feature flowcharts (Mermaid + PNG + Word)
data/users.json      Local users (not for production)
data/cards.json      Local cards + settlement history (not for production)
```

HTTP routing lives in `server/dispatchApi.ts`. Locally it is mounted by `server/authPlugin.ts`. On Vercel, each file under `api/` re-exports the same handler.

## Event bar

Customers pick a venue, order from the catalog, pay in the app (ROJOS / Testnet), and show a pickup QR.

Merchants maintain products, mark orders ready, and can open `/event/display/:merchantId` on a TV.

API prefix: `/api/events/*` (`api/events/[action].ts` on Vercel).

## Deploy (Vercel)

- The framework is **Vite**, not Next.js.
- **Production** usually tracks `main`; `dev` gets Preview deployments.
- Create a **KV Store** and set `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
- Accounts in your local `users.json` **do not exist** in KV — register again on the deployed URL.
- Session cookies are `Secure` when `VERCEL=1`.

## SINPE recargas

Customers send a SINPE Móvil transfer; staff match SMS / unassigned deposits and credit ROJOS on Testnet. Keep staff passwords out of git; set `CASHIER_*` and `SINPE_OPS_*` on Vercel.

## SEP-24 (USDC deposit)

The **Add** button runs SEP-10 (server-side signing) and SEP-24 interactive deposit. In local and Vercel **dev**, keep `SEP24_HOME_DOMAIN=testanchor.stellar.org`: that SDF Testnet anchor simulates cash (MoneyGram-style) and card rails (limits are typically 1–10 USDC). MoneyGram Access (`extmgxanchor.moneygram.com`) needs public-key / domain allowlisting and will fail without it.

## Later phases (in the repo, off the MVP nav)

### Virtual Visa (sandbox)

`/card` issues a virtual Visa tied to the signed-in user's custodial public key. The HTTP API is a local BaaS stand-in (Rain Cards–shaped) so production can swap the provider without changing the UI:

- `POST /api/cards/issue`
- `GET /api/cards/[id]` (also `GET /api/cards/me`)
- `POST /api/cards/simulate-transaction`

`simulate-transaction` checks USDC (or XLM in the sandbox datáfono), then debits the user's Testnet wallet to the platform treasury with `@stellar/stellar-sdk`. PAN / CVV stay encrypted on the server.

Optional env: `CARD_TREASURY_SECRET_KEY`, `CARD_DAILY_LIMIT_USD`. Leave `CARD_PROVIDER` unset (sandbox).

### Map

Merchants can save a venue pin; customers can browse `/map`. Geocoding uses Nominatim (OpenStreetMap). Tiles: Carto dark.

### RWA

`/rwa` covers education, tokenization, marketplace, and dividends. Customer and merchant accounts do not see it in this MVP.

## Scripts

```bash
npm run dev      # Vite + local API
npm run build    # tsc + vite build
npm run preview  # serve the production build locally
npm run lint     # oxlint
```
