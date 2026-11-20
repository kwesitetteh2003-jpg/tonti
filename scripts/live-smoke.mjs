const base =
  process.env.TONTI_URL || "https://tonti-pastorrufus5858-5739s-projects.vercel.app";
const rounds = Number(process.env.TONTI_ROUNDS || 5);

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

async function checkSandaga(when) {
  const data = await req("/api/tontine?code=SANDAGA");
  assert(data.tontine?.code === "SANDAGA", `SANDAGA missing (${when})`);
  assert(data.tontine.seats === 2, `SANDAGA should have 2 seats (${when})`);
  assert(
    data.tontine.filled === 0 && data.tontine.members.length === 0,
    `SANDAGA should be empty 0/2 (${when}), got ${data.tontine.filled}`
  );
}

async function runRound(n) {
  await checkSandaga(`before round ${n}`);

  const awa = await req("/api/wallet", { method: "POST", body: { displayName: `Awa ${n}` } });
  const ibou = await req("/api/wallet", { method: "POST", body: { displayName: `Ibou ${n}` } });
  assert(awa.secret && ibou.secret, "wallet secrets missing");

  // Immediate follow-up reads — this is the path that used to return 401.
  const [wa, wi] = await Promise.all([
    req("/api/wallet", { secret: awa.secret }),
    req("/api/wallet", { secret: ibou.secret }),
  ]);
  assert(wa.wallet?.id === awa.wallet.id, "Awa was not registered after create");
  assert(wi.wallet?.id === ibou.wallet.id, "Ibou was not registered after create");

  const f1 = await req("/api/faucet", { method: "POST", secret: awa.secret });
  const f2 = await req("/api/faucet", { method: "POST", secret: ibou.secret });
  assert(f1.amountSat === 50000 && f2.balanceSat === 50000, "faucet failed");

  const invoice = await req("/api/invoice", {
    method: "POST",
    secret: awa.secret,
    body: { amountSat: 2000, memo: "test pay" },
  });
  assert(invoice.invoice.bolt11.startsWith("lntb"), "invoice prefix");
  const paid = await req("/api/pay", {
    method: "POST",
    secret: ibou.secret,
    body: { bolt11: invoice.invoice.bolt11 },
  });
  assert(paid.amountSat === 2000, "payment amount");

  const afterPayA = await req("/api/wallet", { secret: awa.secret });
  const afterPayB = await req("/api/wallet", { secret: ibou.secret });
  assert(afterPayA.wallet.balanceSat === 52000, `Awa after pay ${afterPayA.wallet.balanceSat}`);
  assert(afterPayB.wallet.balanceSat === 48000, `Ibou after pay ${afterPayB.wallet.balanceSat}`);

  const created = await req("/api/tontine", {
    method: "POST",
    secret: awa.secret,
    body: { name: `Circle ${n}`, contributionSat: 5000, frequency: "weekly", seats: 2 },
  });
  assert(created.tontine.code && created.tontine.code !== "SANDAGA", "need a fresh private circle");
  assert(created.tontine.filled === 1, "creator should already be a member");

  const joined = await req("/api/tontine", {
    method: "POST",
    secret: ibou.secret,
    body: { action: "join", code: created.tontine.code },
  });
  assert(joined.tontine.filled === 2, "both members should have joined");
  assert(joined.tontine.currentRound, "round should start when full");

  await req("/api/tontine", {
    method: "POST",
    secret: awa.secret,
    body: { action: "contribute", tontineId: created.tontine.id },
  });
  const after = await req("/api/tontine", {
    method: "POST",
    secret: ibou.secret,
    body: { action: "contribute", tontineId: created.tontine.id },
  });
  assert(after.tontine.rounds[0]?.paidOut === true, "first round should pay out");

  const wa2 = await req("/api/wallet", { secret: awa.secret });
  const wi2 = await req("/api/wallet", { secret: ibou.secret });
  assert(
    wa2.wallet.balanceSat + wi2.wallet.balanceSat === 100000,
    `sats not conserved: ${wa2.wallet.balanceSat} + ${wi2.wallet.balanceSat}`
  );

  await checkSandaga(`after round ${n}`);
  console.log(`ROUND ${n} OK`, {
    circle: created.tontine.code,
    payoutRound: after.tontine.rounds[0].number,
    balances: [wa2.wallet.balanceSat, wi2.wallet.balanceSat],
  });
}

console.log("live smoke", base, "rounds", rounds);
for (let n = 1; n <= rounds; n += 1) {
  await runRound(n);
}
const health = await req("/api/health");
console.log("LIVE SMOKE OK", { rounds, health });
