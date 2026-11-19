"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client";
import { copy, detectLocale, type Locale } from "@/lib/i18n";

type Wallet = { id: string; displayName: string; balanceSat: number };

const STORAGE_SECRET = "tonti.secret";

export function Ussd() {
  const [locale, setLocale] = useState<Locale>("fr");
  const [screen, setScreen] = useState("");
  const [buffer, setBuffer] = useState("");
  const [menu, setMenu] = useState<"dial" | "home" | "send" | "join" | "name">("dial");
  const [secret, setSecret] = useState<string | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const t = copy[locale];

  useEffect(() => {
    const stored = window.localStorage.getItem("tonti.locale") as Locale | null;
    setLocale(stored === "en" || stored === "fr" ? stored : detectLocale());
    const key = window.localStorage.getItem(STORAGE_SECRET);
    if (key) setSecret(key);
  }, []);

  async function load(key: string) {
    const data = await api<{ wallet: Wallet }>("/api/wallet", { secret: key });
    setWallet(data.wallet);
    setSecret(key);
    return data.wallet;
  }

  function showHome(current?: Wallet | null) {
    const w = current || wallet;
    const text =
      locale === "fr"
        ? `TONTI\nSolde: ${w ? w.balanceSat.toLocaleString("fr-FR") : "—"} sats\n${w ? w.displayName : ""}\n\n1. Recevoir des sats de test\n2. Envoyer\n3. Rejoindre SANDAGA\n4. Cotiser SANDAGA\n0. Quitter`
        : `TONTI\nBalance: ${w ? w.balanceSat.toLocaleString("en-GB") : "—"} sats\n${w ? w.displayName : ""}\n\n1. Get test sats\n2. Send\n3. Join SANDAGA\n4. Contribute SANDAGA\n0. Exit`;
    setScreen(text);
    setMenu("home");
    setBuffer("");
  }

  async function submit(choice?: string) {
    const value = (choice ?? buffer).trim();
    try {
      if (menu === "dial") {
        if (value === "*808#" || value === "808" || value === "") {
          const key = secret || window.localStorage.getItem(STORAGE_SECRET);
          if (!key) {
            setMenu("name");
            setScreen(locale === "fr" ? "Entrez un prenom puis OK" : "Enter a first name, then OK");
            setBuffer("");
            return;
          }
          const current = await load(key);
          showHome(current);
          return;
        }
        setScreen(locale === "fr" ? "Composez *808# puis OK" : "Dial *808#, then OK");
        return;
      }
      if (menu === "name") {
        const data = await api<{ secret: string; wallet: Wallet }>("/api/wallet", {
          method: "POST",
          body: { displayName: value || "Awa" },
        });
        window.localStorage.setItem(STORAGE_SECRET, data.secret);
        showHome(data.wallet);
        return;
      }
      if (menu === "send") {
        const key = secret!;
        await api("/api/pay", { method: "POST", secret: key, body: { bolt11: value } });
        const current = await load(key);
        setScreen(locale === "fr" ? "Paiement envoye." : "Payment sent.");
        setTimeout(() => showHome(current), 900);
        return;
      }
      if (menu === "join") {
        const key = secret!;
        await api("/api/tontine", { method: "POST", secret: key, body: { action: "join", code: value || "SANDAGA" } });
        const current = await load(key);
        setScreen(locale === "fr" ? "Cercle rejoint." : "Circle joined.");
        setTimeout(() => showHome(current), 900);
        return;
      }
      if (menu === "home") {
        const key = secret!;
        if (value === "1") {
          await api("/api/faucet", { method: "POST", secret: key });
          const current = await load(key);
          setScreen(
            locale === "fr"
              ? `Sats de test recus.\nNouveau solde: ${current.balanceSat.toLocaleString("fr-FR")} sats`
              : `Test sats received.\nNew balance: ${current.balanceSat.toLocaleString("en-GB")} sats`
          );
          setTimeout(() => showHome(current), 1100);
        } else if (value === "2") {
          setMenu("send");
          setScreen(locale === "fr" ? "Collez la facture, puis OK" : "Paste the invoice, then OK");
          setBuffer("");
        } else if (value === "3") {
          setMenu("join");
          setBuffer("SANDAGA");
          setScreen(locale === "fr" ? "Code du cercle:\nSANDAGA" : "Circle code:\nSANDAGA");
        } else if (value === "4") {
          const list = await api<{ tontine: { id: string } }>("/api/tontine?code=SANDAGA");
          await api("/api/tontine", {
            method: "POST",
            secret: key,
            body: { action: "contribute", tontineId: list.tontine.id },
          });
          const current = await load(key);
          setScreen(locale === "fr" ? "Cotisation envoyee." : "Contribution sent.");
          setTimeout(() => showHome(current), 1100);
        } else if (value === "0") {
          setMenu("dial");
          setScreen("");
          setBuffer("*808#");
        } else {
          showHome();
        }
      }
    } catch (error) {
      setScreen(error instanceof Error ? error.message : t.error);
      setTimeout(() => {
        if (secret) showHome();
        else {
          setMenu("dial");
          setBuffer("*808#");
        }
      }, 1400);
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <Link className="icon-btn" href="/">
          ←
        </Link>
        <button
          className="chip"
          onClick={() => {
            const next = locale === "fr" ? "en" : "fr";
            setLocale(next);
            window.localStorage.setItem("tonti.locale", next);
          }}
        >
          {locale === "fr" ? "EN" : "FR"}
        </button>
      </header>
      <section className="card">
        <h2>{t.ussd}</h2>
        <p className="hint">{t.ussdHint}</p>
        <div className="phone">
          <div className="phone-screen">{screen || (locale === "fr" ? "Composez *808#" : "Dial *808#")}</div>
          <input
            style={{ marginTop: 10, background: "#2a2320", color: "#f3eee4", border: 0 }}
            value={buffer}
            onChange={(e) => setBuffer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder={menu === "dial" ? "*808#" : ""}
          />
          <div className="phone-keys">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((digit) => (
              <button key={digit} onClick={() => setBuffer((value) => value + digit)}>
                {digit}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn secondary" style={{ flex: 1 }} onClick={() => setBuffer((value) => value.slice(0, -1))}>
              {t.back}
            </button>
            <button className="btn laterite" style={{ flex: 1 }} onClick={() => submit()}>
              OK
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
