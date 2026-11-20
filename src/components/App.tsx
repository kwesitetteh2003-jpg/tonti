"use client";

import QRCode from "qrcode";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, sha256 } from "@/lib/client";
import { copy, detectLocale, type Copy, type Locale } from "@/lib/i18n";
import { formatFiat, formatSats, fiatToSats } from "@/lib/rates";
import type { Currency, Frequency, Rates } from "@/lib/types";

type View =
  | "home"
  | "send"
  | "receive"
  | "circles"
  | "circle"
  | "join"
  | "create"
  | "settings"
  | "how";

type Wallet = {
  id: string;
  displayName: string;
  createdAt: number;
  faucetAt: number | null;
  balanceSat: number;
};

type Payment = {
  id: string;
  at: number;
  direction: "in" | "out";
  amountSat: number;
  feeSat: number;
  memo: string;
};

type Circle = {
  id: string;
  code: string;
  name: string;
  contributionSat: number;
  frequency: Frequency;
  seats: number;
  members: { walletId: string; displayName: string; seat: number }[];
  currentRound: {
    number: number;
    beneficiary: string;
    contributions: { walletId: string; amountSat: number }[];
    paidOut: boolean;
  } | null;
  rounds: { number: number; paidOut: boolean; beneficiary: string }[];
  filled: number;
  complete: boolean;
};

const STORAGE = {
  secret: "tonti.secret",
  locale: "tonti.locale",
  currency: "tonti.currency",
  pin: "tonti.pin",
  name: "tonti.name",
};

