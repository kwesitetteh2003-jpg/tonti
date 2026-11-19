import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { eventId, getServerSecret, hashSecret, randomHex, walletIdFromSecret } from "./crypto";
import {
  applyEvent,
  currentRound,
  emptyState,
  FAUCET_COOLDOWN_MS,
  FAUCET_SATS,
  MAX_SEATS,
  MIN_SEATS,
} from "./ledger";
import { createInvoice, decodeInvoice } from "./lightning";
import { loadBlobEvents, publishBlobEvent } from "./blob-ledger";
import type { Frequency, LedgerEvent, LedgerState } from "./types";

const DATA_DIR = process.env.TONTI_DATA_DIR || path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, "ledger.json");

let memory = emptyState();
let loaded = false;
let queue: Promise<void> = Promise.resolve();

function run<T>(fn: () => Promise<T>): Promise<T> {
  const result = queue.then(fn, fn);
  queue = result.then(
    () => undefined,
    () => undefined
  );
  return result;
}

async function ensureLoaded() {
  if (loaded) return;
  const fileEvents = await readFileEvents();
  const blobEvents = await loadBlobEvents();
  const merged = mergeEvents(fileEvents, blobEvents);
  let state = emptyState();
  for (const event of merged) state = applyEvent(state, event);
  memory = state;
  loaded = true;
  const seed = seedSandaga().filter((event) => !memory.eventIds[event.id]);
  if (seed.length) await applyAndPersist(seed);
}

function mergeEvents(a: LedgerEvent[], b: LedgerEvent[]): LedgerEvent[] {
  const map = new Map<string, LedgerEvent>();
  for (const event of [...a, ...b]) map.set(event.id, event);
  return [...map.values()].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
}

async function readFileEvents(): Promise<LedgerEvent[]> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as { events?: LedgerEvent[] };
    return parsed.events ?? [];
  } catch {
    return [];
  }
}

async function persist(event: LedgerEvent) {
  try {
    const existing = await readFileEvents();
    if (!existing.some((item) => item.id === event.id)) {
      await mkdir(DATA_DIR, { recursive: true });
      existing.push(event);
      await writeFile(
        DATA_FILE,
        JSON.stringify({ events: existing }, null, 2),
        "utf8"
      );
    }
  } catch {
    // File persistence is best-effort on serverless runtimes.
  }
  await publishBlobEvent(event);
}

async function applyAndPersist(events: LedgerEvent[]) {
  for (const event of events) {
    if (memory.eventIds[event.id]) continue;
    memory = applyEvent(memory, event);
    await persist(event);
  }
}

export function seedSandaga(): LedgerEvent[] {
  const at = Date.UTC(2026, 10, 1, 12, 0, 0);
  const createdBy = "tonti";
  return [
    {
      type: "wallet_open",
      id: "seed-wallet-tonti",
      at,
      walletId: createdBy,
      secretHash: hashSecret(getServerSecret()),
      displayName: "Tonti",
    },
    {
      type: "tontine_open",
      id: "seed-tontine-sandaga",
      at: at + 1,
      tontineId: "sandaga",
      code: "SANDAGA",
      name: "Marché Sandaga",
      contributionSat: 10_000,
      frequency: "weekly",
      seats: 2,
      createdBy,
    },
  ];
}

export async function getState(): Promise<LedgerState> {
  return run(async () => {
    await ensureLoaded();
    return memory;
  });
}

export async function openWallet(displayName: string) {
  return run(async () => {
    await ensureLoaded();
    const secret = randomHex(32);
    const walletId = walletIdFromSecret(secret);
    const at = Date.now();
    await applyAndPersist([
      {
        type: "wallet_open",
        id: eventId(["wallet_open", walletId]),
        at,
        walletId,
        secretHash: hashSecret(secret),
        displayName: cleanName(displayName) || `Membre ${walletId.slice(0, 4).toUpperCase()}`,
      },
    ]);
    return { secret, walletId };
  });
}

export async function renameWallet(walletId: string, displayName: string) {
  return run(async () => {
    await ensureLoaded();
    const name = cleanName(displayName);
    if (!name) throw new Error("Enter a short name.");
    await applyAndPersist([
      {
        type: "wallet_rename",
        id: eventId(["wallet_rename", walletId, String(Date.now())]),
        at: Date.now(),
        walletId,
        displayName: name,
      },
    ]);
    return memory;
  });
}

