import type {
  Invoice,
  LedgerEvent,
  LedgerState,
  Payment,
  Tontine,
  TontineRound,
} from "./types";

export const FAUCET_SATS = 50_000;
export const FAUCET_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const MAX_SEATS = 12;
export const MIN_SEATS = 2;

export function emptyState(): LedgerState {
  return {
    wallets: {},
    balances: {},
    invoices: {},
    payments: [],
    tontines: {},
    codes: {},
    eventIds: {},
    faucetLog: {},
  };
}

export function applyEvent(state: LedgerState, event: LedgerEvent): LedgerState {
  if (state.eventIds[event.id]) return state;
  const next: LedgerState = {
    ...state,
    wallets: { ...state.wallets },
    balances: { ...state.balances },
    invoices: { ...state.invoices },
    payments: state.payments.slice(),
    tontines: { ...state.tontines },
    codes: { ...state.codes },
    eventIds: { ...state.eventIds, [event.id]: true },
    faucetLog: { ...state.faucetLog },
  };

  switch (event.type) {
    case "wallet_open": {
      if (next.wallets[event.walletId]) break;
      next.wallets[event.walletId] = {
        id: event.walletId,
        secretHash: event.secretHash,
        createdAt: event.at,
        displayName: event.displayName,
        faucetAt: null,
      };
      next.balances[event.walletId] = 0;
      break;
    }
    case "wallet_rename": {
      const wallet = next.wallets[event.walletId];
      if (!wallet) break;
      next.wallets[event.walletId] = { ...wallet, displayName: event.displayName };
      break;
    }
    case "faucet": {
      credit(next, event.walletId, event.amountSat);
      const wallet = next.wallets[event.walletId];
      if (wallet) next.wallets[event.walletId] = { ...wallet, faucetAt: event.at };
      next.faucetLog[event.walletId] = event.at;
      record(next, {
        id: event.id,
        at: event.at,
        walletId: event.walletId,
        direction: "in",
        amountSat: event.amountSat,
        feeSat: 0,
        paymentHash: `faucet:${event.id}`,
        memo: "Test faucet",
        counterparty: "Tonti",
      });
      break;
    }
    case "invoice_open": {
      next.invoices[event.paymentHash] = {
        paymentHash: event.paymentHash,
        paymentSecret: event.paymentSecret,
        preimage: event.preimage,
        amountSat: event.amountSat,
        memo: event.memo,
        bolt11: event.bolt11,
        createdAt: event.at,
        expiresAt: event.expiresAt,
        paidAt: null,
        payeeId: event.payeeId,
        payerId: null,
      };
      break;
    }
    case "payment": {
      const invoice = next.invoices[event.paymentHash];
      if (!invoice || invoice.paidAt) break;
      if ((next.balances[event.payerId] ?? 0) < event.amountSat + event.feeSat) break;
      debit(next, event.payerId, event.amountSat + event.feeSat);
      credit(next, event.payeeId, event.amountSat);
      const paid: Invoice = {
        ...invoice,
        paidAt: event.at,
        payerId: event.payerId,
      };
      next.invoices[event.paymentHash] = paid;
      record(next, {
        id: `${event.id}:out`,
        at: event.at,
        walletId: event.payerId,
        direction: "out",
        amountSat: event.amountSat,
        feeSat: event.feeSat,
        paymentHash: event.paymentHash,
        memo: event.memo,
        counterparty: event.payeeId,
      });
      record(next, {
        id: `${event.id}:in`,
        at: event.at,
        walletId: event.payeeId,
        direction: "in",
        amountSat: event.amountSat,
        feeSat: 0,
        paymentHash: event.paymentHash,
        memo: event.memo,
        counterparty: event.payerId,
      });
      break;
    }
    case "tontine_open": {
      if (next.tontines[event.tontineId] || next.codes[event.code]) break;
      next.tontines[event.tontineId] = {
        id: event.tontineId,
        code: event.code,
        name: event.name,
        contributionSat: event.contributionSat,
        frequency: event.frequency,
        seats: event.seats,
        createdBy: event.createdBy,
        createdAt: event.at,
        members: [],
        payoutOrder: [],
        rounds: [],
      };
      next.codes[event.code] = event.tontineId;
      break;
    }
    case "tontine_join": {
      const tontine = next.tontines[event.tontineId];
      if (!tontine) break;
      if (tontine.members.some((member) => member.walletId === event.walletId)) break;
      if (tontine.members.length >= tontine.seats) break;
      const members = [
        ...tontine.members,
        {
          walletId: event.walletId,
          displayName: event.displayName,
          seat: tontine.members.length + 1,
          joinedAt: event.at,
        },
      ];
      const payoutOrder = [...tontine.payoutOrder, event.walletId];
      const rounds =
        members.length === tontine.seats && tontine.rounds.length === 0
          ? [newRound(1, payoutOrder[0])]
          : tontine.rounds;
      next.tontines[event.tontineId] = {
        ...tontine,
        members,
        payoutOrder,
        rounds,
      };
      break;
    }
    case "tontine_contribute": {
      const tontine = next.tontines[event.tontineId];
      if (!tontine) break;
      const current = currentRound(tontine);
      if (!current || current.number !== event.round || current.paidOut) break;
      if (current.contributions.some((item) => item.walletId === event.walletId)) break;
      next.tontines[event.tontineId] = {
        ...tontine,
        rounds: tontine.rounds.map((round) =>
          round.number === event.round
            ? {
                ...round,
                contributions: [
                  ...round.contributions,
                  {
                    walletId: event.walletId,
                    paymentHash: event.paymentHash,
                    amountSat: event.amountSat,
                    at: event.at,
                  },
                ],
              }
            : round
        ),
      };
      break;
    }
    case "tontine_payout": {
      const tontine = next.tontines[event.tontineId];
      if (!tontine) break;
      const updatedRounds = tontine.rounds.map((round) =>
        round.number === event.round
          ? {
              ...round,
              paidOut: true,
              payoutHash: event.paymentHash,
              paidOutAt: event.at,
            }
          : round
      );
      const nextNumber = event.round + 1;
      const beneficiary = tontine.payoutOrder[(nextNumber - 1) % tontine.payoutOrder.length];
      const withNext =
        nextNumber <= tontine.seats
          ? [...updatedRounds, newRound(nextNumber, beneficiary)]
          : updatedRounds;
      next.tontines[event.tontineId] = { ...tontine, rounds: withNext };
      break;
    }
  }

  return next;
}

