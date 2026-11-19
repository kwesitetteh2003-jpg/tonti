import { requireWallet } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { getState, payInvoice } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const state = await getState();
    const wallet = requireWallet(state, request);
    const body = (await request.json()) as { bolt11?: string };
    if (!body.bolt11) throw new Error("Paste a Lightning invoice first.");
    const result = await payInvoice(wallet.id, body.bolt11);
    return json(result);
  } catch (error) {
    return fail(error);
  }
}
