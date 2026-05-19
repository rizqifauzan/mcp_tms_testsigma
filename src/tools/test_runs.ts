import { z } from "zod";
import type { TmsClient } from "../client.ts";
import { hybrid, mdTable, paginationFooter, type HybridResponse } from "../format.ts";

interface StatusSummary {
  status_id?: string;
  status_name?: string;
  count?: number;
}

interface TestRun {
  id: string;
  human_id?: string | null;
  title: string;
  description?: string | null;
  status?: string | null;
  test_plan_id?: string | null;
  selection_type?: string | null;
  assignee_id?: string | null;
  test_cases_count?: number | null;
  start_date?: number | null;
  end_date?: number | null;
  test_run_status_summary?: StatusSummary[] | null;
  created_at?: number;
  updated_at?: number;
  [k: string]: unknown;
}

export const listTestRunsInputSchema = {
  project_id: z.string().min(1).describe("Project UUID"),
  test_plan_id: z.string().optional().describe("Filter by parent test plan UUID"),
  search: z.string().optional().describe("Substring match on test run title"),
  page_size: z.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
};

const ListTestRunsArgs = z.object(listTestRunsInputSchema);

export async function listTestRuns(
  client: TmsClient,
  rawArgs: unknown,
): Promise<HybridResponse> {
  const args = ListTestRunsArgs.parse(rawArgs);
  const res = await client.getList<TestRun>(
    `/projects/${encodeURIComponent(args.project_id)}/test_runs`,
    {
      test_plan_id: args.test_plan_id,
      title__CONTAINS: args.search,
      page_size: args.page_size,
      cursor: args.cursor,
    },
  );

  const md = mdTable(
    ["Human ID", "Title", "Status", "Cases", "UUID"],
    res.items.map((r) => [
      r.human_id ?? "—",
      r.title,
      r.status ?? "—",
      r.test_cases_count ?? "—",
      r.id,
    ]),
  ) + paginationFooter(res.page_info);

  return hybrid({ test_runs: res.items, page_info: res.page_info }, md);
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
  const run = await client.getOne<TestRun>(
    `/projects/${encodeURIComponent(args.project_id)}/test_runs/${encodeURIComponent(args.test_run_id)}`,
  );

  const sections: string[] = [`**${run.human_id ?? run.id} — ${run.title}**`];
  if (run.description) sections.push(`\n${run.description}`);
  sections.push(
    `\nStatus: \`${run.status ?? "—"}\` · Selection: \`${run.selection_type ?? "—"}\` · Cases: ${run.test_cases_count ?? "—"}`,
  );

  if (run.test_run_status_summary && run.test_run_status_summary.length > 0) {
    const summaryMd = mdTable(
      ["Status", "Count"],
      run.test_run_status_summary.map((s) => [s.status_name ?? s.status_id ?? "—", s.count ?? 0]),
    );
    sections.push(`\n**Result Summary**\n${summaryMd}`);
  }

  return hybrid({ test_run: run }, sections.join("\n"));
}
