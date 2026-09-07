# Stellar Pay

A Web2.5 wallet for **Stellar Testnet**: **customer** and **merchant** accounts, QR payments, the **ROJOS** loyalty token, a store map, and SEP-24 USDC deposits.

This is not a mainnet app and not a bank. Balances are test funds (Friendbot / Horizon Testnet).

## What it does

On sign-up, the server creates a Stellar keypair, funds it on Testnet, and stores the secret **encrypted** (custodial). The browser never sees the private key.

| Role | In the app |
| --- | --- |
| **Customer** | Balances (ROJOS, XLM, USDC), send, pay with QR, **virtual Visa**, activity, USDC on-ramp (SEP-24), browse merchants on the map |
| **Merchant** | Same wallet features, plus **charge** (invoice QR) and **publish a venue** (address, category, map pin) |

Routes:

- `/login`, `/register` — guests
- `/` — home (dashboard)
- `/card` — virtual Visa (issue, freeze, limits, POS sandbox)
- `/map` — map (merchants publish; customers filter by type)
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
src/                 UI, auth, Stellar (balances, payments, SEP-24 client), cards
server/              Auth, custodial payments, card issuing sandbox, SEP-10/24, places, KV
api/                 Vercel entry files that call server/vercelHandler.ts
data/users.json      Local users (not for production)
data/cards.json      Local cards + settlement history (not for production)
```

HTTP routing lives in `server/dispatchApi.ts`. Locally it is mounted by `server/authPlugin.ts`. On Vercel, each file under `api/` re-exports the same handler.

## Deploy (Vercel)

- The framework is **Vite**, not Next.js.
- **Production** usually tracks `main`; `dev` gets Preview deployments.
- Create a **KV Store** and set `KV_REST_API_URL` and `KV_REST_API_TOKEN`.
- Accounts in your local `users.json` **do not exist** in KV — register again on the deployed URL.
- Session cookies are `Secure` when `VERCEL=1`.

## SEP-24 (USDC deposit)

The **Add** button runs SEP-10 (server-side signing) and SEP-24 interactive deposit. In local and Vercel **dev**, keep `SEP24_HOME_DOMAIN=testanchor.stellar.org`: that SDF Testnet anchor simulates cash (MoneyGram-style) and card rails (limits are typically 1–10 USDC). MoneyGram Access (`extmgxanchor.moneygram.com`) needs public-key / domain allowlisting and will fail without it.

## Virtual Visa (sandbox)

`/card` issues a virtual Visa tied to the signed-in user's custodial public key. The HTTP API is a local BaaS stand-in (Rain Cards–shaped) so production can swap the provider without changing the UI:

- `POST /api/cards/issue`
- `GET /api/cards/[id]` (also `GET /api/cards/me`)
- `POST /api/cards/simulate-transaction`

`simulate-transaction` checks USDC (or XLM in the sandbox datáfono), then debits the user's Testnet wallet to the platform treasury with `@stellar/stellar-sdk`. Approved charges store the Horizon `txHash` and a StellarExpert link. Insufficient funds, a frozen card, or a network error become a declined authorization.

PAN / CVV stay encrypted on the server. The browser only receives them from `GET /api/cards/[id]/secure-details` after **Ver detalles**. Secret keys never go to the client.

The same `/api/cards/:action` function runs in `npm run dev`, `npm run preview`, Vercel Preview, and Production (one dynamic function, like SEP-24, to stay under the Hobby limit). Nested paths such as `/api/cards/:id/freeze` still work locally; the UI uses single-segment routes (`/api/cards/freeze?` / body `cardId`) so Vercel can resolve them.

Optional env: `CARD_TREASURY_SECRET_KEY` (otherwise the server creates a Friendbot treasury), `CARD_DAILY_LIMIT_USD`. Leave `CARD_PROVIDER` unset (sandbox). Set `CARD_PROVIDER=rain` only when the production adapter is wired.

## Map

Merchants save a name, category (hotel, restaurant, and so on), address, and coordinates. Customers see pins and can filter by type. Geocoding uses Nominatim (OpenStreetMap). Tiles: Carto dark.

## Scripts

```bash
npm run dev      # Vite + local API
npm run build    # tsc + vite build
npm run preview  # serve the production build locally
npm run lint     # oxlint
```
