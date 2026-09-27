# PartyPay

**PartyPay** is a seamless **Web 2.5** ordering and payment platform designed to solve real-world bottlenecks at large-scale events. By combining the familiar user experience of a traditional app with the speed and efficiency of the **Stellar** blockchain, PartyPay eliminates long lines for guests and costly transaction fees for venues.

Users get all the benefits of decentralized finance — instant settlement and secure tokens — without ever needing to manage a crypto wallet. They simply sign up, log in with their email, browse menus, and track their orders.

| | |
| --- | --- |
| **For guests** | Top up, order from the phone, and pick up when the order is ready |
| **For venues** | Instant settlement on Stellar, without card fees on every sale |
| **From day one** | A live audience of 2,000–5,000 attendees, every two months |

**Production:** [https://partypay-stellar-daap.vercel.app/](https://partypay-stellar-daap.vercel.app/)

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

## Guaranteed Traction: Beyond the Hackathon

We are building this out of a concrete, validated market need. **Whether we win this hackathon or not, we are deploying this solution for our client.**

This means that from **day zero**, PartyPay will launch with a guaranteed, recurring user base. Between **2,000 and 5,000 bi-monthly active users** will be seamlessly onboarding, funding their accounts, and executing real-world payments on the **Stellar** network.

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

---

## On-chain evidence

People outside the team have already used PartyPay on the Stellar **Testnet**. Every **ROJOS** balance is issued from this main account:

[GC5IQE74UCRCKXJII3G3AYNJHB75JGVD2TQKMDNNR2QZVLKEDVU5E4NJ](https://stellar.expert/explorer/testnet/account/GC5IQE74UCRCKXJII3G3AYNJHB75JGVD2TQKMDNNR2QZVLKEDVU5E4NJ)

These Stellar Expert transactions show payments from external users who already used the app:

- [aa2b694a01b689f5a7843554f0c6beecbae184674edc2ca63895f77dd8d23386](https://stellar.expert/explorer/testnet/tx/aa2b694a01b689f5a7843554f0c6beecbae184674edc2ca63895f77dd8d23386)
- [9441001deadaaa6ee7efa2787c87b7c54c6454f9005d7c3fc02c84027a604821](https://stellar.expert/explorer/testnet/tx/9441001deadaaa6ee7efa2787c87b7c54c6454f9005d7c3fc02c84027a604821)
