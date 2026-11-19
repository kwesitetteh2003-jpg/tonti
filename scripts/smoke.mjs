const base = process.env.TONTI_URL || "http://127.0.0.1:3030";

async function req(path, { method = "GET", secret, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status}: ${data.error || JSON.stringify(data)}`);
  return data;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const awa = await req("/api/wallet", { method: "POST", body: { displayName: "Awa" } });
const ibou = await req("/api/wallet", { method: "POST", body: { displayName: "Ibou" } });
console.log("wallets", awa.wallet.id, ibou.wallet.id);

const f1 = await req("/api/faucet", { method: "POST", secret: awa.secret });
const f2 = await req("/api/faucet", { method: "POST", secret: ibou.secret });
assert(f1.amountSat === 50000 && f2.balanceSat === 50000, "faucet failed");
console.log("faucet ok", f1.balanceSat, f2.balanceSat);

const invoice = await req("/api/invoice", {
  method: "POST",
  secret: awa.secret,
  body: { amountSat: 2500, memo: "market stall" },
});
assert(invoice.invoice.bolt11.startsWith("lntb"), "invoice prefix");
const dec = await req("/api/decode", { method: "POST", body: { bolt11: invoice.invoice.bolt11 } });
assert(dec.payable === true, "invoice should be payable");
const paid = await req("/api/pay", { method: "POST", secret: ibou.secret, body: { bolt11: invoice.invoice.bolt11 } });
assert(paid.amountSat === 2500, "payment amount");
assert(paid.preimage, "preimage missing");
console.log("p2p payment ok", paid.balanceSat);

const wa = await req("/api/wallet", { secret: awa.secret });
const wi = await req("/api/wallet", { secret: ibou.secret });
assert(wa.wallet.balanceSat === 52500, `Awa balance ${wa.wallet.balanceSat}`);
assert(wi.wallet.balanceSat === 47500, `Ibou balance ${wi.wallet.balanceSat}`);

const joinedA = await req("/api/tontine", { method: "POST", secret: awa.secret, body: { action: "join", code: "SANDAGA" } });
const joinedB = await req("/api/tontine", { method: "POST", secret: ibou.secret, body: { action: "join", code: "SANDAGA" } });
assert(joinedB.tontine.filled === 2, "both should have joined");
assert(joinedB.tontine.currentRound, "round should start when full");
console.log("joined SANDAGA", joinedB.tontine.currentRound.number, "beneficiary", joinedB.tontine.currentRound.beneficiary);

await req("/api/tontine", { method: "POST", secret: awa.secret, body: { action: "contribute", tontineId: joinedA.tontine.id } });
const after = await req("/api/tontine", { method: "POST", secret: ibou.secret, body: { action: "contribute", tontineId: joinedB.tontine.id } });
assert(after.tontine.rounds[0].paidOut === true, "first round should pay out");
console.log("round 1 paid out, next beneficiary", after.tontine.currentRound?.beneficiary);

const wa2 = await req("/api/wallet", { secret: awa.secret });
const wi2 = await req("/api/wallet", { secret: ibou.secret });
console.log("balances after round 1", wa2.wallet.balanceSat, wi2.wallet.balanceSat);
assert(wa2.wallet.balanceSat + wi2.wallet.balanceSat === 100000, "total sats should be conserved (2 faucets)");

const health = await req("/api/health");
const rates = await req("/api/rates");
assert(health.ok, "health");
assert(rates.btcUsd > 0 && rates.usdXof > 0, "rates");
console.log("SMOKE OK", { health, btcUsd: rates.btcUsd, usdXof: rates.usdXof });
