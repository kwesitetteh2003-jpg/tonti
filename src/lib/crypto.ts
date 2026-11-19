import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export function randomHex(bytes = 32): string {
  return randomBytes(bytes).toString("hex");
}

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacHex(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function walletIdFromSecret(secret: string): string {
  return sha256Hex(`tonti:id:${secret}`).slice(0, 16);
}

export function hashSecret(secret: string): string {
  return sha256Hex(`tonti:auth:${secret}`);
}

export function getServerSecret(): string {
  const fromEnv = process.env.TONTI_SECRET?.trim();
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  // Deterministic fallback so a single serverless instance can still sign invoices.
  // Set TONTI_SECRET in production so the node key stays stable across deploys.
  return sha256Hex("tonti-dev-secret-change-me");
}

export function eventId(parts: string[]): string {
  return sha256Hex(parts.join("|")).slice(0, 24);
}
