import { fail, json } from "@/lib/http";
import { decodeInvoice } from "@/lib/lightning";
import { publicInvoice } from "@/lib/ledger";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { bolt11?: string };
    if (!body.bolt11) throw new Error("Paste a Lightning invoice first.");
    const decoded = decodeInvoice(body.bolt11);
    const state = await getState();
    const local = state.invoices[decoded.paymentHash];
    return json({
      invoice: decoded,
      local: local ? publicInvoice(local) : null,
      payable: Boolean(local && !local.paidAt && local.expiresAt > Date.now()),
    });
  } catch (error) {
    return fail(error);
  }
}
