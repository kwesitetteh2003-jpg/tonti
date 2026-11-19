import type { LedgerEvent } from "./types";

function token(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.TONTI_BLOB_TOKEN;
}

export async function loadBlobEvents(): Promise<LedgerEvent[]> {
  const auth = token();
  if (!auth) return [];
  try {
    const { list } = await import("@vercel/blob");
    const result = await list({ prefix: "tonti-events/", token: auth });
    const events: LedgerEvent[] = [];
    for (const blob of result.blobs) {
      try {
        const response = await fetch(blob.url, {
          headers: { authorization: `Bearer ${auth}` },
          cache: "no-store",
        });
        if (!response.ok) continue;
        const parsed = (await response.json()) as LedgerEvent;
        if (parsed?.id && parsed?.type) events.push(parsed);
      } catch {
        // Skip a single damaged event file.
      }
    }
    return events;
  } catch {
    return [];
  }
}

export async function publishBlobEvent(event: LedgerEvent): Promise<void> {
  const auth = token();
  if (!auth) return;
  try {
    const { put } = await import("@vercel/blob");
    await put(`tonti-events/${event.id}.json`, JSON.stringify(event), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: auth,
      contentType: "application/json",
    });
  } catch {
    // Blob is best-effort if the token is missing or the API is unreachable.
  }
}
