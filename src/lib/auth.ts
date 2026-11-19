import { hashSecret, safeEqualHex, walletIdFromSecret } from "./crypto";
import type { LedgerState } from "./types";

export function readSecret(request: Request): string | null {
  const header = request.headers.get("authorization") || "";
  const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;
  const alt = request.headers.get("x-tonti-key")?.trim();
  return alt || null;
}

export function walletFromSecret(state: LedgerState, secret: string) {
  const walletId = walletIdFromSecret(secret);
  const wallet = state.wallets[walletId];
  if (!wallet) return null;
  if (!safeEqualHex(wallet.secretHash, hashSecret(secret))) return null;
  return wallet;
}

export function requireWallet(state: LedgerState, request: Request) {
  const secret = readSecret(request);
  if (!secret) {
    throw Object.assign(new Error("Open or restore a wallet first."), { status: 401 });
  }
  const wallet = walletFromSecret(state, secret);
  if (!wallet) {
    throw Object.assign(new Error("This wallet is not registered on the test network."), {
      status: 401,
    });
  }
  return wallet;
}