export async function claimFaucet(walletId: string) {
  return run(async () => {
    await ensureLoaded();
    const wallet = memory.wallets[walletId];
    if (!wallet) throw new Error("Wallet not found.");
    const last = wallet.faucetAt ?? 0;
    if (Date.now() - last < FAUCET_COOLDOWN_MS) {
      const wait = Math.ceil((FAUCET_COOLDOWN_MS - (Date.now() - last)) / 60000);
      throw new Error(`The faucet is on a cooldown. Try again in about ${wait} min.`);
    }
    await applyAndPersist([
      {
        type: "faucet",
        id: eventId(["faucet", walletId, String(wallet.faucetAt ?? 0)]),
        at: Date.now(),
        walletId,
        amountSat: FAUCET_SATS,
      },
    ]);
    return { amountSat: FAUCET_SATS, balanceSat: memory.balances[walletId] ?? 0 };
  });
}

export async function issueInvoice(walletId: string, amountSat: number, memo: string) {
  return run(async () => {
    await ensureLoaded();
    if (!memory.wallets[walletId]) throw new Error("Wallet not found.");
    const built = createInvoice({ amountSat, memo: memo || "Tonti" });
    await applyAndPersist([
      {
        type: "invoice_open",
        id: eventId(["invoice_open", built.paymentHash]),
        at: Date.now(),
        paymentHash: built.paymentHash,
        paymentSecret: built.paymentSecret,
        preimage: built.preimage,
        amountSat,
        memo: (memo || "Tonti").slice(0, 120),
        bolt11: built.bolt11,
        expiresAt: built.expiresAt,
        payeeId: walletId,
      },
    ]);
    return memory.invoices[built.paymentHash];
  });
}

export async function payInvoice(walletId: string, request: string) {
  return run(async () => {
    await ensureLoaded();
    const decoded = decodeInvoice(request);
    const invoice = memory.invoices[decoded.paymentHash];
    if (!invoice) {
      throw new Error(
        "This invoice was not issued on the Tonti test network. Only Tonti invoices can be paid in this demo."
      );
    }
    if (invoice.paidAt) throw new Error("This invoice has already been paid.");
    if (invoice.expiresAt < Date.now()) throw new Error("This invoice has expired.");
    if (invoice.payeeId === walletId) throw new Error("You cannot pay your own invoice.");
    const feeSat = 0;
    const balance = memory.balances[walletId] ?? 0;
    if (balance < invoice.amountSat + feeSat) {
      throw new Error("Not enough sats to pay this invoice.");
    }
    const at = Date.now();
    await applyAndPersist([
      {
        type: "payment",
        id: eventId(["payment", invoice.paymentHash]),
        at,
        paymentHash: invoice.paymentHash,
        payerId: walletId,
        payeeId: invoice.payeeId,
        amountSat: invoice.amountSat,
        feeSat,
        memo: invoice.memo,
      },
    ]);
    const paid = memory.invoices[invoice.paymentHash];
    return {
      paymentHash: paid.paymentHash,
      preimage: paid.preimage,
      amountSat: paid.amountSat,
      feeSat,
      memo: paid.memo,
      balanceSat: memory.balances[walletId] ?? 0,
    };
  });
}

export async function openTontine(
  walletId: string,
  input: {
    name: string;
    contributionSat: number;
    frequency: Frequency;
    seats: number;
  }
) {
  return run(async () => {
    await ensureLoaded();
    const name = cleanName(input.name, 40);
    if (!name) throw new Error("Give the circle a name.");
    if (!Number.isInteger(input.contributionSat) || input.contributionSat < 100) {
      throw new Error("The contribution must be at least 100 sats.");
    }
    if (input.seats < MIN_SEATS || input.seats > MAX_SEATS) {
      throw new Error(`A circle needs between ${MIN_SEATS} and ${MAX_SEATS} members.`);
    }
    const frequency = input.frequency;
    if (!["daily", "weekly", "monthly"].includes(frequency)) {
      throw new Error("Pick a daily, weekly, or monthly rhythm.");
    }
    const tontineId = randomHex(8);
    const code = makeCode();
    const at = Date.now();
    const displayName = memory.wallets[walletId]?.displayName || walletId.slice(0, 4).toUpperCase();
    await applyAndPersist([
      {
        type: "tontine_open",
        id: eventId(["tontine_open", tontineId]),
        at,
        tontineId,
        code,
        name,
        contributionSat: input.contributionSat,
        frequency,
        seats: input.seats,
        createdBy: walletId,
      },
      {
        type: "tontine_join",
        id: eventId(["tontine_join", tontineId, walletId]),
        at: at + 1,
        tontineId,
        walletId,
        displayName,
      },
    ]);
    return memory.tontines[tontineId];
  });
}

