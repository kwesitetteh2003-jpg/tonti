import { json } from "@/lib/http";
import { getState } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = await getState();
  return json({
    ok: true,
    network: "tonti-test",
    wallets: Object.keys(state.wallets).length,
    tontines: Object.keys(state.tontines).length,
  });
}