export function App() {
  const [locale, setLocale] = useState<Locale>("fr");
  const [currency, setCurrency] = useState<Currency>("XOF");
  const [secret, setSecret] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [circleIds, setCircleIds] = useState<string[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [view, setView] = useState<View>("home");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinHash, setPinHash] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(true);
  const [ready, setReady] = useState(false);

  const t = copy[locale];

  const loadWallet = useCallback(async (key: string) => {
    const data = await api<{
      wallet: Wallet;
      payments: Payment[];
      tontines: string[];
    }>("/api/wallet", { secret: key });
    setWallet(data.wallet);
    setPayments(data.payments);
    setCircleIds(data.tontines);
    return data;
  }, []);

  useEffect(() => {
    const storedLocale = window.localStorage.getItem(STORAGE.locale) as Locale | null;
    const storedCurrency = window.localStorage.getItem(STORAGE.currency) as Currency | null;
    const storedSecret = window.localStorage.getItem(STORAGE.secret);
    const storedPin = window.localStorage.getItem(STORAGE.pin);
    setLocale(storedLocale === "en" || storedLocale === "fr" ? storedLocale : detectLocale());
    if (storedCurrency) setCurrency(storedCurrency);
    setPinHash(storedPin);
    setUnlocked(!storedPin);
    if (storedSecret) setSecret(storedSecret);
    setReady(true);
    api<Rates>("/api/rates").then(setRates).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!secret || !unlocked) return;
    loadWallet(secret).catch((err) => setError(err.message));
  }, [secret, unlocked, loadWallet]);

  useEffect(() => {
    if (!secret || !unlocked) return;
    let stop = false;
    const refresh = async () => {
      try {
        const list = await api<{ tontines: Circle[] }>("/api/tontine", { secret });
        if (!stop) setCircles(list.tontines);
      } catch {
        // Keep the last known list if the request fails.
      }
    };
    refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [secret, unlocked]);

  const myCircles = useMemo(
    () => circles.filter((item) => circleIds.includes(item.id) || item.members.some((m) => m.walletId === wallet?.id)),
    [circles, circleIds, wallet]
  );
  const sandaga = circles.find((item) => item.code === "SANDAGA") || null;
  const active = circles.find((item) => item.id === activeId) || myCircles[0] || sandaga;
  const localeTag = locale === "fr" ? "fr-FR" : "en-GB";

  function money(sats: number) {
    if (!rates) return formatSats(sats, localeTag);
    return formatFiat(sats, currency, rates, localeTag);
  }

  async function persistSecret(value: string) {
    window.localStorage.setItem(STORAGE.secret, value);
    setSecret(value);
  }

  async function handleCreate(name: string) {
    setBusy(true);
    setError("");
    try {
      const data = await api<{ secret: string; wallet: Wallet }>("/api/wallet", {
        method: "POST",
        body: { displayName: name },
      });
      window.localStorage.setItem(STORAGE.name, name);
      await persistSecret(data.secret);
      setWallet(data.wallet);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return <div className="shell" />;
  if (secret && pinHash && !unlocked) {
    return <PinLock t={t} expected={pinHash} secret={secret} onUnlock={() => setUnlocked(true)} />;
  }
  if (!secret || !wallet) {
    return (
      <Onboarding
        t={t}
        locale={locale}
        onLocale={(value) => {
          setLocale(value);
          window.localStorage.setItem(STORAGE.locale, value);
        }}
        busy={busy}
        error={error}
        onCreate={handleCreate}
        onRestore={async (key) => {
          setBusy(true);
          setError("");
          try {
            await loadWallet(key);
            await persistSecret(key);
          } catch (err) {
            setError(err instanceof Error ? err.message : t.error);
          } finally {
            setBusy(false);
          }
        }}
      />
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          {view !== "home" ? (
            <button className="icon-btn" onClick={() => setView("home")}>
              ←
            </button>
          ) : (
            <div className="logo">Tonti</div>
          )}
        </div>
        <div className="chip-row">
          <span className="badge">{t.testnet}</span>
          <button
            className="chip"
            onClick={() => {
              const next = locale === "fr" ? "en" : "fr";
              setLocale(next);
              window.localStorage.setItem(STORAGE.locale, next);
            }}
          >
            {locale === "fr" ? "EN" : "FR"}
          </button>
        </div>
      </header>

      {error ? <div className="banner error">{error}</div> : null}

      {view === "home" && (
        <Home
          t={t}
          wallet={wallet}
          money={money}
          satsLabel={formatSats(wallet.balanceSat, localeTag)}
          payments={payments}
          circle={active}
          onFaucet={async () => {
            setBusy(true);
            setError("");
            try {
              await api("/api/faucet", { method: "POST", secret });
              await loadWallet(secret);
            } catch (err) {
              setError(err instanceof Error ? err.message : t.error);
            } finally {
              setBusy(false);
            }
          }}
          busy={busy}
          onOpen={(next) => setView(next)}
          onOpenCircle={(id) => {
            setActiveId(id);
            setView("circle");
          }}
        />
      )}

      {view === "receive" && (
        <Receive
          t={t}
          secret={secret}
          currency={currency}
          rates={rates}
          localeTag={localeTag}
          onPaid={() => loadWallet(secret)}
        />
      )}

      {view === "send" && (
        <Send
          t={t}
          secret={secret}
          money={money}
          onPaid={async () => {
            await loadWallet(secret);
            setView("home");
          }}
        />
      )}

      {view === "circles" && (
        <CircleList
          t={t}
          mine={myCircles}
          sandaga={sandaga}
          walletId={wallet.id}
          money={money}
          onJoin={() => setView("join")}
          onCreate={() => setView("create")}
          onOpen={(id) => {
            setActiveId(id);
            setView("circle");
          }}
        />
      )}

      {view === "join" && (
        <JoinForm
          t={t}
          secret={secret}
          onDone={async (id) => {
            await loadWallet(secret);
            setActiveId(id);
            setView("circle");
          }}
        />
      )}

      {view === "create" && (
        <CreateForm
          t={t}
          secret={secret}
          currency={currency}
          rates={rates}
          onDone={async (id) => {
            await loadWallet(secret);
            setActiveId(id);
            setView("circle");
          }}
        />
      )}

      {view === "circle" && active && (
        <CircleDetail
          t={t}
          circle={active}
          walletId={wallet.id}
          money={money}
          secret={secret}
          onRefresh={async () => {
            const data = await api<{ tontine: Circle }>(`/api/tontine?id=${active.id}`);
            setCircles((list) => list.map((item) => (item.id === data.tontine.id ? data.tontine : item)));
            await loadWallet(secret);
          }}
        />
      )}

      {view === "settings" && (
        <Settings
          t={t}
          wallet={wallet}
          secret={secret}
          currency={currency}
          onCurrency={(value) => {
            setCurrency(value);
            window.localStorage.setItem(STORAGE.currency, value);
          }}
          onRename={async (name) => {
            await api("/api/wallet", { method: "POST", secret, body: { action: "rename", displayName: name } });
            await loadWallet(secret);
          }}
          onSetPin={async (pin) => {
            const hashed = await sha256(`${pin}:${secret}`);
            window.localStorage.setItem(STORAGE.pin, hashed);
            setPinHash(hashed);
          }}
          onLogout={() => {
            window.localStorage.removeItem(STORAGE.secret);
            window.localStorage.removeItem(STORAGE.pin);
            setSecret(null);
            setWallet(null);
            setPinHash(null);
          }}
        />
      )}

      {view === "how" && <How t={t} />}

      <nav className="tabs">
        <button className={`tab ${view === "home" ? "active" : ""}`} onClick={() => setView("home")}>
          {t.balance}
        </button>
        <button className={`tab ${["circles", "circle", "join", "create"].includes(view) ? "active" : ""}`} onClick={() => setView("circles")}>
          {t.circles}
        </button>
        <button className={`tab ${view === "how" ? "active" : ""}`} onClick={() => setView("how")}>
          {t.how}
        </button>
        <button className={`tab ${view === "settings" ? "active" : ""}`} onClick={() => setView("settings")}>
          {t.settings}
        </button>
      </nav>
    </div>
  );
}

function Onboarding({
  t,
  locale,
  onLocale,
  busy,
  error,
  onCreate,
  onRestore,
}: {
  t: Copy;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  busy: boolean;
  error: string;
  onCreate: (name: string) => void;
  onRestore: (secret: string) => void;
}) {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [restore, setRestore] = useState(false);
  return (
    <div className="shell">
      <header className="topbar">
        <div className="logo">Tonti</div>
        <button className="chip" onClick={() => onLocale(locale === "fr" ? "en" : "fr")}>
          {locale === "fr" ? "EN" : "FR"}
        </button>
      </header>
      <section className="card hero-card">
        <div className="kicker">{t.testnet}</div>
        <h1 style={{ marginTop: 10 }}>{t.tagline}</h1>
        <p className="lede">{t.intro}</p>
      </section>
      <section className="card stack">
        {restore ? (
          <>
            <label>
              {t.restoreHint}
              <textarea value={key} onChange={(e) => setKey(e.target.value)} />
            </label>
            <button className="btn" disabled={busy || !key.trim()} onClick={() => onRestore(key.trim())}>
              {t.restoreCta}
            </button>
            <button className="linkish" onClick={() => setRestore(false)}>
              {t.back}
            </button>
          </>
        ) : (
          <>
            <label>
              {t.yourName}
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Awa" />
            </label>
            <p className="hint">{t.nameHint}</p>
            <button className="btn laterite" disabled={busy} onClick={() => onCreate(name.trim() || "Awa")}>
              {t.createWallet}
            </button>
            <button className="linkish" onClick={() => setRestore(true)}>
              {t.restore}
            </button>
          </>
        )}
        {error ? <div className="banner error">{error}</div> : null}
      </section>
    </div>
  );
}

function Home({
  t,
  wallet,
  money,
  satsLabel,
  payments,
  circle,
  onFaucet,
  busy,
  onOpen,
  onOpenCircle,
}: {
  t: Copy;
  wallet: Wallet;
  money: (sats: number) => string;
  satsLabel: string;
  payments: Payment[];
  circle: Circle | null | undefined;
  onFaucet: () => void;
  busy: boolean;
  onOpen: (view: View) => void;
  onOpenCircle: (id: string) => void;
}) {
  return (
    <>
      <section className="card hero-card">
        <div className="kicker">{t.hello}, {wallet.displayName}</div>
        <div className="balance">{money(wallet.balanceSat)}</div>
        <div className="fiat">{satsLabel}</div>
        <div className="actions">
          <button className="btn laterite" onClick={() => onOpen("send")}>{t.send}</button>
          <button className="btn secondary" onClick={() => onOpen("receive")}>{t.receive}</button>
        </div>
        <div className="space" />
        <button className="btn leaf" disabled={busy} onClick={onFaucet}>
          {wallet.faucetAt ? t.faucetDone : t.faucet}
        </button>
      </section>

      <section className="card">
        <div className="topbar">
          <h3>{t.yourCircle}</h3>
          <button className="linkish" onClick={() => onOpen("circles")}>{t.next}</button>
        </div>
        {circle ? (
          <button className="item" onClick={() => onOpenCircle(circle.id)}>
            <div>
              <b>{circle.name}</b>
              <div className="meta">
                {circle.code} · {circle.filled}/{circle.seats} · {money(circle.contributionSat)}
              </div>
            </div>
            <span className="tiny">{circle.complete ? t.settled : t.pending}</span>
          </button>
        ) : (
          <p className="hint">{t.sandaga}: SANDAGA</p>
        )}
      </section>

      <section className="card">
        <h3>{t.activity}</h3>
        {payments.length === 0 ? (
          <p className="hint" style={{ marginTop: 8 }}>{t.emptyActivity}</p>
        ) : (
          <div className="list">
            {payments.slice(0, 6).map((item) => (
              <div className="item" key={item.id}>
                <div>
                  <b>{item.memo || (item.direction === "in" ? t.in : t.out)}</b>
                  <div className="meta">{new Date(item.at).toLocaleString()}</div>
                </div>
                <span className={item.direction === "in" ? "good" : "bad"}>
                  {item.direction === "in" ? "+" : "−"}
                  {money(item.amountSat)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Receive({
  t,
  secret,
  currency,
  rates,
  localeTag,
  onPaid,
}: {
  t: Copy;
  secret: string;
  currency: Currency;
  rates: Rates | null;
  localeTag: string;
  onPaid: () => void;
}) {
  const [amount, setAmount] = useState("1000");
  const [memo, setMemo] = useState("");
  const [unit, setUnit] = useState<Currency>(currency);
  const [invoice, setInvoice] = useState<{ bolt11: string; paymentHash: string; amountSat: number; paid: boolean } | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!invoice || invoice.paid) return;
    const timer = window.setInterval(async () => {
      try {
        const data = await api<{ invoice: { paid: boolean } }>(`/api/invoice?hash=${invoice.paymentHash}`);
        if (data.invoice.paid) {
          setInvoice({ ...invoice, paid: true });
          onPaid();
        }
      } catch {
        // Keep waiting.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [invoice, onPaid]);

  async function create() {
    setError("");
    try {
      const numeric = Number(amount);
      if (!numeric || numeric <= 0) throw new Error(t.requestAmount);
      const amountSat = rates ? fiatToSats(numeric, unit, rates) : Math.round(numeric);
      const data = await api<{ invoice: { bolt11: string; paymentHash: string; amountSat: number; paid: boolean } }>(
        "/api/invoice",
        { method: "POST", secret, body: { amountSat, memo } }
      );
      setInvoice(data.invoice);
      setQr(await QRCode.toDataURL(data.invoice.bolt11.toUpperCase(), {
        margin: 1,
        width: 320,
        color: { dark: "#1c140e", light: "#fffbf5" },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    }
  }

  return (
    <section className="card stack">
      <h2>{t.receive}</h2>
      {invoice ? (
        <>
          <div className="qr-wrap">{qr ? <img src={qr} alt="QR" /> : null}</div>
          <div className="banner ok">{invoice.paid ? t.paid : t.waiting}</div>
          <div className="invoice">{invoice.bolt11}</div>
          <button
            className="btn"
            onClick={async () => {
              await navigator.clipboard.writeText(invoice.bolt11);
              setCopied(true);
            }}
          >
            {copied ? t.copied : t.copyInvoice}
          </button>
        </>
      ) : (
        <>
          <label>
            {t.requestAmount}
            <div className="row">
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              <select value={unit} onChange={(e) => setUnit(e.target.value as Currency)}>
                <option>XOF</option>
                <option>GHS</option>
                <option>USD</option>
                <option>sats</option>
              </select>
            </div>
          </label>
          {rates ? <p className="hint">{formatSats(fiatToSats(Number(amount) || 0, unit, rates), localeTag)}</p> : null}
          <label>
            {t.requestMemo}
            <input value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <button className="btn laterite" onClick={create}>{t.createInvoice}</button>
        </>
      )}
      {error ? <div className="banner error">{error}</div> : null}
    </section>
  );
}

function Send({
  t,
  secret,
  money,
  onPaid,
}: {
  t: Copy;
  secret: string;
  money: (sats: number) => string;
  onPaid: () => void;
}) {
  const [bolt11, setBolt11] = useState("");
  const [preview, setPreview] = useState<{ amountSat: number; memo: string; payable: boolean } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function lookUp() {
    setError("");
    try {
      const data = await api<{ invoice: { amountSat: number; memo: string }; payable: boolean }>("/api/decode", {
        method: "POST",
        body: { bolt11 },
      });
      setPreview({ amountSat: data.invoice.amountSat, memo: data.invoice.memo, payable: data.payable });
    } catch (err) {
      setPreview(null);
      setError(err instanceof Error ? err.message : t.error);
    }
  }

  async function pay() {
    setBusy(true);
    setError("");
    try {
      await api("/api/pay", { method: "POST", secret, body: { bolt11 } });
      await onPaid();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card stack">
      <h2>{t.send}</h2>
      <p className="hint">{t.sendHint}</p>
      <label>
        {t.pasteInvoice}
        <textarea value={bolt11} onChange={(e) => setBolt11(e.target.value)} onBlur={lookUp} />
      </label>
      {preview ? (
        <div className="banner ok">
          {money(preview.amountSat)}
          {preview.memo ? ` · ${preview.memo}` : ""}
        </div>
      ) : null}
      <button className="btn laterite" disabled={busy || !bolt11.trim()} onClick={pay}>
        {busy ? t.paying : t.pay}
      </button>
      {error ? <div className="banner error">{error}</div> : null}
    </section>
  );
}

function CircleList({
  t,
  mine,
  sandaga,
  walletId,
  money,
  onJoin,
  onCreate,
  onOpen,
}: {
  t: Copy;
  mine: Circle[];
  sandaga: Circle | null;
  walletId: string;
  money: (sats: number) => string;
  onJoin: () => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="card stack">
      <h2>{t.circles}</h2>
      <div className="actions">
        <button className="btn laterite" onClick={onJoin}>{t.join}</button>
        <button className="btn secondary" onClick={onCreate}>{t.create}</button>
      </div>
      <div className="list">
        {[...mine, sandaga].filter((item, index, list): item is Circle => Boolean(item) && list.findIndex((row) => row?.id === item?.id) === index).map((item) => (
          <button className="item" key={item.id} onClick={() => onOpen(item.id)}>
            <div>
              <b>{item.name}</b>
              <div className="meta">
                {item.code} · {item.filled}/{item.seats} · {money(item.contributionSat)}
              </div>
            </div>
            <span className="tiny">{item.members.some((m) => m.walletId === walletId) ? t.yourCircle : t.join}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function JoinForm({ t, secret, onDone }: { t: Copy; secret: string; onDone: (id: string) => void }) {
  const [code, setCode] = useState("SANDAGA");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="card stack">
      <h2>{t.join}</h2>
      <label>
        {t.joinCode}
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
      </label>
      <button
        className="btn laterite"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const data = await api<{ tontine: Circle }>("/api/tontine", {
              method: "POST",
              secret,
              body: { action: "join", code },
            });
            onDone(data.tontine.id);
          } catch (err) {
            setError(err instanceof Error ? err.message : t.error);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t.joinCta}
      </button>
      {error ? <div className="banner error">{error}</div> : null}
    </section>
  );
}

function CreateForm({
  t,
  secret,
  currency,
  rates,
  onDone,
}: {
  t: Copy;
  secret: string;
  currency: Currency;
  rates: Rates | null;
  onDone: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("1000");
  const [unit, setUnit] = useState<Currency>(currency);
  const [seats, setSeats] = useState("4");
  const [frequency, setFrequency] = useState<Frequency>("weekly");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="card stack">
      <h2>{t.create}</h2>
      <label>
        {t.circleName}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Marché Sandaga" />
      </label>
      <label>
        {t.contribution}
        <div className="row">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          <select value={unit} onChange={(e) => setUnit(e.target.value as Currency)}>
            <option>XOF</option>
            <option>GHS</option>
            <option>USD</option>
            <option>sats</option>
          </select>
        </div>
      </label>
      <label>
        {t.seats}
        <input value={seats} onChange={(e) => setSeats(e.target.value)} inputMode="numeric" />
      </label>
      <label>
        {t.frequency}
        <select value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
          <option value="daily">{t.daily}</option>
          <option value="weekly">{t.weekly}</option>
          <option value="monthly">{t.monthly}</option>
        </select>
      </label>
      <button
        className="btn laterite"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const contributionSat = rates ? fiatToSats(Number(amount) || 0, unit, rates) : Math.round(Number(amount));
            const data = await api<{ tontine: Circle }>("/api/tontine", {
              method: "POST",
              secret,
              body: { name, contributionSat, seats: Number(seats), frequency },
            });
            onDone(data.tontine.id);
          } catch (err) {
            setError(err instanceof Error ? err.message : t.error);
          } finally {
            setBusy(false);
          }
        }}
      >
        {t.startCircle}
      </button>
      {error ? <div className="banner error">{error}</div> : null}
    </section>
  );
}

function CircleDetail({
  t,
  circle,
  walletId,
  money,
  secret,
  onRefresh,
}: {
  t: Copy;
  circle: Circle;
  walletId: string;
  money: (sats: number) => string;
  secret: string;
  onRefresh: () => Promise<void>;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const member = circle.members.some((item) => item.walletId === walletId);
  const round = circle.currentRound;
  const already = Boolean(round?.contributions.some((item) => item.walletId === walletId));
  const filled = circle.filled >= circle.seats;
  const mine = round?.beneficiary === walletId;
  return (
    <section className="card stack">
      <h2>{circle.name}</h2>
      <p className="hint">
        {t.invite}: <b>{circle.code}</b>
      </p>
      <div className="progress">
        <span style={{ width: `${(circle.filled / circle.seats) * 100}%` }} />
      </div>
      <p className="tiny">
        {circle.filled}/{circle.seats} · {money(circle.contributionSat)} · {t[circle.frequency]}
      </p>
      {round ? (
        <div className="banner ok">
          {t.round} {round.number}: {mine ? t.yourTurn : `${t.potGoesTo} ${circle.members.find((m) => m.walletId === round.beneficiary)?.displayName || ""}`}
          <br />
          {round.contributions.length}/{circle.filled} {t.contributed.toLowerCase()}
        </div>
      ) : circle.complete ? (
        <div className="banner ok">{t.complete}</div>
      ) : (
        <div className="banner ok">{t.waitingMembers}</div>
      )}
      <div className="list">
        {circle.members.map((item) => (
          <div className="item" key={item.walletId}>
            <div>
              <b>
                {item.displayName}
                {item.walletId === walletId ? " · you" : ""}
              </b>
              <div className="meta">#{item.seat}</div>
            </div>
            <span className="tiny">
              {round?.contributions.some((row) => row.walletId === item.walletId) ? t.settled : t.pending}
            </span>
          </div>
        ))}
      </div>
      {member && filled && round && !already && !circle.complete ? (
        <button
          className="btn laterite"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("/api/tontine", {
                method: "POST",
                secret,
                body: { action: "contribute", tontineId: circle.id },
              });
              await onRefresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : t.error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t.contribute} · {money(circle.contributionSat)}
        </button>
      ) : null}
      {!member ? (
        <button
          className="btn laterite"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              await api("/api/tontine", {
                method: "POST",
                secret,
                body: { action: "join", code: circle.code },
              });
              await onRefresh();
            } catch (err) {
              setError(err instanceof Error ? err.message : t.error);
            } finally {
              setBusy(false);
            }
          }}
        >
          {t.joinCta}
        </button>
      ) : null}
      {error ? <div className="banner error">{error}</div> : null}
    </section>
  );
}

function Settings({
  t,
  wallet,
  secret,
  currency,
  onCurrency,
  onRename,
  onSetPin,
  onLogout,
}: {
  t: Copy;
  wallet: Wallet;
  secret: string;
  currency: Currency;
  onCurrency: (value: Currency) => void;
  onRename: (name: string) => Promise<void>;
  onSetPin: (pin: string) => Promise<void>;
  onLogout: () => void;
}) {
  const [name, setName] = useState(wallet.displayName);
  const [pin, setPin] = useState("");
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  return (
    <section className="card stack">
      <h2>{t.settings}</h2>
      <label>
        {t.changeName}
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button className="btn secondary" onClick={() => onRename(name)}>{t.continue}</button>
      <label>
        {t.currency}
        <select value={currency} onChange={(e) => onCurrency(e.target.value as Currency)}>
          <option value="XOF">XOF</option>
          <option value="GHS">GHS</option>
          <option value="USD">USD</option>
          <option value="sats">sats</option>
        </select>
      </label>
      <label>
        {t.pinTitle}
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="••••" />
      </label>
      <p className="hint">{t.pinHint}</p>
      <button className="btn secondary" disabled={pin.length < 4} onClick={() => onSetPin(pin)}>
        {t.pinSave}
      </button>
      <label>
        {t.backup}
        <div className="invoice" aria-hidden={!showKey}>
          {showKey ? secret : "••••••••••••••••••••••••••••••••"}
        </div>
      </label>
      <p className="hint">{t.backupHint}</p>
      <button type="button" className="btn secondary" onClick={() => setShowKey((open) => !open)}>
        {showKey ? t.hideKey : t.showKey}
      </button>
      <button
        type="button"
        className="btn secondary"
        onClick={async () => {
          await navigator.clipboard.writeText(secret);
          setCopied(true);
        }}
      >
        {copied ? t.copied : t.copyKey}
      </button>
      <a className="btn secondary" href="/ussd">{t.ussd}</a>
      <p className="hint">{t.ussdHint}</p>
      <button className="btn" onClick={onLogout}>{t.logout}</button>
    </section>
  );
}

function How({ t }: { t: Copy }) {
  return (
    <section className="card stack">
      <h2>{t.demoTitle}</h2>
      <p>{t.demo1}</p>
      <p>{t.demo2}</p>
      <p>{t.demo3}</p>
      <p>{t.demo4}</p>
    </section>
  );
}

function PinLock({
  t,
  expected,
  secret,
  onUnlock,
}: {
  t: Copy;
  expected: string;
  secret: string;
  onUnlock: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function next(digit: string) {
    const value = (pin + digit).slice(0, 6);
    setPin(value);
    if (value.length >= 4) {
      const hashed = await sha256(`${value}:${secret}`);
      if (hashed === expected) onUnlock();
      else if (value.length === 6) {
        setError(t.error);
        setPin("");
      }
    }
  }

  return (
    <div className="shell">
      <section className="card" style={{ textAlign: "center" }}>
        <h2>{t.pinTitle}</h2>
        <div className="dots">
          {Array.from({ length: Math.max(4, pin.length) }, (_, index) => (
            <span className={`dot ${index < pin.length ? "on" : ""}`} key={index} />
          ))}
        </div>
        <div className="pin-grid">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"].map((digit) => (
            <button
              key={digit || "blank"}
              disabled={digit === ""}
              onClick={() => {
                if (digit === "←") setPin((value) => value.slice(0, -1));
                else if (digit) next(digit);
              }}
            >
              {digit}
            </button>
          ))}
        </div>
        {error ? <div className="banner error" style={{ marginTop: 16 }}>{error}</div> : null}
      </section>
    </div>
  );
}
