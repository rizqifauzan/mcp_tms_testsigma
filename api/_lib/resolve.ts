import type { TmsClient, ListResult } from "./client.js";
import { memo } from "./cache.js";
import { LOOKUP_CACHE_TTL_MS } from "./config.js";

interface NamedRow {
  id: string;
  name: string;
  [k: string]: unknown;
}

interface UserRow {
  id: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  status?: string;
  [k: string]: unknown;
}

function userDisplayName(u: UserRow): string {
  const full = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return full || u.email || u.id;
}

function pickUserByName(rows: UserRow[], input: string): string {
  const lower = input.toLowerCase();
  // exact match against email, first_name + last_name, or "First Last"
  const candidates = rows.filter((u) => {
    if (u.email && u.email.toLowerCase() === lower) return true;
    const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim().toLowerCase();
    if (full && full === lower) return true;
    if (u.first_name && u.first_name.toLowerCase() === lower) return true;
    return false;
  });
  if (candidates.length === 1) return candidates[0]!.id;
  if (candidates.length > 1) {
    throw new Error(
      `Ambiguous user "${input}". Matches: ${candidates.map(userDisplayName).join(", ")}`,
    );
  }
  // fall back to substring match
  const partial = rows.filter((u) => {
    if (u.email && u.email.toLowerCase().includes(lower)) return true;
    const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim().toLowerCase();
    return full.includes(lower);
  });
  if (partial.length === 1) return partial[0]!.id;
  if (partial.length > 1) {
    throw new Error(
      `Ambiguous user "${input}". Matches: ${partial.map(userDisplayName).join(", ")}`,
    );
  }
  throw new Error(
    `User "${input}" not found. Try an email like rizqi.ahmad@trycata.com or first name.`,
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

async function fetchRows(
  client: TmsClient,
  apiKey: string,
  cacheKey: string,
  fetcher: () => Promise<ListResult<NamedRow>>,
): Promise<NamedRow[]> {
  return memo(`${apiKey}::${cacheKey}`, LOOKUP_CACHE_TTL_MS, async () => {
    const res = await fetcher();
    return res.items;
  });
}

function pickByName(rows: NamedRow[], name: string, label: string): string {
  const lower = name.toLowerCase();
  const exact = rows.filter((r) => r.name.toLowerCase() === lower);
  if (exact.length === 1) return exact[0]!.id;
  if (exact.length > 1) {
    throw new Error(`Ambiguous ${label} name "${name}" matches ${exact.length} rows`);
  }
  const partial = rows.filter((r) => r.name.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0]!.id;
  if (partial.length > 1) {
    throw new Error(
      `Ambiguous ${label} name "${name}". Matches: ${partial.map((r) => r.name).join(", ")}`,
    );
  }
  throw new Error(
    `${label} "${name}" not found. Available: ${rows.map((r) => r.name).join(", ") || "(none)"}`,
  );
}

/**
 * Resolve a UUID-or-name string into a UUID. If the input is already a UUID,
 * returns it unchanged. Otherwise looks up by name (case-insensitive,
 * exact match preferred, partial only when unambiguous).
 */
export async function resolveLookup(
  client: TmsClient,
  apiKey: string,
  kind: "test_case_status" | "test_case_priority" | "test_case_type" | "test_case_automation_type" | "test_run_status" | "user",
  input: string,
): Promise<string> {
  if (isUuid(input)) return input;

  let rows: NamedRow[];
  switch (kind) {
    case "test_case_status":
      rows = await fetchRows(client, apiKey, "test_case_statuses", () =>
        client.getList<NamedRow>("/test_cases/statuses", { page_size: 100 }),
      );
      break;
    case "test_case_priority":
      rows = await fetchRows(client, apiKey, "test_case_priorities", () =>
        client.getList<NamedRow>("/test_cases/priorities", { page_size: 100 }),
      );
      break;
    case "test_case_type":
      rows = await fetchRows(client, apiKey, "test_case_types", () =>
        client.getList<NamedRow>("/test_cases/types", { page_size: 100 }),
      );
      break;
    case "test_case_automation_type":
      rows = await fetchRows(client, apiKey, "test_case_automation_types", () =>
        client.getList<NamedRow>("/test_cases/automation_types", { page_size: 100 }),
      );
      break;
    case "test_run_status":
      rows = await fetchRows(client, apiKey, "test_run_statuses", () =>
        client.getList<NamedRow>("/test_runs/statuses", { page_size: 100 }),
      );
      break;
    case "user": {
      const users = await memo(`${apiKey}::users`, LOOKUP_CACHE_TTL_MS, async () => {
        const r = await client.getList<UserRow>("/users", { page_size: 200 });
        return r.items;
      });
      return pickUserByName(users, input);
    }
  }
  return pickByName(rows, input, kind);
}

/**
 * Pick a default UUID for a lookup table when the user didn't specify one.
 * Prefers a row whose name matches `preferredNames` (case-insensitive),
 * otherwise falls back to the first row.
 */
export async function defaultLookup(
  client: TmsClient,
  apiKey: string,
  kind: "test_case_status" | "test_case_priority" | "test_case_type" | "test_case_automation_type",
  preferredNames: string[] = [],
): Promise<string> {
  let rows: NamedRow[];
  switch (kind) {
    case "test_case_status":
      rows = await fetchRows(client, apiKey, "test_case_statuses", () =>
        client.getList<NamedRow>("/test_cases/statuses", { page_size: 100 }),
      );
      break;
    case "test_case_priority":
      rows = await fetchRows(client, apiKey, "test_case_priorities", () =>
        client.getList<NamedRow>("/test_cases/priorities", { page_size: 100 }),
      );
      break;
    case "test_case_type":
      rows = await fetchRows(client, apiKey, "test_case_types", () =>
        client.getList<NamedRow>("/test_cases/types", { page_size: 100 }),
      );
      break;
    case "test_case_automation_type":
      rows = await fetchRows(client, apiKey, "test_case_automation_types", () =>
        client.getList<NamedRow>("/test_cases/automation_types", { page_size: 100 }),
      );
      break;
  }
  if (rows.length === 0) {
    throw new Error(`No rows found for ${kind} — cannot pick default`);
  }
  for (const wanted of preferredNames) {
    const hit = rows.find((r) => r.name.toLowerCase() === wanted.toLowerCase());
    if (hit) return hit.id;
  }
  return rows[0]!.id;
}

/**
 * Pick a default owner UUID. TMS doesn't expose a /me endpoint, and the
 * JWT `sub` claim is a service/auth identifier not present in the users
 * table (foreign key violation when used as owner_id). Falls back to the
 * first ACTIVE user.
 */
export async function defaultUser(client: TmsClient, apiKey: string): Promise<string> {
  const users = await memo(`${apiKey}::users`, LOOKUP_CACHE_TTL_MS, async () => {
    const r = await client.getList<UserRow>("/users", { page_size: 200 });
    return r.items;
  });
  const active = users.find((u) => u.status === "ACTIVE") ?? users[0];
  if (!active) {
    throw new Error("No users found in this TMS account — cannot pick a default owner.");
  }
  return active.id;
}

/**
 * Resolve a test case ID input (UUID or human ID like "GR-46") to a UUID.
 * If already a UUID, returns it unchanged. Otherwise fetches the TC detail
 * to extract its UUID. Per-call cost: one GET per non-UUID input.
 */
export async function resolveTestCaseId(
  client: TmsClient,
  projectId: string,
  input: string,
): Promise<string> {
  if (UUID_RE.test(input)) return input;
  type TC = { id: string };
  const tc = await client.getOne<TC>(
    `/projects/${encodeURIComponent(projectId)}/test_cases/${encodeURIComponent(input)}`,
  );
  return tc.id;
}

/**
 * Resolve label inputs to UUIDs. Postman doc is ambiguous on whether the
 * create_test_case body's `label_ids` field accepts names or only UUIDs —
 * for safety we resolve names → UUIDs here. If a name doesn't exist we
 * surface the error rather than silently auto-creating.
 */
export async function resolveLabels(
  client: TmsClient,
  apiKey: string,
  inputs: string[],
): Promise<string[]> {
  if (inputs.length === 0) return [];
  const rows = await fetchRows(client, apiKey, "labels", () =>
    client.getList<NamedRow>("/labels", { page_size: 200 }),
  );
  return inputs.map((input) => (isUuid(input) ? input : pickByName(rows, input, "label")));
}
