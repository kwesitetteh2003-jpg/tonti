import type { Currency, Rates } from "./types";

const FALLBACK: Rates = {
  btcUsd: 95000,
  usdXof: 600,
  usdGhs: 14.5,
  updatedAt: 0,
};

let cached: Rates | null = null;

export async function getRates(): Promise<Rates> {
  if (cached && Date.now() - cached.updatedAt < 10 * 60 * 1000) {
    return cached;
  }
  try {
    const [btcRes, fxRes] = await Promise.all([
      fetch("https://mempool.space/api/v1/prices", { cache: "no-store" }),
      fetch("https://open.er-api.com/v6/latest/USD", { cache: "no-store" }),
    ]);
    const btc = btcRes.ok ? await btcRes.json() : {};
    const fx = fxRes.ok ? await fxRes.json() : {};
    const next: Rates = {
      btcUsd: Number(btc.USD) || FALLBACK.btcUsd,
      usdXof: Number(fx?.rates?.XOF) || FALLBACK.usdXof,
      usdGhs: Number(fx?.rates?.GHS) || FALLBACK.usdGhs,
      updatedAt: Date.now(),
    };
    cached = next;
    return next;
  } catch {
    return cached ?? { ...FALLBACK, updatedAt: Date.now() };
  }
}

export function satsToFiat(sats: number, currency: Currency, rates: Rates): number {
  const btc = sats / 100_000_000;
  const usd = btc * rates.btcUsd;
  if (currency === "sats") return sats;
  if (currency === "USD") return usd;
  if (currency === "GHS") return usd * rates.usdGhs;
  return usd * rates.usdXof;
}

export function fiatToSats(amount: number, currency: Currency, rates: Rates): number {
  if (currency === "sats") return Math.round(amount);
  const usd =
    currency === "USD"
      ? amount
      : currency === "GHS"
        ? amount / rates.usdGhs
        : amount / rates.usdXof;
  return Math.max(1, Math.round((usd / rates.btcUsd) * 100_000_000));
}

export function formatSats(sats: number, locale = "en"): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(sats)} sats`;
}

export function formatFiat(
  sats: number,
  currency: Currency,
  rates: Rates,
  locale = "en"
): string {
  if (currency === "sats") return formatSats(sats, locale);
  const value = satsToFiat(sats, currency, rates);
  const digits = currency === "USD" ? 2 : 0;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    }).format(value);
  } catch {
    return `${value.toFixed(digits)} ${currency}`;
  }
}
