import { z } from "zod";
import type { TmsClient, PaginatedResponse } from "../client.ts";
import { hybrid, mdTable, paginationFooter, type HybridResponse } from "../format.ts";

interface StatusSummary {
  status_id?: string;
  status_name?: string;
  count?: number;
}

interface TestRun {
  id: string;
  human_id?: string | null;
  name: string;
  description?: string | null;
  status_id?: string | null;
  test_plan_id?: string | null;
  selection_type?: string | null;
  test_run_status_summary?: StatusSummary[] | null;
  created_at?: string;
  updated_at?: string;
  [k: string]: unknown;
}

export const listTestRunsInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  test_plan_id: z.string().optional().describe("Filter by parent test plan UUID"),
  search: z.string().optional(),
  page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

const ListTestRunsArgs = z.object(listTestRunsInputSchema);

export async function listTestRuns(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = ListTestRunsArgs.parse(rawArgs);
  const res = await client.get<PaginatedResponse<TestRun>>(
    `/projects/${encodeURIComponent(args.project_id)}/test_runs`,
    {
      test_plan_id: args.test_plan_id,
      name__CONTAINS: args.search,
      page_size: args.page_size,
      cursor: args.cursor,
    },
  );

  const md = mdTable(
    ["Human ID", "Name", "Status ID", "UUID"],
    res.data.map((r) => [r.human_id ?? "—", r.name, r.status_id ?? "—", r.id]),
  ) + paginationFooter(res.page_info);

  return hybrid(res, md);
}

export const getTestRunInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  test_run_id: z.string().min(1).describe("Test run UUID or human ID"),
};

const GetTestRunArgs = z.object(getTestRunInputSchema);

export async function getTestRun(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = GetTestRunArgs.parse(rawArgs);
  const run = await client.get<TestRun>(
    `/projects/${encodeURIComponent(args.project_id)}/test_runs/${encodeURIComponent(args.test_run_id)}`,
  );

  const sections: string[] = [`**${run.human_id ?? run.id} — ${run.name}**`];
  if (run.description) sections.push(`\n${run.description}`);
  sections.push(`\nStatus: \`${run.status_id ?? "—"}\` · Selection: \`${run.selection_type ?? "—"}\``);

  if (run.test_run_status_summary && run.test_run_status_summary.length > 0) {
    const summaryMd = mdTable(
      ["Status", "Count"],
      run.test_run_status_summary.map((s) => [s.status_name ?? s.status_id ?? "—", s.count ?? 0]),
    );
    sections.push(`\n**Result Summary**\n${summaryMd}`);
  }

  return hybrid(run, sections.join("\n"));
}
