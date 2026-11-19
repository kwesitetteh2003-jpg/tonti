import { requireWallet } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { publicWallet } from "@/lib/ledger";
import { getState, openWallet, renameWallet } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const state = await getState();
    const wallet = requireWallet(state, request);
    const payments = state.payments
      .filter((item) => item.walletId === wallet.id)
      .slice(0, 40);
    const tontines = Object.values(state.tontines)
      .filter((item) => item.members.some((member) => member.walletId === wallet.id))
      .map((item) => item.id);
    return json({
      wallet: publicWallet(wallet.id, state),
      payments,
      tontines,
    });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { action?: string; displayName?: string };
    if (body.action === "rename") {
      const state = await getState();
      const wallet = requireWallet(state, request);
      await renameWallet(wallet.id, body.displayName || "");
      const next = await getState();
      return json({ wallet: publicWallet(wallet.id, next) });
    }
    const opened = await openWallet(body.displayName || "");
    const state = await getState();
    return json({
      secret: opened.secret,
      wallet: publicWallet(opened.walletId, state),
    });
  } catch (error) {
    return fail(error);
  }
}
