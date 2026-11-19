export type Currency = "XOF" | "GHS" | "USD" | "sats";

export type Frequency = "daily" | "weekly" | "monthly";

export type Wallet = {
  id: string;
  secretHash: string;
  createdAt: number;
  displayName: string;
  faucetAt: number | null;
};

export type Invoice = {
  paymentHash: string;
  paymentSecret: string;
  preimage: string;
  amountSat: number;
  memo: string;
  bolt11: string;
  createdAt: number;
  expiresAt: number;
  paidAt: number | null;
  payeeId: string;
  payerId: string | null;
};

export type Payment = {
  id: string;
  at: number;
  walletId: string;
  direction: "in" | "out";
  amountSat: number;
  feeSat: number;
  paymentHash: string;
  memo: string;
  counterparty: string | null;
};

export type TontineMember = {
  walletId: string;
  displayName: string;
  seat: number;
  joinedAt: number;
};

export type Contribution = {
  walletId: string;
  paymentHash: string;
  amountSat: number;
  at: number;
};

export type TontineRound = {
  number: number;
  beneficiary: string;
  contributions: Contribution[];
  paidOut: boolean;
  payoutHash: string | null;
  paidOutAt: number | null;
};

export type Tontine = {
  id: string;
  code: string;
  name: string;
  contributionSat: number;
  frequency: Frequency;
  seats: number;
  createdBy: string;
  createdAt: number;
  members: TontineMember[];
  payoutOrder: string[];
  rounds: TontineRound[];
};

export type Rates = {
  btcUsd: number;
  usdXof: number;
  usdGhs: number;
  updatedAt: number;
};

export type LedgerEvent =
  | {
      type: "wallet_open";
      id: string;
      at: number;
      walletId: string;
      secretHash: string;
      displayName: string;
    }
  | {
      type: "wallet_rename";
      id: string;
      at: number;
      walletId: string;
      displayName: string;
    }
  | {
      type: "faucet";
      id: string;
      at: number;
      walletId: string;
      amountSat: number;
    }
  | {
      type: "invoice_open";
      id: string;
      at: number;
      paymentHash: string;
      paymentSecret: string;
      preimage: string;
      amountSat: number;
      memo: string;
      bolt11: string;
      expiresAt: number;
      payeeId: string;
    }
  | {
      type: "payment";
      id: string;
      at: number;
      paymentHash: string;
      payerId: string;
      payeeId: string;
      amountSat: number;
      feeSat: number;
      memo: string;
    }
  | {
      type: "tontine_open";
      id: string;
      at: number;
      tontineId: string;
      code: string;
      name: string;
      contributionSat: number;
      frequency: Frequency;
      seats: number;
      createdBy: string;
    }
  | {
      type: "tontine_join";
      id: string;
      at: number;
      tontineId: string;
      walletId: string;
      displayName: string;
    }
  | {
      type: "tontine_contribute";
      id: string;
      at: number;
      tontineId: string;
      walletId: string;
      paymentHash: string;
      amountSat: number;
      round: number;
    }
  | {
      type: "tontine_payout";
      id: string;
      at: number;
      tontineId: string;
      beneficiary: string;
      paymentHash: string;
      amountSat: number;
      round: number;
    };

export type LedgerState = {
  wallets: Record<string, Wallet>;
  balances: Record<string, number>;
  invoices: Record<string, Invoice>;
  payments: Payment[];
  tontines: Record<string, Tontine>;
  codes: Record<string, string>;
  eventIds: Record<string, true>;
  faucetLog: Record<string, number>;
};
