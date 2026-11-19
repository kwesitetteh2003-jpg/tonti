# Devpost draft — Tonti

Do not submit, make the repository public, or post this anywhere until Rufus approves it.

Hackathon: Dakar Bitcoin Hack by BTrust
Deadline: 20 November 2026, 20:00 Accra time (UTC+0)
Devpost: https://dakar-bitcoin-hack-2026.devpost.com/

## Title

Tonti

## Tagline

A Lightning wallet and tontine circle for West Africa.

## Built with

Bitcoin, Lightning (BOLT11), Next.js, TypeScript, Vercel, Vercel Blob

## Demo

Live demo: https://tonti-pastorrufus5858-5739s-projects.vercel.app

USSD demo: https://tonti-pastorrufus5858-5739s-projects.vercel.app/ussd

Public circle code: SANDAGA

This is a Lightning test network. There are no real funds.

## What it does

Tonti is a phone-first Lightning wallet that runs a rotating savings circle the way a tontine (or susu) already works in West Africa. Everyone contributes each round. When every member has paid, the pot is sent automatically to the person whose turn it is.

A market trader or a household member can:

- Open a test Lightning wallet in a few seconds, with no phone number or email
- Receive and send sats using standard BOLT11 invoices and a QR code
- See balances in XOF, GHS, USD, or sats, in French or English
- Start a circle, or join one with a short code
- Contribute in one tap; the pot pays out over Lightning when the round is complete
- Try the same flows on a USSD-style screen at /ussd, the way people already use Orange Money or Wave on a feature phone

The public demo circle uses the code SANDAGA and has two seats, so judges can try a full contribution and payout with two phones.

## How I built it

The wallet is a custodial Lightning test node that issues and settles real BOLT11 invoices. Payments are recorded on an event-sourced ledger. In development the ledger is a local JSON file; in production it is stored as private objects in Vercel Blob, so two phones share the same test network.

Tontine contributions are paid into a system escrow wallet, then paid out in a single Lightning payment when the last member of the round contributes. The server never stores the wallet key, only a hash of it. A PIN, if the user sets one, never leaves the phone.

The interface is a mobile web app (and a small PWA) plus the USSD demo. FX rates come from mempool.space and a public USD table, with a fallback if the network is slow.

## Challenges I ran into

A public Lightning test node (Mutinynet or signet) would have let any test wallet pay Tonti invoices. Hosting a reliable node in the time available was not realistic, so Tonti runs its own test Lightning service. Invoices use the standard BOLT11 format, and only Tonti invoices can be paid in the demo. That keeps the happy path testable on any phone, without asking a judge to install a wallet first.

Keeping a shared ledger on a serverless host was the other hard part. Two phones have to see the same circle and the same balances. The event log, written to private Blob objects, is what makes that work.

## What's next

- Connect a Mutinynet or signet Lightning node so invoices can be paid from any compatible test wallet
- Optional mobile-money cash-out steps after a payout (Wave, Orange Money, MTN MoMo)
- A treasurer view and a simple dispute log
- A real USSD or SMS channel, not only the on-screen demo
- A printable ledger export for members of a circle

## Required submission items

- Presentation: this text (a video is optional; the rules allow a text presentation)
- Public GitHub repository: the repo is private until Rufus approves making it public
- MVP on the internet: the Vercel demo URL (a demo video can replace this; we have a live demo instead)
- At least a bitcoin/lightning wallet implementation: included (create, faucet, receive, send, history)

A short 3-minute demo video is not strictly required, but the judging criteria ask for one. Record it if there is time, covering: problem → solution → live two-phone payout → what's next.

## How to try it (for judges)

1. Open the demo on a phone.
2. Create a wallet and tap "Get test sats" / "Recevoir des sats de test".
3. Open a second phone or a private window, create another wallet, and get test sats there too.
4. On both phones, join the public circle with the code SANDAGA.
5. When both seats are filled, each member contributes. The pot pays out automatically.
