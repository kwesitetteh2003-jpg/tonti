import { fail, json } from "@/lib/http";
import { getRates } from "@/lib/rates";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return json(await getRates());
  } catch (error) {
    return fail(error);
  }
}
