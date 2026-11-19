import { NextResponse } from "next/server";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(error: unknown, fallback = "Something went wrong.") {
  const message = error instanceof Error ? error.message : fallback;
  const status =
    typeof error === "object" && error && "status" in error
      ? Number((error as { status: number }).status) || 400
      : 400;
  return json({ error: message }, status);
}
