import { z } from "zod";
import type { TmsClient, PaginatedResponse } from "../client.ts";
import { memo } from "../cache.ts";
import { LOOKUP_CACHE_TTL_MS } from "../config.ts";
import { hybrid, mdTable, type HybridResponse } from "../format.ts";

interface LookupRow {
  id: string;
  name: string;
  [k: string]: unknown;
}

const LOOKUP_PATHS = {
  test_case_statuses: "/test_cases/statuses",
  test_case_priorities: "/test_cases/priorities",
  test_case_types: "/test_cases/types",
  test_case_automation_types: "/test_cases/automation_types",
  test_run_statuses: "/test_runs/statuses",
} as const;

type LookupKind = keyof typeof LOOKUP_PATHS;
const KINDS = Object.keys(LOOKUP_PATHS) as LookupKind[];

async function fetchLookup(client: TmsClient, kind: LookupKind, apiKey: string): Promise<LookupRow[]> {
  return memo(`${apiKey}::${kind}`, LOOKUP_CACHE_TTL_MS, async () => {
    const res = await client.get<PaginatedResponse<LookupRow> | LookupRow[]>(
      LOOKUP_PATHS[kind],
      { page_size: 100 },
    );
    return Array.isArray(res) ? res : res.data;
  });
}

export const listLabelOptionsInputSchema = {
  kinds: z
    .array(z.enum(KINDS as [LookupKind, ...LookupKind[]]))
    .optional()
    .describe("Which lookup tables to fetch (default: all 5)"),
};

const ListLabelOptionsArgs = z.object(listLabelOptionsInputSchema);

export function makeListLabelOptions(apiKey: string) {
  return async (client: TmsClient, rawArgs: unknown): Promise<HybridResponse> => {
    const args = ListLabelOptionsArgs.parse(rawArgs);
    const selected = args.kinds && args.kinds.length > 0 ? args.kinds : KINDS;

    const results = await Promise.all(
      selected.map(async (kind) => ({ kind, rows: await fetchLookup(client, kind, apiKey) })),
    );

    const structured: Record<string, LookupRow[]> = {};
    const mdSections: string[] = [];
    for (const { kind, rows } of results) {
      structured[kind] = rows;
      mdSections.push(
        `**${kind}**\n${mdTable(["Name", "ID"], rows.map((r) => [r.name, r.id]))}`,
      );
    }

    return hybrid(structured, mdSections.join("\n\n"));
  };
}