function credit(state: LedgerState, walletId: string, amount: number) {
  state.balances[walletId] = (state.balances[walletId] ?? 0) + amount;
}

function debit(state: LedgerState, walletId: string, amount: number) {
  state.balances[walletId] = (state.balances[walletId] ?? 0) - amount;
}

function record(state: LedgerState, payment: Payment) {
  state.payments.unshift(payment);
  if (state.payments.length > 2000) state.payments.length = 2000;
}

function newRound(number: number, beneficiary: string): TontineRound {
  return {
    number,
    beneficiary,
    contributions: [],
    paidOut: false,
    payoutHash: null,
    paidOutAt: null,
  };
}

export function currentRound(tontine: Tontine): TontineRound | null {
  return tontine.rounds.find((round) => !round.paidOut) ?? null;
}

export function publicWallet(walletId: string, state: LedgerState) {
  const wallet = state.wallets[walletId];
  if (!wallet) return null;
  return {
    id: wallet.id,
    displayName: wallet.displayName,
    createdAt: wallet.createdAt,
    faucetAt: wallet.faucetAt,
    balanceSat: state.balances[walletId] ?? 0,
  };
}

export function publicTontine(tontine: Tontine, state: LedgerState) {
  const round = currentRound(tontine);
  return {
    id: tontine.id,
    code: tontine.code,
    name: tontine.name,
    contributionSat: tontine.contributionSat,
    frequency: tontine.frequency,
    seats: tontine.seats,
    createdAt: tontine.createdAt,
    createdBy: tontine.createdBy,
    members: tontine.members.map((member) => ({
      ...member,
      displayName:
        member.displayName ||
        state.wallets[member.walletId]?.displayName ||
        shortId(member.walletId),
    })),
    payoutOrder: tontine.payoutOrder,
    currentRound: round,
    rounds: tontine.rounds,
    filled: tontine.members.length,
    complete: tontine.rounds.length >= tontine.seats && tontine.rounds.every((item) => item.paidOut),
  };
}

export function shortId(id: string): string {
  return id.slice(0, 4).toUpperCase();
}

export function publicInvoice(invoice: Invoice) {
  return {
    paymentHash: invoice.paymentHash,
    amountSat: invoice.amountSat,
    memo: invoice.memo,
    bolt11: invoice.bolt11,
    createdAt: invoice.createdAt,
    expiresAt: invoice.expiresAt,
    paid: Boolean(invoice.paidAt),
    paidAt: invoice.paidAt,
    payeeId: invoice.payeeId,
  };
}
