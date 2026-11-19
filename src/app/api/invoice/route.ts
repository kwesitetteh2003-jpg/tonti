import { requireWallet } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { publicInvoice } from "@/lib/ledger";
import { getState, issueInvoice } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const hash = url.searchParams.get("hash") || "";
    const state = await getState();
    const invoice = state.invoices[hash];
    if (!invoice) return json({ error: "Invoice not found." }, 404);
    return json({ invoice: publicInvoice(invoice) });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    const state = await getState();
    const wallet = requireWallet(state, request);
    const body = (await request.json()) as { amountSat?: number; memo?: string };
    const amountSat = Number(body.amountSat);
    const invoice = await issueInvoice(wallet.id, amountSat, body.memo || "");
    return json({ invoice: publicInvoice(invoice) });
  } catch (error) {
    return fail(error);
  }
}
