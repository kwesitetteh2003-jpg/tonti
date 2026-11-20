import type { LedgerEvent } from "./types";

const SNAPSHOT_PATH = "tonti/ledger.json";
const EVENT_PREFIX = "tonti-events/";
const MAX_WRITE_ATTEMPTS = 8;

type Snapshot = {
  revision: number;
  events: LedgerEvent[];
};

function token(): string | undefined {
  return process.env.BLOB_READ_WRITE_TOKEN || process.env.TONTI_BLOB_TOKEN;
}

function blobOptions() {
  const auth = token();
  return auth ? { token: auth } : {};
}

export function blobConfigured(): boolean {
  return Boolean(token());
}

async function streamToText(stream: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(stream).text();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEtag(etag?: string): string | undefined {
  if (!etag) return undefined;
  const trimmed = etag.replace(/^W\//i, "").replaceAll('"', "").trim();
  return trimmed || undefined;
}

function isConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    error && typeof error === "object" && "status" in error
      ? Number((error as { status?: number }).status)
      : NaN;
  return status === 412 || status === 409 || /precondition|if-match|already exists|conflict/i.test(message);
}

function mergeEvents(base: LedgerEvent[], extra: LedgerEvent[]): LedgerEvent[] {
  const map = new Map<string, LedgerEvent>();
  for (const event of [...base, ...extra]) {
    if (event?.id && event?.type) map.set(event.id, event);
  }
  return [...map.values()].sort((left, right) => left.at - right.at || left.id.localeCompare(right.id));
}

async function readSnapshot(): Promise<{ snapshot: Snapshot; etag?: string } | null> {
  const { get } = await import("@vercel/blob");
  const result = await get(SNAPSHOT_PATH, {
    access: "private",
    useCache: false,
    ...blobOptions(),
  });
  if (!result || result.statusCode !== 200 || !result.stream) return null;
  const parsed = JSON.parse(await streamToText(result.stream)) as Partial<Snapshot>;
  const events = Array.isArray(parsed.events) ? parsed.events.filter((event) => event?.id && event?.type) : [];
  return {
    snapshot: { revision: Number(parsed.revision) || events.length, events },
    etag: normalizeEtag(result.blob?.etag),
  };
}

async function writeSnapshot(snapshot: Snapshot, etag?: string): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(SNAPSHOT_PATH, JSON.stringify(snapshot), {
    access: "private",
    addRandomSuffix: false,
    contentType: "application/json",
    allowOverwrite: true,
    ...(normalizeEtag(etag) ? { ifMatch: normalizeEtag(etag) } : {}),
    ...blobOptions(),
  });
}

async function writeEventObject(event: LedgerEvent): Promise<void> {
  const { put } = await import("@vercel/blob");
  await put(`${EVENT_PREFIX}${event.id}.json`, JSON.stringify(event), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
    ...blobOptions(),
  });
}

async function listEventBlobs(): Promise<{ url: string; pathname: string }[]> {
  const { list } = await import("@vercel/blob");
  const blobs: { url: string; pathname: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({
      prefix: EVENT_PREFIX,
      cursor,
      limit: 1000,
      ...blobOptions(),
    });
    for (const blob of page.blobs) blobs.push({ url: blob.url, pathname: blob.pathname });
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return blobs;
}

async function loadLegacyEvents(): Promise<LedgerEvent[]> {
  const auth = token();
  const blobs = await listEventBlobs();
  const events: LedgerEvent[] = [];
  for (const blob of blobs) {
    try {
      const { get } = await import("@vercel/blob");
      const result = await get(blob.pathname, {
        access: "private",
        useCache: false,
        ...blobOptions(),
      });
      if (!result || result.statusCode !== 200 || !result.stream) {
        if (!auth) continue;
        const response = await fetch(blob.url, {
          headers: { authorization: `Bearer ${auth}` },
          cache: "no-store",
        });
        if (!response.ok) continue;
        const parsed = (await response.json()) as LedgerEvent;
        if (parsed?.id && parsed?.type) events.push(parsed);
        continue;
      }
      const parsed = JSON.parse(await streamToText(result.stream)) as LedgerEvent;
      if (parsed?.id && parsed?.type) events.push(parsed);
    } catch {
      // Skip a single damaged event file.
    }
  }
  return mergeEvents([], events);
}

async function migrateSnapshot(): Promise<Snapshot> {
  const events = await loadLegacyEvents();
  const snapshot: Snapshot = { revision: events.length, events };
  if (events.length) {
    try {
      await writeSnapshot(snapshot);
    } catch (error) {
      if (!isConflict(error)) throw error;
    }
  }
  const latest = await readSnapshot();
  return latest?.snapshot ?? snapshot;
}

/**
 * Load the shared production ledger. The snapshot is read by exact path from
 * origin storage (no CDN cache). A one-time migration builds that snapshot
 * from any existing per-event objects.
 */
export async function loadBlobEvents(): Promise<LedgerEvent[]> {
  if (!blobConfigured()) return [];
  const current = await readSnapshot();
  if (current) return current.snapshot.events;
  return (await migrateSnapshot()).events;
}

/**
 * Append events to the shared snapshot with compare-and-swap, unique event
 * objects, and a read-after-write check. Throws if the write cannot be
 * confirmed, so a request never looks successful when the log was not stored.
 */
export async function appendBlobEvents(events: LedgerEvent[]): Promise<LedgerEvent[] | null> {
  if (!blobConfigured()) return null;
  const fresh = events.filter((event) => event?.id && event?.type);
  if (!fresh.length) return loadBlobEvents();

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
    const current = (await readSnapshot()) ?? { snapshot: { revision: 0, events: [] }, etag: undefined };
    const merged = mergeEvents(current.snapshot.events, fresh);
    const alreadyPresent = fresh.every((event) => current.snapshot.events.some((item) => item.id === event.id));
    if (alreadyPresent) return current.snapshot.events;

    const next: Snapshot = { revision: current.snapshot.revision + 1, events: merged };
    try {
      for (const event of fresh) {
        await writeEventObject(event);
      }
      await writeSnapshot(next, current.etag);
      const verified = await readSnapshot();
      if (verified && fresh.every((event) => verified.snapshot.events.some((item) => item.id === event.id))) {
        return verified.snapshot.events;
      }
    } catch (error) {
      lastError = error;
      if (!isConflict(error) && attempt === MAX_WRITE_ATTEMPTS - 1) throw error;
    }
    await sleep(40 * (attempt + 1));
  }

  // Last resort: merge a fresh uncached read and overwrite the snapshot.
  // Unique event files have already been written when possible.
  const fallback = (await readSnapshot()) ?? { snapshot: { revision: 0, events: [] }, etag: undefined };
  const merged = mergeEvents(fallback.snapshot.events, fresh);
  const next: Snapshot = { revision: fallback.snapshot.revision + 1, events: merged };
  await writeSnapshot(next);
  const verified = await readSnapshot();
  if (verified && fresh.every((event) => verified.snapshot.events.some((item) => item.id === event.id))) {
    return verified.snapshot.events;
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Could not confirm the ledger write.");
}
