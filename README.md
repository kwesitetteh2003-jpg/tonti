# Tonti

Tonti is a Lightning wallet and rotating savings circle for tontines (and susu groups) in West Africa. Members contribute each round. When every member has paid, the pot is sent automatically to the member whose turn it is.

This demo runs on a **Lightning test network**. There are no real bitcoin and no mainnet funds. Invoices use the standard BOLT11 format and are settled by Tonti's test node.

Live demo: https://tonti-pastorrufus5858-5739s-projects.vercel.app

## Why this exists

Rotating savings circles are already how many traders and families in Dakar, Accra, Abidjan and beyond put money aside. The usual problems are cash that goes missing, arguments about who paid, and payouts that arrive late. Tonti keeps the same familiar ritual, on a phone, with instant Lightning payments and a ledger every member can see.

Primary user: a market trader or household member who already belongs to a tontine and has a mid-range Android phone. A USSD-style flow is included for people who are used to Orange Money or Wave on a feature phone.

## Try the demo

1. Open the site on your phone.
2. Create a wallet and tap **Get test sats**.
3. Open a second phone (or a private browser window), create another wallet, and get test sats there too.
4. On both phones, join the public circle with the code **SANDAGA**.
5. When both seats are filled, each member contributes. The pot pays out automatically to the first member, then the second.

You can also start your own circle and share its code, or try the USSD demo at `/ussd` by dialing `*808#`.

Amounts can be shown in XOF, GHS, USD, or sats. The interface is available in French and English.

## One-command setup

```bash
cp .env.example .env.local
# optional: set TONTI_SECRET to a 32-byte hex string
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

```bash
npm run build && npm start
```

builds the production app.

## Architecture

```
[Phone A]                  [Phone B]
   |                          |
   |  create / pay invoice    |
   +---------->[Tonti API]<---+
                  |
       +----------+-----------+
       |                      |
  Test Lightning node    Event ledger
  (BOLT11 invoices)      (file + Nostr relays)
       |                      |
       +---- tontine escrow --+
              (system wallet)
```

- Each wallet is a 32-byte key stored only on the phone. The server stores a hash of that key, never the key itself.
- Payments are BOLT11 invoices signed by the Tonti test node and settled on the test ledger.
- Tontine contributions go to a system escrow wallet, then pay out in a single Lightning payment when the round is complete.
- The ledger is event-sourced. Events are written to a local JSON file in development and to a private Vercel Blob store in production, so two phones can share the same test network.

## Security notes

- This is a custodial test network. Do not use it with real funds.
- A PIN, if set, never leaves the phone. It only encrypts access to the local wallet key.
- No phone numbers, emails, or legal names are required. Display names are optional nicknames.
- API logs do not print wallet keys, PINs, or payment preimages.
- Faucet credits are rate-limited. Invoice amounts are capped. Inputs are validated before any ledger write.
- External (non-Tonti) invoices are decoded but not paid, so the demo cannot send value outside the test network.

## Constraints

- Test network only. Not connected to Bitcoin mainnet or a public Lightning gossip graph.
- Set `TONTI_SECRET` so the test Lightning node key stays stable across deploys, and set `BLOB_READ_WRITE_TOKEN` so the ledger survives serverless restarts.
- FX rates come from mempool.space and a public USD table, cached for ten minutes, with a fallback if the network is slow.
- A circle starts collecting only when every seat is filled.

## Metrics worth tracking later

- Circles started and circles that complete every round.
- Time from last seat filled to first payout.
- Share of users who return for a second contribution.
- USSD-flow completions versus the visual app.
- Failed payments and faucet abuse.

## Next

- Connect a Mutinynet or signet Lightning node so invoices can be paid from any compatible test wallet.
- Optional mobile-money cash-out instructions (Wave, Orange Money, MTN MoMo) after a payout.
- A treasurer view and dispute log.
- SMS or USSD through a real aggregator, not only the on-screen demo.
- Export of the ledger for a circle, so members can print or share it.

## License

MIT. Built by Rufus Worlanyo for the Dakar Bitcoin Hack.
