# PartyPay

**PartyPay** is a seamless **Web 2.5** ordering and payment platform designed to solve real-world bottlenecks at large-scale events. By combining the familiar user experience of a traditional app with the speed and efficiency of the **Stellar** blockchain, PartyPay eliminates long lines for guests and costly transaction fees for venues.

Users get all the benefits of decentralized finance — instant settlement and secure tokens — without ever needing to manage a crypto wallet. They simply sign up, log in with their email, browse menus, and track their orders.

| | |
| --- | --- |
| **For guests** | Top up, order from the phone, and pick up when the order is ready |
| **For venues** | Instant settlement on Stellar, without card fees on every sale |

**Production:** [https://partypay-stellar-daap.vercel.app/](https://partypay-stellar-daap.vercel.app/)

**Pitch:** [https://x.com/knegro99/status/2114735523440775243](https://x.com/knegro99/status/2114735523440775243)

**Demo:** [https://x.com/knegro99/status/2114737719913935311](https://x.com/knegro99/status/2114737719913935311)

---

## The Origin & The Problem

We identified a critical operational bottleneck firsthand while working with an **existing client who hosts bi-monthly events for 2,000 to 5,000 attendees**. We already provide this client with robust Web2 solutions for ticketing, access control, and entrance payments. However, once attendees are inside the venue, the on-site transaction experience breaks down.

Large events face two major challenges:

- **For attendees.** Inside the venue, cafeterias and bars become overcrowded. Traditional payment flows lead to long queues, excessive waiting times, and a frustrating experience.
- **For venues and vendors.** Traditional bank and credit card processors charge high transaction fees on every single food and beverage sale, severely eating into profit margins.

---

## The Solution

Our objective is to enable fast, flexible, and easily fundable payments inside the venue's cafeterias and bars.

PartyPay streamlines the on-site economy by allowing attendees to easily top up their accounts using just a local phone number (specifically via **SINPE**, Costa Rica’s national mobile transfer network).

- **Frictionless ordering.** Guests top up their accounts, order food and drinks directly from their phones, and receive notifications when their order is ready for pickup.
- **Zero card fees.** By settling payments on the Stellar network, vendors bypass traditional banking commissions, saving money on every transaction.
- **Incentives.** App users unlock exclusive discounts, driving digital adoption and reducing the burden of handling physical cash on-site.

---

## Core Features & User Journeys

Getting started is simple: users create either a **Customer** or **Business** account and log in via a standard email link.

### For customers

- **Flexible funding.** Top up before the event via **SINPE** (Costa Rica's mobile transfer network), or on-site using SINPE or cash.
- **Browse and order.** Explore active events, bars, and product menus from the phone.
- **Seamless payments.** Order and pay in seconds, or use a personal **QR code** for quick in-person transactions.
- **Peer-to-peer transfers.** Send and receive utility tokens with friends or other attendees.

### For businesses

- **Event management.** Create and customize events, bars, and product catalogs.
- **Cashier tools.** Process customer top-ups via SINPE or cash directly on the day of the event.
- **Sales and promotions.** Generate QR codes to charge customers, or optionally distribute gift tokens for promotions.
- **Queue management.** Track incoming orders in real time, mark them as **Ready**, and finalize handoffs by scanning the customer's QR code as **Delivered**.
- **Instant settlement.** Receive utility tokens instantly from every sale.

### Operational roles

To keep the event running, the platform includes specialized backend accounts:

| Role | Responsibility |
| --- | --- |
| **Super Admin** | System-wide management |
| **SINPE** | Tracking and reconciliation for bank transfers |
| **Claims** | Dispute resolution and customer support |

---

## Escrow contract

Orders, stock, and settlement go through the Soroban contract `partypay-escrow` on Stellar **testnet**. The production app uses that same testnet.

| | |
| --- | --- |
| **Contract** | [CC633M77TFTEUWK4X4R35DVUB2WXAP5WFN7ZBR2KI5BCFEMTBBX7A2S4](https://stellar.expert/explorer/testnet/contract/CC633M77TFTEUWK4X4R35DVUB2WXAP5WFN7ZBR2KI5BCFEMTBBX7A2S4) |
| **ROJOS issuer** | [GBSLP3N4R65KVUYBAKQL5XAU67ZFGTNO3WBXJXWGDCH5FM3TFBNKXPPW](https://stellar.expert/explorer/testnet/account/GBSLP3N4R65KVUYBAKQL5XAU67ZFGTNO3WBXJXWGDCH5FM3TFBNKXPPW) |
| **Contract admin** | [GC5YBV7IBI4ESSNHCZBTDCWHVOGSB2IJAHGH4Q4DVJGK6MTQSHI6WPDK](https://stellar.expert/explorer/testnet/account/GC5YBV7IBI4ESSNHCZBTDCWHVOGSB2IJAHGH4Q4DVJGK6MTQSHI6WPDK) |

The admin and the ROJOS issuer are different accounts. `checkout` takes the customer's payment, debits stock, and splits the gross in one call. The platform fee is 250 bps (2.5%), set in `initialize`. The issuer account receives nothing from that split unless it is also the fee treasury.

Vercel Production needs `ESCROW_CONTRACT_ID` and `ROJOS_DISTRIBUTOR_SECRET_KEY` (the contract admin). `LOYALTY_ISSUER` stays the ROJOS issuer above. After a new deploy, publish the event again so the menu is registered on the new contract.

```bash
cd contracts/partypay-escrow
stellar contract build
cd ../..
node scripts/deploy-escrow.mjs
```

---

## How to Run the App Locally

Requirements: [Node.js](https://nodejs.org/) and npm.

```bash
git clone https://github.com/Isaac2399/Secretspay-stellar-daap.git
cd Secretspay-stellar-daap
npm install
npm run dev
```

Then open the local URL shown in the terminal and create a test account.

Copy `.env.example` to `.env` if you need Stellar, Google sign-in, or SINPE settings. The app starts on Testnet with the defaults in that file.

---

## Roadmap

1. **Late 2026 — Halloween, then year-end.** The last months of 2026 are the first live runs with our existing client, in two steps.

   - **Halloween.** A first pilot with **10 to 50 users**. They top up with **SINPE Móvil** or **cash**, order from the phone, and the venue settles on Stellar.
   - **Year-end.** The next event grows to **50 to 100 people**. Same client, same funding (SINPE Móvil or cash), and a larger room before the year turns.

2. **2027 — More events, more users.** The audience grows from that year-end group with the next dates on the calendar. Parties such as **Valentine's Day** (Día de los Enamorados) bring back people who already used PartyPay and add new attendees on every date. Each event is another wave of on-chain payments.

3. **Costa Rica — legal path to international anchors.** **SINPE Móvil** is the funding rail for guests in Costa Rica. Completing the legal and regulatory work in Costa Rica lets us connect with anchors such as **Visa** and **MoneyGram**. Those anchors move fiat into tokens by card or cash pickup as well as by local phone transfer, so PartyPay can be used internationally.

4. **Producers, venues, and companies.** With those rails in place, PartyPay can work with other businesses and event producers, in Costa Rica and abroad, and with companies that need instant settlement, lower fees on every transaction, and the rest of what Stellar provides.
