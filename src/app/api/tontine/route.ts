import { requireWallet } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { publicTontine } from "@/lib/ledger";
import { contribute, getState, joinTontine, openTontine } from "@/lib/store";
import type { Frequency } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const state = await getState();
    const id = url.searchParams.get("id") || "";
    const code = (url.searchParams.get("code") || "").trim().toUpperCase();
    if (id || code) {
      const tontine = id ? state.tontines[id] : state.tontines[state.codes[code]];
      if (!tontine) return json({ error: "Circle not found." }, 404);
      return json({ tontine: publicTontine(tontine, state) });
    }
    const list = Object.values(state.tontines)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20)
      .map((item) => publicTontine(item, state));
    return json({ tontines: list });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const state = await getState();
    const wallet = requireWallet(state, request);
    const body = (await request.json()) as {
      action?: string;
      name?: string;
      contributionSat?: number;
      frequency?: Frequency;
      seats?: number;
      code?: string;
      tontineId?: string;
    };
    if (body.action === "join") {
      const tontine = await joinTontine(wallet.id, body.code || "");
      const next = await getState();
      return json({ tontine: publicTontine(tontine, next) });
    }
    if (body.action === "contribute") {
      const tontine = await contribute(wallet.id, body.tontineId || "");
      const next = await getState();
      return json({ tontine: publicTontine(tontine, next) });
    }
    const tontine = await openTontine(wallet.id, {
      name: body.name || "",
      contributionSat: Number(body.contributionSat),
      frequency: body.frequency || "weekly",
      seats: Number(body.seats || 4),
    });
    const next = await getState();
    return json({ tontine: publicTontine(tontine, next) });
  } catch (error) {
    return fail(error);
  }
}