export async function joinTontine(walletId: string, code: string) {
  return run(async () => {
    await ensureLoaded();
    const tontineId = memory.codes[normalizeCode(code)];
    if (!tontineId) throw new Error("No circle uses that code.");
    const tontine = memory.tontines[tontineId];
    if (tontine.members.some((member) => member.walletId === walletId)) {
      return tontine;
    }
    if (tontine.members.length >= tontine.seats) {
      throw new Error("This circle is already full.");
    }
    await applyAndPersist([
      {
        type: "tontine_join",
        id: eventId(["tontine_join", tontineId, walletId]),
        at: Date.now(),
        tontineId,
        walletId,
        displayName: memory.wallets[walletId]?.displayName || walletId.slice(0, 4).toUpperCase(),
      },
    ]);
    return memory.tontines[tontineId];
  });
}

export async function contribute(walletId: string, tontineId: string) {
  return run(async () => {
    await ensureLoaded();
    const tontine = memory.tontines[tontineId];
    if (!tontine) throw new Error("Circle not found.");
    if (!tontine.members.some((member) => member.walletId === walletId)) {
      throw new Error("Join this circle before contributing.");
    }
    const round = currentRound(tontine);
    if (!round) throw new Error("This circle has finished every round.");
    if (round.contributions.some((item) => item.walletId === walletId)) {
      throw new Error("You have already contributed to this round.");
    }
    if (tontine.members.length < tontine.seats) {
      throw new Error("Contributions start once every seat is filled.");
    }
    const amountSat = tontine.contributionSat;
    const built = createInvoice({
      amountSat,
      memo: `${tontine.name} · round ${round.number}`,
    });
    const at = Date.now();
    const events: LedgerEvent[] = [
      {
        type: "invoice_open",
        id: eventId(["invoice_open", built.paymentHash]),
        at,
        paymentHash: built.paymentHash,
        paymentSecret: built.paymentSecret,
        preimage: built.preimage,
        amountSat,
        memo: `${tontine.name} · round ${round.number}`,
        bolt11: built.bolt11,
        expiresAt: built.expiresAt,
        payeeId: "tonti",
      },
      {
        type: "payment",
        id: eventId(["payment", built.paymentHash]),
        at: at + 1,
        paymentHash: built.paymentHash,
        payerId: walletId,
        payeeId: "tonti",
        amountSat,
        feeSat: 0,
        memo: `${tontine.name} · round ${round.number}`,
      },
      {
        type: "tontine_contribute",
        id: eventId(["tontine_contribute", tontineId, walletId, String(round.number)]),
        at: at + 2,
        tontineId,
        walletId,
        paymentHash: built.paymentHash,
        amountSat,
        round: round.number,
      },
    ];

    // Preview whether this contribution fills the round, then pay the pot out.
    const preview = events.reduce((state, event) => applyEvent(state, event), memory);
    const previewTontine = preview.tontines[tontineId];
    const previewRound = previewTontine.rounds.find((item) => item.number === round.number);
    if (
      previewRound &&
      !previewRound.paidOut &&
      previewRound.contributions.length === previewTontine.members.length
    ) {
      const pot = previewTontine.contributionSat * previewTontine.members.length;
      const payout = createInvoice({
        amountSat: pot,
        memo: `${tontine.name} · payout round ${round.number}`,
      });
      events.push(
        {
          type: "invoice_open",
          id: eventId(["invoice_open", payout.paymentHash]),
          at: at + 3,
          paymentHash: payout.paymentHash,
          paymentSecret: payout.paymentSecret,
          preimage: payout.preimage,
          amountSat: pot,
          memo: `${tontine.name} · payout round ${round.number}`,
          bolt11: payout.bolt11,
          expiresAt: payout.expiresAt,
          payeeId: previewRound.beneficiary,
        },
        {
          type: "payment",
          id: eventId(["payment", payout.paymentHash]),
          at: at + 4,
          paymentHash: payout.paymentHash,
          payerId: "tonti",
          payeeId: previewRound.beneficiary,
          amountSat: pot,
          feeSat: 0,
          memo: `${tontine.name} · payout round ${round.number}`,
        },
        {
          type: "tontine_payout",
          id: eventId(["tontine_payout", tontineId, String(round.number)]),
          at: at + 5,
          tontineId,
          beneficiary: previewRound.beneficiary,
          paymentHash: payout.paymentHash,
          amountSat: pot,
          round: round.number,
        }
      );
    }

    const payerBalance = memory.balances[walletId] ?? 0;
    if (payerBalance < amountSat) throw new Error("Not enough sats to contribute.");
    await applyAndPersist(events);
    return memory.tontines[tontineId];
  });
}

function cleanName(value: string, max = 24): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function makeCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  if (memory.codes[code]) return makeCode();
  return code;
}
