import { requireWallet } from "@/lib/auth";
import { fail, json } from "@/lib/http";
import { getState, claimFaucet } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const state = await getState();
    const wallet = requireWallet(state, request);
    const result = await claimFaucet(wallet.id);
    return json(result);
  } catch (error) {
    return fail(error);
  }
}
