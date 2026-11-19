import bolt11 from "bolt11";
import { createHash, randomBytes } from "crypto";
import { getServerSecret, sha256Hex } from "./crypto";

// Tonti runs a Lightning-compatible test node. Invoices use the Bitcoin testnet
// prefix (lntb) so standard BOLT11 libraries can encode and decode them. They
// are settled by this app's test ledger, not by the public Bitcoin testnet.
const TESTNET = {
  bech32: "tb",
  pubKeyHash: 0x6f,
  scriptHash: 0xc4,
  validWitnessVersions: [0, 1],
};

export const INVOICE_EXPIRY_SECONDS = 60 * 60;

export type BuiltInvoice = {
  bolt11: string;
  paymentHash: string;
  paymentSecret: string;
  preimage: string;
  expiresAt: number;
};

export function nodePrivateKey(): string {
  return sha256Hex(`tonti:node:${getServerSecret()}`);
}

export function makePreimage(): string {
  return randomBytes(32).toString("hex");
}

export function hashPreimage(preimage: string): string {
  return createHash("sha256").update(Buffer.from(preimage, "hex")).digest("hex");
}

export function createInvoice(params: {
  amountSat: number;
  memo: string;
  preimage?: string;
  paymentSecret?: string;
  expirySeconds?: number;
  timestamp?: number;
}): BuiltInvoice {
  if (!Number.isInteger(params.amountSat) || params.amountSat < 1) {
    throw new Error("Amount must be a whole number of sats, at least 1.");
  }
  if (params.amountSat > 2_500_000) {
    throw new Error("Amount is too large for the test network.");
  }

  const preimage = params.preimage ?? makePreimage();
  const paymentHash = hashPreimage(preimage);
  const paymentSecret = params.paymentSecret ?? randomBytes(32).toString("hex");
  const expiry = params.expirySeconds ?? INVOICE_EXPIRY_SECONDS;
  const timestamp = params.timestamp ?? Math.floor(Date.now() / 1000);

  const encoded = bolt11.encode({
    network: TESTNET,
    satoshis: params.amountSat,
    timestamp,
    tags: [
      { tagName: "payment_hash", data: paymentHash },
      {
        tagName: "description",
        data: (params.memo || "Tonti").slice(0, 120),
      },
      { tagName: "expire_time", data: expiry },
      { tagName: "payment_secret", data: paymentSecret },
      { tagName: "min_final_cltv_expiry", data: 18 },
    ],
  });

  const signed = bolt11.sign(encoded, nodePrivateKey());
  if (!signed.paymentRequest) {
    throw new Error("Could not sign the Lightning invoice.");
  }

  return {
    bolt11: signed.paymentRequest,
    paymentHash,
    paymentSecret,
    preimage,
    expiresAt: (timestamp + expiry) * 1000,
  };
}

export function decodeInvoice(paymentRequest: string) {
  const raw = paymentRequest.trim().toLowerCase().replace(/^lightning:/, "");
  if (!raw.startsWith("ln")) {
    throw new Error("That does not look like a Lightning invoice.");
  }
  const decoded = bolt11.decode(raw);
  const paymentHash = tagData(decoded, "payment_hash");
  const description = String(tagData(decoded, "description") ?? "");
  const expire = Number(tagData(decoded, "expire_time") ?? INVOICE_EXPIRY_SECONDS);
  const amountSat =
    decoded.satoshis ??
    (decoded.millisatoshis ? Math.round(Number(decoded.millisatoshis) / 1000) : 0);
  const createdAt = (decoded.timestamp ?? Math.floor(Date.now() / 1000)) * 1000;
  return {
    bolt11: raw,
    paymentHash: String(paymentHash || ""),
    memo: description,
    amountSat,
    createdAt,
    expiresAt: createdAt + expire * 1000,
    network: decoded.prefix,
  };
}

function tagData(decoded: { tags?: { tagName: string; data: unknown }[] }, name: string) {
  const tag = decoded.tags?.find((item) => item.tagName === name);
  return tag?.data;
}
